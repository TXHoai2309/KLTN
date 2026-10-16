import type { VisitCheckStatus } from "./visit-constraints";

export type VisitPair = {
  previousVisit: { visitId: string; startMinute: number; plannedDurationMinutes: number };
  nextVisit: { visitId: string; startMinute: number };
};
type RouteDuration = { kind: "ok"; durationSeconds: number } | { kind: "unavailable" };
type TravelTimeReason = "TRAVEL_TIME_MET" | "TRAVEL_TIME_SHORT" | "ROUTE_UNAVAILABLE" | "VISIT_TIME_INVALID";
type TravelTimeResult = { status: VisitCheckStatus; affectedVisitId: string; reason: TravelTimeReason };

/** Compare a single route snapshot with two adjacent visits on the same local trip day. */
export function checkTravelTime(visits: VisitPair, route: RouteDuration): TravelTimeResult {
  const { previousVisit, nextVisit } = visits;
  const affectedVisitId = nextVisit.visitId;
  const validMinute = (value: number) => Number.isSafeInteger(value) && value >= 0 && value < 1440;
  if (!validMinute(previousVisit.startMinute) || !validMinute(nextVisit.startMinute)
    || !Number.isSafeInteger(previousVisit.plannedDurationMinutes) || previousVisit.plannedDurationMinutes < 1
    || previousVisit.startMinute + previousVisit.plannedDurationMinutes > 1440) {
    return { status: "INSUFFICIENT_DATA", affectedVisitId, reason: "VISIT_TIME_INVALID" };
  }
  if (route.kind !== "ok" || !Number.isFinite(route.durationSeconds) || route.durationSeconds < 0) {
    return { status: "INSUFFICIENT_DATA", affectedVisitId, reason: "ROUTE_UNAVAILABLE" };
  }
  const availableSeconds = (nextVisit.startMinute - previousVisit.startMinute - previousVisit.plannedDurationMinutes) * 60;
  return availableSeconds >= route.durationSeconds
    ? { status: "PASS", affectedVisitId, reason: "TRAVEL_TIME_MET" }
    : { status: "VIOLATION", affectedVisitId, reason: "TRAVEL_TIME_SHORT" };
}
