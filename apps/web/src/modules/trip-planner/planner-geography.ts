import type { PlannerCandidate } from "./planner-candidates";

/** Geographic proximity for ordering only; never evidence of road distance or time. */
export function haversine(a: PlannerCandidate, b: PlannerCandidate): number {
  const rad = (x: number) => x * Math.PI / 180;
  const h = Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
