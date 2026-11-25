import type { TripTransport } from "../trip-requirement/trip-requirement-contract";

/** Geographic proximity for ordering only; never evidence of road distance or time. */
export function haversine(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const rad = (x: number) => x * Math.PI / 180;
  const h = Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

/** Owner-approved 2026-11-07. Provider free-flow times gave 76-91 km/h on Hà Giang mountain roads. */
export const MAX_AVERAGE_KMH: Record<TripTransport, number> = { CAR: 50, MOTORCYCLE: 40 };
type Point = { latitude: number; longitude: number };
/** ADR-55 estimate for ordering and day fitting only, never shown or saved: straight line × road winding (long legs use main roads). */
export function estimatedRoadKm(a: Point, b: Point): number {
  const km = haversine(a, b);
  return km * (km > 60 ? 1.3 : 1.5);
}
export const estimateSeconds = (a: Point, b: Point, transport: TripTransport) => Math.ceil(estimatedRoadKm(a, b) / MAX_AVERAGE_KMH[transport] * 3600);
