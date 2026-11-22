import "server-only";
import { mapsProviderFromEnv } from "../map/maps-provider";

import { isValidMapCoordinate, type MapCoordinate, type RouteGeometry } from "../map/map-model";
import { assertSupportedTransportValue } from "../trip-requirement/trip-transport-policy";
import type { StadiaRouteFailure, StadiaRouteResult } from "./stadia-route";

/** Google Routes API computeRoutes (REST v2). Server-only; the key never leaves this module's request header. */
export const GOOGLE_ROUTES_ENDPOINT = "https://routes.googleapis.com/directions/v2:computeRoutes";
/** Field mask is mandatory for computeRoutes; only the three fields the planner consumes. */
export const GOOGLE_ROUTES_FIELD_MASK = "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline";
export const MAX_GOOGLE_RESPONSE_BYTES = 512 * 1024;
export type RoutingProviderName = "STADIA" | "GOOGLE";

/** Compatibility export; selection belongs to the shared website flag. */
export const routingProviderFromEnv = mapsProviderFromEnv;

export function toGoogleTravelMode(vehicle: unknown): "DRIVE" | "TWO_WHEELER" {
  return assertSupportedTransportValue(vehicle) === "CAR" ? "DRIVE" : "TWO_WHEELER";
}

/** Google encoded polyline algorithm: precision 1e5. */
function decodeGooglePolyline(encoded: string): RouteGeometry | undefined {
  if (!encoded || encoded.length > 200_000) return undefined;
  const coordinates: [number, number][] = [];
  let index = 0; let lat = 0; let lon = 0;
  const read = (): number | undefined => {
    let value = 0; let shift = 0;
    while (index < encoded.length && shift <= 30) {
      const byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63) return undefined;
      value |= (byte & 31) << shift;
      if (!(byte & 32)) return value & 1 ? ~(value >> 1) : value >> 1;
      shift += 5;
    }
    return undefined;
  };
  while (index < encoded.length) {
    const dLat = read(); const dLon = read();
    if (dLat === undefined || dLon === undefined) return undefined;
    lat += dLat; lon += dLon;
    const point: [number, number] = [lon / 1e5, lat / 1e5];
    if (!isValidMapCoordinate({ longitude: point[0], latitude: point[1] })) return undefined;
    coordinates.push(point);
  }
  return coordinates.length >= 2 ? { type: "LineString", coordinates } : undefined;
}

type GoogleRouteInput = { origin: MapCoordinate | null | undefined; destination: MapCoordinate | null | undefined; vehicle: unknown };
export type GoogleRouteOptions = { apiKey?: () => string | undefined | Promise<string | undefined>; fetcher?: typeof fetch; timeoutMs?: number; signal?: AbortSignal };

/** Single HTTP boundary for Google routing. One request per pair, no retry, no vehicle fallback, no cache. */
export async function requestGoogleRoute(input: GoogleRouteInput, options: GoogleRouteOptions = {}): Promise<StadiaRouteResult> {
  const missing = (reason: StadiaRouteFailure): StadiaRouteResult => ({ kind: "unavailable", reason });
  let travelMode: ReturnType<typeof toGoogleTravelMode>;
  try { travelMode = toGoogleTravelMode(input.vehicle); } catch { return missing("UNSUPPORTED_MODE"); }
  if (!isValidMapCoordinate(input.origin) || !isValidMapCoordinate(input.destination)) return missing("INVALID_RESPONSE");
  const timeoutMs = options.timeoutMs ?? 40_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 40_000) throw new RangeError("Invalid routing timeout");
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let interrupted: (() => void) | undefined;
  const cancelReader = () => { void reader?.cancel().catch(() => undefined); };
  const timer = setTimeout(abort, timeoutMs);
  const cancelled = new Promise<StadiaRouteResult>(resolve => {
    interrupted = () => { cancelReader(); resolve(missing("TIMEOUT")); };
    controller.signal.addEventListener("abort", interrupted, { once: true });
    if (controller.signal.aborted) interrupted();
  });
  const request = async (): Promise<StadiaRouteResult> => {
    try {
      if (controller.signal.aborted) return missing("TIMEOUT");
      const key = await (options.apiKey ?? (() => process.env.GOOGLE_MAPS_API_KEY))();
      if (!key?.trim()) return missing("NOT_CONFIGURED");
      const response = await (options.fetcher ?? ((url, init) => globalThis.fetch(url, init)))(GOOGLE_ROUTES_ENDPOINT, {
        method: "POST", redirect: "error", cache: "no-store", signal: controller.signal,
        headers: { "content-type": "application/json", "x-goog-api-key": key, "x-goog-fieldmask": GOOGLE_ROUTES_FIELD_MASK },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: input.origin!.latitude, longitude: input.origin!.longitude } } },
          destination: { location: { latLng: { latitude: input.destination!.latitude, longitude: input.destination!.longitude } } },
          travelMode,
        }),
      });
      if (controller.signal.aborted || !response.ok) {
        void response.body?.cancel().catch(() => undefined);
        return missing(controller.signal.aborted ? "TIMEOUT" : "UNAVAILABLE");
      }
      reader = response.body?.getReader();
      if (!reader) return missing("INVALID_RESPONSE");
      let text = "", bytes = 0;
      const decoder = new TextDecoder("utf-8", { fatal: true });
      const bodyReader = reader;
      let payload: unknown;
      try {
        while (true) {
          const next = await bodyReader.read();
          if (controller.signal.aborted) return missing("TIMEOUT");
          if (next.done) break;
          bytes += next.value.byteLength;
          if (bytes > MAX_GOOGLE_RESPONSE_BYTES) { cancelReader(); return missing("INVALID_RESPONSE"); }
          text += decoder.decode(next.value, { stream: true });
        }
        payload = JSON.parse(text + decoder.decode());
      } catch { cancelReader(); return missing(controller.signal.aborted ? "TIMEOUT" : "INVALID_RESPONSE"); }
      finally { bodyReader.releaseLock(); reader = undefined; }
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) return missing("INVALID_RESPONSE");
      const routes = (payload as { routes?: unknown }).routes;
      if (routes === undefined) return missing("NO_ROUTE");
      if (!Array.isArray(routes)) return missing("INVALID_RESPONSE");
      if (routes.length === 0) return missing("NO_ROUTE");
      const route = routes[0] as { duration?: unknown; distanceMeters?: unknown; polyline?: { encodedPolyline?: unknown } } | null;
      if (!route || typeof route !== "object" || typeof route.duration !== "string") return missing("INVALID_RESPONSE");
      const match = /^(\d+(?:\.\d{1,9})?)s$/.exec(route.duration);
      const durationSeconds = match ? Number(match[1]) : NaN;
      if (!Number.isFinite(durationSeconds)) return missing("INVALID_RESPONSE");
      const distance = route.distanceMeters;
      const distanceMeters = typeof distance === "number" && Number.isFinite(distance) && distance >= 0 ? distance : undefined;
      const encoded = route.polyline?.encodedPolyline;
      const geometry = typeof encoded === "string" ? decodeGooglePolyline(encoded) : undefined;
      return { kind: "ok", durationSeconds,
        ...(distanceMeters !== undefined ? { distanceMeters } : {}),
        ...(geometry ? { geometry } : {}),
      };
    } catch { return missing(controller.signal.aborted ? "TIMEOUT" : "UNAVAILABLE"); }
  };
  try { return await Promise.race([request(), cancelled]); }
  finally {
    clearTimeout(timer); options.signal?.removeEventListener("abort", abort);
    if (interrupted) controller.signal.removeEventListener("abort", interrupted);
  }
}
