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
/** D2: calibrated mountain winding factor from real c6be04d7 road ratios (median 1.89). */
export const DEFAULT_WINDING_FACTOR = 2.0;
export const MIN_CALIBRATED_WINDING_FACTOR = 1.5;
export const MAX_CALIBRATED_WINDING_FACTOR = 3.5;

export function clampWindingFactor(factor: number): number {
  if (!Number.isFinite(factor)) return DEFAULT_WINDING_FACTOR;
  return Math.min(MAX_CALIBRATED_WINDING_FACTOR, Math.max(MIN_CALIBRATED_WINDING_FACTOR, factor));
}

export function calibrateWindingFactor(
  samples: readonly { from: Point; to: Point; distanceMeters: number | null | undefined }[],
  fallback = DEFAULT_WINDING_FACTOR,
): number {
  const ratios: number[] = [];
  for (const sample of samples) {
    if (sample.distanceMeters == null || !Number.isFinite(sample.distanceMeters) || sample.distanceMeters <= 0) continue;
    const airKm = haversine(sample.from, sample.to);
    if (airKm <= 0.5) continue;
    const ratio = sample.distanceMeters / 1000 / airKm;
    if (Number.isFinite(ratio) && ratio > 0) ratios.push(ratio);
  }
  if (ratios.length === 0) return fallback;
  ratios.sort((a, b) => a - b);
  const mid = Math.floor(ratios.length / 2);
  const median = ratios.length % 2 === 1 ? ratios[mid]! : (ratios[mid - 1]! + ratios[mid]!) / 2;
  return clampWindingFactor(median);
}

/** D2 estimate for ordering and day fitting only, never shown or saved: straight line × winding factor (default 2.0, calibrated [1.5, 3.5]). */
export function estimatedRoadKm(a: Point, b: Point, windingFactor = DEFAULT_WINDING_FACTOR): number {
  return haversine(a, b) * clampWindingFactor(windingFactor);
}

export const estimateSeconds = (
  a: Point,
  b: Point,
  transport: TripTransport,
  windingFactor = DEFAULT_WINDING_FACTOR,
) => Math.ceil((estimatedRoadKm(a, b, windingFactor) / MAX_AVERAGE_KMH[transport]) * 3600);

export function cappedDurationSeconds(
  durationSeconds: number,
  distanceMeters: number | null | undefined,
  transport: TripTransport,
): number {
  return distanceMeters == null
    ? durationSeconds
    : Math.max(durationSeconds, Math.ceil(distanceMeters / 1000 / MAX_AVERAGE_KMH[transport] * 3600));
}
