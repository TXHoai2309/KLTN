import { DEFAULT_DESTINATION_AREA } from "../destination/destination-categories";
import type { TripRequirementInput } from "../trip-requirement/trip-requirement-contract";
import { interestScore, type PlannerCandidate } from "./planner-candidates";
import { haversine } from "./planner-geography";

const EPSILON = 1e-8;

/** Bounded geographic heuristic only. These costs never become road metrics or clocks. */
export function orderPlannerCandidates(requirement: TripRequirementInput, candidates: readonly PlannerCandidate[], budget: number): PlannerCandidate[] {
  const interests = new Map(candidates.map(candidate => [candidate.id, interestScore(candidate, requirement.interests)]));
  const compare = (a: PlannerCandidate, b: PlannerCandidate): number =>
    interests.get(b.id)! - interests.get(a.id)! || a.latitude - b.latitude || a.longitude - b.longitude || a.name.localeCompare(b.name, "vi") || a.id.localeCompare(b.id, "en");
  const pool = [...candidates].sort(compare);
  if (budget === 0) return pool;
  const distances = new Map(pool.map(from => [from.id, new Map(pool.map(to => [to.id, haversine(from, to)]))]));
  const edge = (from: PlannerCandidate, to: PlannerCandidate): number => distances.get(from.id)!.get(to.id)! -
    (from.area === to.area && from.area !== DEFAULT_DESTINATION_AREA ? 2 : 0);
  const nearest = (from: PlannerCandidate, available: readonly PlannerCandidate[]): PlannerCandidate => {
    let best = available[0]!;
    for (const next of available.slice(1)) {
      const difference = edge(from, next) - interests.get(next.id)! * 5 - edge(from, best) + interests.get(best.id)! * 5;
      if (difference < -EPSILON || (Math.abs(difference) <= EPSILON && compare(next, best) < 0)) best = next;
    }
    return best;
  };
  let bestPath: PlannerCandidate[] = [], bestCost = Infinity;
  // Try every eligible start, rather than letting a database ID anchor the whole trip.
  // At most 64 starts and 28 visits; no provider calls or exhaustive tour search.
  for (const start of pool) {
    const path = [start], available = pool.filter(candidate => candidate.id !== start.id);
    while (path.length < budget && available.length) {
      const next = nearest(path[path.length - 1]!, available);
      path.push(next);
      available.splice(available.indexOf(next), 1);
    }
    // There is no user origin yet. Choose a stable endpoint using interests and
    // coordinates, without claiming that endpoint is the traveler's actual origin.
    if (compare(path[0]!, path[path.length - 1]!) > 0) path.reverse();
    const cost = path.reduce((sum, candidate, index) => sum - interests.get(candidate.id)! * 5 + (index ? edge(path[index - 1]!, candidate) : 0), 0);
    const different = path.findIndex((candidate, index) => candidate.id !== bestPath[index]?.id);
    if (cost < bestCost - EPSILON || (Math.abs(cost - bestCost) <= EPSILON && different >= 0 && compare(path[different]!, bestPath[different]!) < 0)) {
      bestPath = path;
      bestCost = cost;
    }
  }
  // Retain alternatives for date-specific closures or visit-duration limits.
  const selected = new Set(bestPath.map(candidate => candidate.id));
  const remaining = pool.filter(candidate => !selected.has(candidate.id));
  while (remaining.length) {
    const next = nearest(bestPath[bestPath.length - 1]!, remaining);
    bestPath.push(next);
    remaining.splice(remaining.indexOf(next), 1);
  }
  return bestPath;
}
