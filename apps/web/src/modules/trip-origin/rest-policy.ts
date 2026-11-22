import type { TripTransport } from "../trip-requirement/trip-requirement-contract";

export const REST_POLICY_VERSION = "roadside-rest-v1" as const;
/** Owner decision 2026-11-22 (ADR-48): when a day would not fit, the planner may shorten each roadside break to 10 minutes. */
export const COMPACT_REST_POLICY_VERSION = "roadside-rest-compact-v1" as const;
export const REST_POLICIES = [REST_POLICY_VERSION, COMPACT_REST_POLICY_VERSION] as const;
export type RestMode = "STANDARD" | "COMPACT";
export type RestProfile = TripTransport | { transport: TripTransport; compact?: boolean };
export const restProfileOf = (requirement: { transport: TripTransport; restMode?: RestMode }): RestProfile => ({ transport: requirement.transport, compact: requirement.restMode === "COMPACT" });
export const restPolicyOf = (requirement: { restMode?: RestMode }) => requirement.restMode === "COMPACT" ? COMPACT_REST_POLICY_VERSION : REST_POLICY_VERSION;
/** Seconds avoid rounding each segment into a fictitious threshold crossing. */
export function driveWithRest(drivingSeconds: number, accumulatedSeconds: number, profile: RestProfile): { restMinutes: number; accumulatedSeconds: number } {
  if (![drivingSeconds, accumulatedSeconds].every(value => Number.isFinite(value) && value >= 0)) throw new RangeError("Driving evidence must be finite and nonnegative");
  const transport = typeof profile === "string" ? profile : profile.transport;
  const breakMinutes = typeof profile === "object" && profile.compact ? 10 : 15;
  const threshold = (transport === "CAR" ? 120 : 90) * 60;
  const total = drivingSeconds + accumulatedSeconds;
  // At an exact threshold at the endpoint, no final rest. If the next segment
  // continues, the retained threshold creates that rest before further driving.
  const breaks = drivingSeconds === 0 ? 0 : Math.max(0, Math.ceil(total / threshold) - 1);
  return { restMinutes: breaks * breakMinutes, accumulatedSeconds: total - breaks * threshold };
}

export const afterVisitDriving = (accumulatedSeconds: number, visitMinutes: number): number => visitMinutes >= 15 ? 0 : accumulatedSeconds;
