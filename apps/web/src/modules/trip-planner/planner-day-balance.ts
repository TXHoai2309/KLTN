import type { TripRequirementInput } from "../trip-requirement/trip-requirement-contract";
import type { PlannerCandidate } from "./planner-candidates";
import type { TravelLeg } from "./planner-contract";
import { dateForDay, PACE_STOP_LIMIT, PLANNING_WINDOW, schedulePlannerDays, visitDuration } from "./planner-engine";
import { haversine } from "./planner-geography";

type Partition = { days: PlannerCandidate[][]; violations: number; emptyDays: number; load: number; spread: number };
const compare = (a: Partition, b: Partition) => a.violations - b.violations || a.emptyDays - b.emptyDays || a.load - b.load || a.spread - b.spread;

/** Reuse the same directed chain and its verified evidence; only day boundaries move. */
export function balancePlannerDays(requirement: TripRequirementInput, selected: readonly PlannerCandidate[][], routes: ReadonlyMap<string, TravelLeg>): PlannerCandidate[][] {
  const stops = selected.flat(), cap = PACE_STOP_LIMIT[requirement.pace ?? "MODERATE"];
  if (!stops.length || stops.slice(1).some((stop, index) => {
    const leg = routes.get(stop.id);
    return leg?.status !== "VERIFIED" || leg.fromDestinationId !== stops[index]!.id || leg.toDestinationId !== stop.id;
  })) return selected.map(day => [...day]);
  const memo = new Map<string, Partition | null>();
  const solve = (dayIndex: number, offset: number): Partition | null => {
    if (dayIndex === requirement.durationDays) return offset === stops.length ? { days: [], violations: 0, emptyDays: 0, load: 0, spread: 0 } : null;
    const key = `${dayIndex}:${offset}`;
    if (memo.has(key)) return memo.get(key)!;
    let best: Partition | null = null;
    const remainingDays = requirement.durationDays - dayIndex - 1;
    for (let count = Math.min(cap, stops.length - offset); count >= 0; count--) {
      if (stops.length - offset - count > remainingDays * cap) continue;
      const rest = solve(dayIndex + 1, offset + count);
      if (!rest) continue;
      const today = stops.slice(offset, offset + count);
      const scheduled = schedulePlannerDays({ ...requirement, startDate: dateForDay(requirement.startDate, dayIndex) }, [today], routes)[0]!;
      const violations = scheduled.stops.filter(stop => stop.scheduleState !== "PLANNED").length;
      const lastDeparture = scheduled.stops.at(-1)?.departureMinute;
      const elapsed = lastDeparture == null
        ? today.reduce((sum, stop) => sum + visitDuration(stop)! + Math.ceil((routes.get(stop.id)?.durationSeconds ?? 0) / 60), 0)
        : lastDeparture - PLANNING_WINDOW.startMinute;
      const partition: Partition = {
        days: [today, ...rest.days], violations: violations + rest.violations,
        emptyDays: Number(count === 0) + rest.emptyDays,
        load: elapsed ** 2 + rest.load,
        spread: today.reduce((sum, stop, index) => sum + (index ? haversine(today[index - 1]!, stop) ** 2 : 0), 0) + rest.spread,
      };
      if (!best || compare(partition, best) < 0) best = partition;
    }
    memo.set(key, best);
    return best;
  };
  return solve(0, 0)?.days ?? selected.map(day => [...day]);
}
