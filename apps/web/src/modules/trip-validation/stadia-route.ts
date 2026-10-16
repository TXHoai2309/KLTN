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
type RouteOptions = { apiKey?: () => string | undefined; fetcher?: typeof fetch; timeoutMs?: number };
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

/** One server-side route snapshot. No retry and no fallback to another vehicle. */
export async function getTravelRoute(input: RouteInput, options: RouteOptions = {}): Promise<TravelRoute> {
  const costing = toStadiaCosting(input.vehicle);
  if (!isValidMapCoordinate(input.origin) || !isValidMapCoordinate(input.destination)) return unavailable();
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10_000) throw new RangeError("Invalid routing timeout");
  try {
    const key = (options.apiKey ?? (() => process.env.STADIA_MAPS_API_KEY))();
    if (!key) return unavailable();
    const response = await (options.fetcher ?? fetch)("https://api.stadiamaps.com/route/v1", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Stadia-Auth ${key}` },
      body: JSON.stringify({ locations: [
        { lat: input.origin.latitude, lon: input.origin.longitude, type: "break" },
        { lat: input.destination.latitude, lon: input.destination.longitude, type: "break" },
      ], costing, units: "kilometers" }),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!response.ok) { await response.body?.cancel().catch(() => undefined); return unavailable(); }
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" || !("trip" in payload)) return unavailable();
    const trip = payload.trip as { summary?: { time?: unknown; length?: unknown }; legs?: { shape?: unknown }[] } | undefined;
    const durationSeconds = trip?.summary?.time;
    if (typeof durationSeconds !== "number" || !Number.isFinite(durationSeconds) || durationSeconds < 0) return unavailable();
    const distance = trip?.summary?.length;
    const shape = trip?.legs?.[0]?.shape;
    const geometry = typeof shape === "string" ? decodeRouteLine(shape) : undefined;
    return { kind: "ok", durationSeconds,
      ...(typeof distance === "number" && Number.isFinite(distance) && distance >= 0 ? { distanceMeters: Math.round(distance * 1000) } : {}),
      ...(geometry ? { geometry } : {}),
    };
  } catch {
    return unavailable();
  }
}

/** One leg only; the returned route is the snapshot used by this check. */
export async function checkTravelLeg(input: RouteInput & VisitPair, options: RouteOptions = {}) {
  const route = await getTravelRoute(input, options);
  return { route, check: checkTravelTime(input, route) };
}
