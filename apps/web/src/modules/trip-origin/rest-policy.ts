import type { TripTransport } from "../trip-requirement/trip-requirement-contract";

export const REST_POLICY_VERSION = "roadside-rest-v1" as const;
/** Seconds avoid rounding each segment into a fictitious threshold crossing. */
export function driveWithRest(drivingSeconds: number, accumulatedSeconds: number, transport: TripTransport): { restMinutes: number; accumulatedSeconds: number } {
  if (![drivingSeconds, accumulatedSeconds].every(value => Number.isFinite(value) && value >= 0)) throw new RangeError("Driving evidence must be finite and nonnegative");
  const threshold = (transport === "CAR" ? 120 : 90) * 60;
  const total = drivingSeconds + accumulatedSeconds;
  // At an exact threshold at the endpoint, no final rest. If the next segment
  // continues, the retained threshold creates that rest before further driving.
  const breaks = drivingSeconds === 0 ? 0 : Math.max(0, Math.ceil(total / threshold) - 1);
  return { restMinutes: breaks * 15, accumulatedSeconds: total - breaks * threshold };
}

export const afterVisitDriving = (accumulatedSeconds: number, visitMinutes: number): number => visitMinutes >= 15 ? 0 : accumulatedSeconds;
