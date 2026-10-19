import "server-only";

import { isValidMapCoordinate, type MapCoordinate, type RouteGeometry } from "../map/map-model";
import { assertSupportedTransportValue } from "../trip-requirement/trip-transport-policy";
import { checkTravelTime, type VisitPair } from "./travel-time";

export type TravelRoute =
  | { kind: "ok"; durationSeconds: number; distanceMeters?: number; geometry?: RouteGeometry }
  | { kind: "unavailable" };

type RouteInput = {
  origin: MapCoordinate | null | undefined;
  destination: MapCoordinate | null | undefined;
  vehicle: unknown;
};
type RouteOptions = { apiKey?: () => string | undefined; fetcher?: typeof fetch; timeoutMs?: number; signal?: AbortSignal };
const unavailable = (): TravelRoute => ({ kind: "unavailable" });

export function toStadiaCosting(vehicle: unknown): "auto" | "motorcycle" {
  return assertSupportedTransportValue(vehicle) === "CAR" ? "auto" : "motorcycle";
}

/** Stadia standard routing encodes each latitude/longitude delta as polyline6. */
function decodeRouteLine(shape: string): RouteGeometry | undefined {
  if (!shape || shape.length > 200_000) return undefined;
  const coordinates: [number, number][] = [];
  let index = 0; let lat = 0; let lon = 0;
  const read = (): number | undefined => {
    let value = 0; let shift = 0;
    while (index < shape.length && shift <= 30) {
      const byte = shape.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63) return undefined;
      value |= (byte & 31) << shift;
      if (!(byte & 32)) return value & 1 ? ~(value >> 1) : value >> 1;
      shift += 5;
    }
    return undefined;
  };
  while (index < shape.length) {
    const dLat = read(); const dLon = read();
    if (dLat === undefined || dLon === undefined) return undefined;
    lat += dLat; lon += dLon;
    const point: [number, number] = [lon / 1_000_000, lat / 1_000_000];
    if (!isValidMapCoordinate({ longitude: point[0], latitude: point[1] })) return undefined;
    coordinates.push(point);
  }
  return coordinates.length >= 2 ? { type: "LineString", coordinates } : undefined;
}

export type StadiaRouteFailure = "NOT_CONFIGURED" | "TIMEOUT" | "UNAVAILABLE" | "UNSUPPORTED_MODE" | "NO_ROUTE" | "INVALID_RESPONSE";
export type StadiaRouteResult = Exclude<TravelRoute, { kind: "unavailable" }> | { kind: "unavailable"; reason: StadiaRouteFailure };
export const MAX_STADIA_RESPONSE_BYTES = 512 * 1024;

/** Single HTTP boundary for US28/29B/30. No retry, vehicle fallback or shared cache. */
export async function requestStadiaRoute(input: RouteInput, options: RouteOptions = {}): Promise<StadiaRouteResult> {
  const missing = (reason: StadiaRouteFailure): StadiaRouteResult => ({ kind: "unavailable", reason });
  let costing: ReturnType<typeof toStadiaCosting>;
  try { costing = toStadiaCosting(input.vehicle); } catch { return missing("UNSUPPORTED_MODE"); }
  if (!isValidMapCoordinate(input.origin) || !isValidMapCoordinate(input.destination)) return missing("INVALID_RESPONSE");
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10_000) throw new RangeError("Invalid routing timeout");
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
      const key = (options.apiKey ?? (() => process.env.STADIA_MAPS_API_KEY))();
      if (!key) return missing("NOT_CONFIGURED");
      const response = await (options.fetcher ?? ((url, init) => globalThis.fetch(url, init)))("https://api.stadiamaps.com/route/v1", {
        method: "POST", redirect: "error", cache: "no-store", signal: controller.signal,
        headers: { "content-type": "application/json", authorization: `Stadia-Auth ${key}` },
        body: JSON.stringify({ locations: [
          { lat: input.origin!.latitude, lon: input.origin!.longitude, type: "break" },
          { lat: input.destination!.latitude, lon: input.destination!.longitude, type: "break" },
        ], costing, units: "kilometers" }),
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
          if (bytes > MAX_STADIA_RESPONSE_BYTES) { cancelReader(); return missing("INVALID_RESPONSE"); }
          text += decoder.decode(next.value, { stream: true });
        }
        payload = JSON.parse(text + decoder.decode());
      } catch { cancelReader(); return missing(controller.signal.aborted ? "TIMEOUT" : "INVALID_RESPONSE"); }
      finally { bodyReader.releaseLock(); reader = undefined; }
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) return missing("INVALID_RESPONSE");
      const trip = (payload as { trip?: { status?: unknown; summary?: { time?: unknown; length?: unknown }; legs?: { shape?: unknown }[] } }).trip;
      if (!trip || (trip.status !== undefined && trip.status !== 0)) return missing("NO_ROUTE");
      const durationSeconds = trip.summary?.time;
      if (typeof durationSeconds !== "number" || !Number.isFinite(durationSeconds) || durationSeconds < 0) return missing("INVALID_RESPONSE");
      const distance = trip.summary?.length;
      const distanceMeters = typeof distance === "number" && Number.isFinite(distance) && distance >= 0 ? distance * 1000 : undefined;
      const shape = trip.legs?.[0]?.shape;
      const geometry = typeof shape === "string" ? decodeRouteLine(shape) : undefined;
      return { kind: "ok", durationSeconds,
        ...(distanceMeters !== undefined && Number.isFinite(distanceMeters) ? { distanceMeters } : {}),
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

/** Preserve US29B/30's duration-only success and existing unavailable result. */
export async function getTravelRoute(input: RouteInput, options: RouteOptions = {}): Promise<TravelRoute> {
  toStadiaCosting(input.vehicle); // Existing callers reject unsupported transport.
  const result = await requestStadiaRoute(input, options);
  return result.kind === "ok" ? result : unavailable();
}

/** One leg only; the returned route is the snapshot used by this check. */
export async function checkTravelLeg(input: RouteInput & VisitPair, options: RouteOptions = {}) {
  const route = await getTravelRoute(input, options);
  return { route, check: checkTravelTime(input, route) };
}
