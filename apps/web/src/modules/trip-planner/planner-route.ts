import type { TripRequirementInput } from "../trip-requirement/trip-requirement-contract";
import { planJourney } from "../trip-origin/journey-planner";
import { interestScore, isFeaturedDestination, type PlannerCandidate } from "./planner-candidates";
import type { PlannerDay, TravelLeg } from "./planner-contract";
import { balancePlannerDays } from "./planner-day-balance";
import { dayEndMinute, MAX_STOPS_PER_DAY, scenicBufferMinutes, schedulePlannerDays, visitDuration } from "./planner-engine";
import { haversine } from "./planner-geography";
import { estimatedRoadKm, estimateSeconds, MAX_AVERAGE_KMH, type RouteProvider } from "./planner-routes";
import { validatePlannerDays } from "./planner-validator";

type Point = { latitude: number; longitude: number };
const EPSILON = 1e-9;

/**
 * ADR-55: a round trip through every stop (an open path without an origin). Starts from the given order and only
 * applies strictly shorter 2-opt and Or-opt moves (move 1–3 stops, either way round), so ties keep the given order.
 * Straight-line km is the cost; real roads are checked afterwards.
 */
export function orderRoundTrip<T extends Point & { id: string }>(stops: readonly T[], origin: Point | null): T[] {
  const length = (path: readonly T[]) => path.reduce((sum, stop, index) => sum + (index ? haversine(path[index - 1]!, stop) : origin ? haversine(origin, stop) : 0), 0)
    + (origin && path.length ? haversine(path.at(-1)!, origin) : 0);
  const path = [...stops];
  let best = path, bestLength = length(path), improved = true;
  const tryPath = (next: T[]) => {
    const nextLength = length(next);
    if (nextLength < bestLength - EPSILON) { best = next; bestLength = nextLength; improved = true; }
  };
  while (improved) {
    improved = false;
    for (let from = 0; from < best.length - 1; from++) for (let to = from + 1; to < best.length; to++)
      tryPath([...best.slice(0, from), ...best.slice(from, to + 1).reverse(), ...best.slice(to + 1)]);
    for (let size = 1; size <= 3; size++) for (let from = 0; from + size <= best.length; from++) {
      const segment = best.slice(from, from + size), rest = [...best.slice(0, from), ...best.slice(from + size)];
      for (let at = 0; at <= rest.length; at++) for (const piece of size > 1 ? [segment, [...segment].reverse()] : [segment])
        tryPath([...rest.slice(0, at), ...piece, ...rest.slice(at)]);
    }
  }
  // Either way round costs the same; start with the stop nearer the origin, as the form planner does.
  return origin && best.length > 1 && haversine(origin, best[0]!) > haversine(origin, best.at(-1)!) + EPSILON ? [...best].reverse() : best;
}

/** ADR-55 value of a visit: well-known places first, then the traveler's interests. Ranking only. */
export function stopValue(candidate: PlannerCandidate, interests: TripRequirementInput["interests"]): number {
  return 1 + (isFeaturedDestination(candidate) ? 3 : 0) + interestScore(candidate, interests);
}

/** Estimated legs in the provider shape, so the real scheduler and Validator judge day fitting. Never shown or saved. */
function estimateProvider(transport: TripRequirementInput["transport"]): Required<RouteProvider> {
  const leg = (from: Point, to: Point) => ({ status: "VERIFIED" as const, reason: null, durationSeconds: Math.max(60, estimateSeconds(from, to, transport)),
    distanceMeters: Math.round(estimatedRoadKm(from, to) * 1000), provider: "STADIA_MAPS" as const });
  return { route: async pair => ({ fromDestinationId: pair.from.id, toDestinationId: pair.to.id, ...leg(pair.from, pair.to) }), coordinateRoute: async pair => leg(pair.from, pair.to) };
}

type Fit = { days: PlannerCandidate[][]; violations: number; insufficient: number; idle: number };

function splitEven(chain: readonly PlannerCandidate[], dayCount: number): PlannerCandidate[][] {
  return Array.from({ length: dayCount }, (_, index) => chain.slice(Math.round(index * chain.length / dayCount), Math.round((index + 1) * chain.length / dayCount)));
}

/** Free minutes before each night (the last day is free: leaving early helps the return). */
function idleMinutes(requirement: TripRequirementInput, days: readonly PlannerDay[]): number {
  return days.slice(0, -1).reduce((sum, day) => {
    const end = day.stops.at(-1)?.departureMinute;
    return end == null ? sum : sum + Math.max(0, dayEndMinute(requirement) - end);
  }, 0);
}

/** Best day split of this chain under estimated roads, judged by the same scheduler and Validator as the real plan. */
async function fitDays(requirement: TripRequirementInput, chain: readonly PlannerCandidate[]): Promise<Fit> {
  const count = (checks: { status: string }[], status: string) => checks.filter(check => check.status === status).length;
  if (requirement.journey) {
    const result = await planJourney(requirement, splitEven(chain, requirement.durationDays), estimateProvider(requirement.transport), 5_000, true, undefined, true);
    const byId = new Map(chain.map(candidate => [candidate.id, candidate]));
    const checks = validatePlannerDays(requirement, result.days, chain, result.travelOnlyDays).checks;
    return { days: result.days.map(day => day.stops.map(stop => byId.get(stop.destination.id)!)),
      violations: count(checks, "VIOLATION") + Number(result.check.status === "VIOLATION"),
      insufficient: count(checks, "INSUFFICIENT_DATA") + Number(result.check.status === "INSUFFICIENT_DATA"), idle: idleMinutes(requirement, result.days) };
  }
  const provider = estimateProvider(requirement.transport), routes = new Map<string, TravelLeg>();
  for (const [index, to] of chain.entries()) if (index) routes.set(to.id, await provider.route({ from: chain[index - 1]!, to, transport: requirement.transport }, AbortSignal.abort()));
  const days = balancePlannerDays(requirement, splitEven(chain, requirement.durationDays), routes);
  const scheduled = schedulePlannerDays(requirement, days, routes);
  const checks = validatePlannerDays(requirement, scheduled, chain).checks;
  return { days, violations: count(checks, "VIOLATION"), insufficient: count(checks, "INSUFFICIENT_DATA"), idle: idleMinutes(requirement, scheduled) };
}

const usableForFill = (candidate: PlannerCandidate) => !candidate.external && candidate.visibility === "VISIBLE" && candidate.minimumDurationMinutes !== null
  && Number.isFinite(candidate.latitude) && Number.isFinite(candidate.longitude) && (visitDuration(candidate) ?? 601) <= 600;

export type ArrangedTrip = { days: PlannerCandidate[][]; added: PlannerCandidate[]; stretched: Map<string, number> };

/**
 * ADR-55: the server owns the route. Orders the chosen stops as a round trip, splits the days, fills free time with the
 * best value per added minute, then lengthens the most valuable visits of days that still end early. Estimates never
 * remove a chosen stop: only real routes can show a stop does not fit, so the caller drops after routing.
 */
export async function arrangeTripRoute(input: {
  requirement: TripRequirementInput;
  days: readonly PlannerCandidate[][];
  pool: readonly PlannerCandidate[];
  excludedIds?: ReadonlySet<string>;
  fill?: boolean;
  budgetMs?: number;
}): Promise<ArrangedTrip> {
  const { requirement } = input;
  const deadline = Date.now() + (input.budgetMs ?? 2_000);
  const origin = requirement.journey?.origin?.confirmed ? requirement.journey.origin : null;
  const value = (candidate: PlannerCandidate) => stopValue(candidate, requirement.interests);
  let chain = orderRoundTrip(input.days.flat(), origin);
  const added: PlannerCandidate[] = [];
  if (!chain.length) return { days: input.days.map(day => [...day]), added, stretched: new Map() };
  let fit = await fitDays(requirement, chain);
  // Clocks are unknown without a departure time, so fitting cannot tell what fits: order only.
  const timed = !requirement.journey || requirement.journey.departureMinute != null;
  const limit = Math.min(28, requirement.durationDays * MAX_STOPS_PER_DAY);
  const inChain = (candidate: PlannerCandidate) => chain.some(stop => stop.id === candidate.id);
  while (input.fill && timed && !fit.violations && fit.idle >= 40 && chain.length < limit && Date.now() < deadline) {
    const options = input.pool.filter(candidate => usableForFill(candidate) && !inChain(candidate) && !input.excludedIds?.has(candidate.id))
      .map(candidate => {
        let detourKm = Infinity;
        for (let at = 0; at <= chain.length; at++) {
          const before = at ? chain[at - 1]! : origin, after = at < chain.length ? chain[at]! : origin;
          const extra = (before ? estimatedRoadKm(before, candidate) : 0) + (after ? estimatedRoadKm(candidate, after) : 0) - (before && after ? estimatedRoadKm(before, after) : 0);
          detourKm = Math.min(detourKm, extra);
        }
        const detourSeconds = detourKm / MAX_AVERAGE_KMH[requirement.transport] * 3600;
        const minutes = detourSeconds / 60 + visitDuration(candidate)! + scenicBufferMinutes(detourSeconds, requirement);
        const roadside = detourSeconds < 600 && visitDuration(candidate)! <= 30 ? 1 : 0;
        return { candidate, ratio: (value(candidate) + roadside) / Math.max(1, minutes) };
      })
      .sort((a, b) => b.ratio - a.ratio || a.candidate.id.localeCompare(b.candidate.id, "en"));
    let accepted = false;
    for (const option of options.slice(0, 4)) {
      if (Date.now() >= deadline) break;
      const next = orderRoundTrip([...chain, option.candidate], origin);
      const trial = await fitDays(requirement, next);
      if (!trial.violations && trial.insufficient <= fit.insufficient) { chain = next; fit = trial; added.push(option.candidate); accepted = true; break; }
    }
    if (!accepted) break;
  }
  // Days that still end early: stay longer where it matters most.
  const stretched = new Map<string, number>();
  if (input.fill && timed && !fit.violations && fit.idle >= 30 && Date.now() < deadline) {
    const longer = fit.days.slice(0, -1).flatMap(day => [...day].filter(stop => (stop.suggestedDurationMinutes ?? 0) >= 45 && !stop.userChosenDuration)
      .sort((a, b) => value(b) - value(a)).slice(0, 2));
    // Up to 1.5× the suggested visit, at most 30 minutes more: a longer stay, not a different trip.
    for (const stop of longer) stretched.set(stop.id, Math.min(Math.round(stop.suggestedDurationMinutes! * 1.5 / 5) * 5, stop.suggestedDurationMinutes! + 30));
    const stretch = (stop: PlannerCandidate) => stretched.has(stop.id) ? { ...stop, suggestedDurationMinutes: stretched.get(stop.id)! } : stop;
    const trial = stretched.size ? await fitDays(requirement, chain.map(stretch)) : null;
    if (trial && !trial.violations && trial.insufficient <= fit.insufficient && trial.idle < fit.idle) fit = { ...trial, days: trial.days.map(day => day.map(stop => chain.find(item => item.id === stop.id)!)) };
    else stretched.clear();
  }
  return { days: fit.days, added, stretched };
}
