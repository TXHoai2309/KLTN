import type { TripRequirementInput } from "../trip-requirement/trip-requirement-contract";
import { planJourney } from "../trip-origin/journey-planner";
import { interestScore, isFeaturedDestination, type PlannerCandidate } from "./planner-candidates";
import type { PlannerDay, TravelLeg } from "./planner-contract";
import { balancePlannerDays } from "./planner-day-balance";
import { dayEndMinute, MAX_STOPS_PER_DAY, scenicBufferMinutes, schedulePlannerDays, visitDuration } from "./planner-engine";
import { calibrateWindingFactor, DEFAULT_WINDING_FACTOR, estimatedRoadKm, estimateSeconds, haversine, MAX_AVERAGE_KMH } from "./planner-geography";
import type { RouteProvider } from "./planner-routes";
import type { TravelTimeLookup } from "./destination-travel-cache";
import { PLANNING_WINDOW } from "./planner-engine";
import { validatePlannerDays } from "./planner-validator";

type Point = { latitude: number; longitude: number };
const EPSILON = 1e-9;

/**
 * ADR-55: a round trip through every stop (an open path without an origin). Starts from the given order and only
 * applies strictly shorter 2-opt and Or-opt moves (move 1–3 stops, either way round), so ties keep the given order.
 * Straight-line km is the cost; real roads are checked afterwards.
 */
export type OrderRoundTripOptions = {
  transport?: TripRequirementInput["transport"];
  travelLookup?: TravelTimeLookup;
  windingFactor?: number;
};

/**
 * ADR-55: a round trip through every stop (an open path without an origin). Starts from the given order and only
 * applies strictly shorter 2-opt and Or-opt moves (move 1–3 stops, either way round), so ties keep the given order.
 * Prefers cached real road distances (`destination_travel_time`) when supplied, falling back to straight-line/calibrated km.
 */
export function orderRoundTrip<T extends Point & { id: string }>(
  stops: readonly T[],
  origin: Point | null,
  options?: OrderRoundTripOptions,
): T[] {
  const lookup = options?.travelLookup;
  const transport = options?.transport ?? "MOTORCYCLE";
  const windingFactor = options?.windingFactor ?? DEFAULT_WINDING_FACTOR;
  const stepCost = (a: Point & { id?: string }, b: Point & { id?: string }) => {
    if (lookup && a.id && b.id) {
      const hit = lookup(a.id, b.id, transport);
      if (hit) return hit.distanceMeters / 1000;
    }
    return lookup ? estimatedRoadKm(a, b, windingFactor) : haversine(a, b);
  };
  const length = (path: readonly T[]) =>
    path.reduce((sum, stop, index) => sum + (index ? stepCost(path[index - 1]!, stop) : origin ? stepCost(origin, stop) : 0), 0)
    + (origin && path.length ? stepCost(path.at(-1)!, origin) : 0);
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
  return origin && best.length > 1 && stepCost(origin, best[0]!) > stepCost(origin, best.at(-1)!) + EPSILON ? [...best].reverse() : best;
}

/** ADR-55 value of a visit: well-known places first, then the traveler's interests. Ranking only. */
export function stopValue(candidate: PlannerCandidate, interests: TripRequirementInput["interests"]): number {
  return 1 + (isFeaturedDestination(candidate) ? 3 : 0) + interestScore(candidate, interests);
}

/** D1/D2: reads cached DB road leg first when available, falling back to calibrated estimate for day fitting. Never shown or saved. */
function estimateProvider(
  transport: TripRequirementInput["transport"],
  travelLookup?: TravelTimeLookup,
  windingFactor = DEFAULT_WINDING_FACTOR,
  coordinateRoute?: RouteProvider["coordinateRoute"],
): Required<RouteProvider> {
  const leg = (from: Point & { id?: string }, to: Point & { id?: string }) => {
    const cached = travelLookup && from.id && to.id ? travelLookup(from.id, to.id, transport) : null;
    if (cached) {
      return {
        status: "VERIFIED" as const,
        reason: null,
        durationSeconds: Math.max(60, Math.round(cached.durationSeconds)),
        distanceMeters: Math.round(cached.distanceMeters),
        provider: "STADIA_MAPS" as const,
      };
    }
    return {
      status: "VERIFIED" as const,
      reason: null,
      durationSeconds: Math.max(60, estimateSeconds(from, to, transport, windingFactor)),
      distanceMeters: Math.round(estimatedRoadKm(from, to, windingFactor) * 1000),
      provider: "STADIA_MAPS" as const,
    };
  };
  return {
    route: async pair => ({ fromDestinationId: pair.from.id, toDestinationId: pair.to.id, ...leg(pair.from, pair.to) }),
    coordinateRoute: async (pair, signal) => {
      if (coordinateRoute) {
        const real = await coordinateRoute(pair, signal).catch(() => null);
        if (real?.status === "VERIFIED" && real.durationSeconds != null && real.distanceMeters != null) {
          return real;
        }
      }
      return leg(pair.from, pair.to);
    },
  };
}

export const MIN_FILL_SAFETY_MARGIN_MINUTES = 45;
type Fit = { days: PlannerCandidate[][]; violations: number; insufficient: number; idle: number; dayIdle: number[] };

function splitEven(chain: readonly PlannerCandidate[], dayCount: number): PlannerCandidate[][] {
  return Array.from({ length: dayCount }, (_, index) => chain.slice(Math.round(index * chain.length / dayCount), Math.round((index + 1) * chain.length / dayCount)));
}

function dayIdleList(requirement: TripRequirementInput, days: readonly PlannerDay[]): number[] {
  const endLimit = dayEndMinute(requirement);
  return days.map(day => {
    const end = day.stops.at(-1)?.departureMinute;
    if (end == null) return Math.max(0, endLimit - PLANNING_WINDOW.startMinute);
    return Math.max(0, endLimit - end);
  });
}

/** Free minutes before each night (the last day is free: leaving early helps the return). */
function idleMinutes(requirement: TripRequirementInput, days: readonly PlannerDay[]): number {
  return days.slice(0, -1).reduce((sum, day) => {
    const end = day.stops.at(-1)?.departureMinute;
    return end == null ? sum : sum + Math.max(0, dayEndMinute(requirement) - end);
  }, 0);
}

/** Best day split of this chain under cached DB roads (with calibrated D2 fallback), judged by the same scheduler and Validator as the real plan. */
async function fitDays(
  requirement: TripRequirementInput,
  chain: readonly PlannerCandidate[],
  travelLookup?: TravelTimeLookup,
  windingFactor = DEFAULT_WINDING_FACTOR,
  coordinateRoute?: RouteProvider["coordinateRoute"],
): Promise<Fit> {
  const count = (checks: { status: string }[], status: string) => checks.filter(check => check.status === status).length;
  const provider = estimateProvider(requirement.transport, travelLookup, windingFactor, coordinateRoute);
  if (requirement.journey) {
    const result = await planJourney(requirement, splitEven(chain, requirement.durationDays), provider, 5_000, true, undefined, true);
    const byId = new Map(chain.map(candidate => [candidate.id, candidate]));
    const checks = validatePlannerDays(requirement, result.days, chain, result.travelOnlyDays).checks;
    return {
      days: result.days.map(day => day.stops.map(stop => byId.get(stop.destination.id)!)),
      violations: count(checks, "VIOLATION") + Number(result.check.status === "VIOLATION"),
      insufficient: count(checks, "INSUFFICIENT_DATA") + Number(result.check.status === "INSUFFICIENT_DATA"),
      idle: idleMinutes(requirement, result.days),
      dayIdle: dayIdleList(requirement, result.days),
    };
  }
  const routes = new Map<string, TravelLeg>();
  for (const [index, to] of chain.entries()) if (index) routes.set(to.id, await provider.route({ from: chain[index - 1]!, to, transport: requirement.transport }, AbortSignal.abort()));
  const days = balancePlannerDays(requirement, splitEven(chain, requirement.durationDays), routes);
  const scheduled = schedulePlannerDays(requirement, days, routes);
  const checks = validatePlannerDays(requirement, scheduled, chain).checks;
  return {
    days,
    violations: count(checks, "VIOLATION"),
    insufficient: count(checks, "INSUFFICIENT_DATA"),
    idle: idleMinutes(requirement, scheduled),
    dayIdle: dayIdleList(requirement, scheduled),
  };
}

function calibrateFromLookup(
  candidates: readonly PlannerCandidate[],
  transport: TripRequirementInput["transport"],
  travelLookup?: TravelTimeLookup,
  explicitFactor?: number,
): number {
  if (explicitFactor !== undefined) return explicitFactor;
  if (!travelLookup || candidates.length < 2) return DEFAULT_WINDING_FACTOR;
  const samples: { from: Point; to: Point; distanceMeters: number }[] = [];
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i]!, b = candidates[j]!;
      const hit = travelLookup(a.id, b.id, transport) ?? travelLookup(b.id, a.id, transport);
      if (hit) samples.push({ from: a, to: b, distanceMeters: hit.distanceMeters });
    }
  }
  return calibrateWindingFactor(samples, DEFAULT_WINDING_FACTOR);
}

const usableForFill = (candidate: PlannerCandidate) => !candidate.external && candidate.visibility === "VISIBLE" && candidate.minimumDurationMinutes !== null
  && Number.isFinite(candidate.latitude) && Number.isFinite(candidate.longitude) && (visitDuration(candidate) ?? 601) <= 600;

export type ArrangedTrip = { days: PlannerCandidate[][]; added: PlannerCandidate[]; stretched: Map<string, number> };

/**
 * ADR-55/D1/D2/D4: the server owns the route. Orders the chosen stops as a round trip, splits the days, fills free
 * time with >= 45m margin using cached DB travel times (or calibrated estimates), then lengthens valuable visits.
 * Estimates never remove a chosen stop: only real routes can show a stop does not fit, so the caller drops after routing.
 */
export async function arrangeTripRoute(input: {
  requirement: TripRequirementInput;
  days: readonly PlannerCandidate[][];
  pool: readonly PlannerCandidate[];
  excludedIds?: ReadonlySet<string>;
  fill?: boolean;
  budgetMs?: number;
  travelLookup?: TravelTimeLookup;
  windingFactor?: number;
  coordinateRoute?: RouteProvider["coordinateRoute"];
}): Promise<ArrangedTrip> {
  const { requirement, travelLookup } = input;
  const deadline = Date.now() + (input.budgetMs ?? 2_000);
  const coordCache = new Map<string, ReturnType<NonNullable<RouteProvider["coordinateRoute"]>>>();
  const memoizedCoordinateRoute: RouteProvider["coordinateRoute"] | undefined = input.coordinateRoute
    ? (pair, signal) => {
        const key = `${pair.from.latitude.toFixed(5)},${pair.from.longitude.toFixed(5)}->${pair.to.latitude.toFixed(5)},${pair.to.longitude.toFixed(5)}:${pair.transport}`;
        let pending = coordCache.get(key);
        if (!pending) {
          pending = input.coordinateRoute!(pair, signal);
          coordCache.set(key, pending);
        }
        return pending;
      }
    : undefined;
  const origin = requirement.journey?.origin?.confirmed ? requirement.journey.origin : null;
  const windingFactor = calibrateFromLookup([...input.days.flat(), ...input.pool], requirement.transport, travelLookup, input.windingFactor);
  const orderOpts: OrderRoundTripOptions = { transport: requirement.transport, travelLookup, windingFactor };
  const value = (candidate: PlannerCandidate) => stopValue(candidate, requirement.interests);
  let chain = orderRoundTrip(input.days.flat(), origin, orderOpts);
  const added: PlannerCandidate[] = [];
  if (!chain.length) return { days: input.days.map(day => [...day]), added, stretched: new Map() };
  let fit = await fitDays(requirement, chain, travelLookup, windingFactor, memoizedCoordinateRoute);
  // Clocks are unknown without a departure time, so fitting cannot tell what fits: order only.
  const timed = !requirement.journey || requirement.journey.departureMinute != null;
  const limit = Math.min(28, requirement.durationDays * MAX_STOPS_PER_DAY);
  const inChain = (candidate: PlannerCandidate) => chain.some(stop => stop.id === candidate.id);
  const legKm = (a: Point & { id?: string }, b: Point & { id?: string }) => {
    const hit = travelLookup && a.id && b.id ? travelLookup(a.id, b.id, requirement.transport) : null;
    return hit ? hit.distanceMeters / 1000 : estimatedRoadKm(a, b, windingFactor);
  };
  const legSecs = (a: Point & { id?: string }, b: Point & { id?: string }) => {
    const hit = travelLookup && a.id && b.id ? travelLookup(a.id, b.id, requirement.transport) : null;
    return hit ? hit.durationSeconds : (legKm(a, b) / MAX_AVERAGE_KMH[requirement.transport]) * 3600;
  };
  while (input.fill && timed && !fit.violations && fit.idle >= MIN_FILL_SAFETY_MARGIN_MINUTES && chain.length < limit && Date.now() < deadline) {
    const options = input.pool.filter(candidate => usableForFill(candidate) && !inChain(candidate) && !input.excludedIds?.has(candidate.id))
      .map(candidate => {
        let detourSeconds = Infinity;
        for (let at = 0; at <= chain.length; at++) {
          const before = at ? chain[at - 1]! : origin, after = at < chain.length ? chain[at]! : origin;
          const extra = (before ? legSecs(before, candidate) : 0) + (after ? legSecs(candidate, after) : 0) - (before && after ? legSecs(before, after) : 0);
          detourSeconds = Math.min(detourSeconds, extra);
        }
        const minutes = detourSeconds / 60 + visitDuration(candidate)! + scenicBufferMinutes(detourSeconds, requirement);
        const roadside = detourSeconds < 600 && visitDuration(candidate)! <= 30 ? 1 : 0;
        return { candidate, ratio: (value(candidate) + roadside) / Math.max(1, minutes) };
      })
      .sort((a, b) => b.ratio - a.ratio || a.candidate.id.localeCompare(b.candidate.id, "en"));
    let accepted = false;
    for (const option of options.slice(0, 4)) {
      if (Date.now() >= deadline) break;
      const next = orderRoundTrip([...chain, option.candidate], origin, orderOpts);
      const trial = await fitDays(requirement, next, travelLookup, windingFactor, memoizedCoordinateRoute);
      // D4: every day whose stop list gained the new stop must retain >= 45 minutes of margin.
      const dayKeepsMargin = trial.days.every((day, idx) => {
        const gainedCandidate = day.some(stop => stop.id === option.candidate.id);
        const grew = day.length > (fit.days[idx]?.length ?? 0);
        if (!gainedCandidate && !grew) return true;
        return (trial.dayIdle[idx] ?? 0) >= MIN_FILL_SAFETY_MARGIN_MINUTES;
      });
      if (!trial.violations && trial.insufficient <= fit.insufficient && trial.idle >= MIN_FILL_SAFETY_MARGIN_MINUTES && dayKeepsMargin) {
        chain = next;
        fit = trial;
        added.push(option.candidate);
        accepted = true;
        break;
      }
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
    const trial = stretched.size ? await fitDays(requirement, chain.map(stretch), travelLookup, windingFactor, memoizedCoordinateRoute) : null;
    if (trial && !trial.violations && trial.insufficient <= fit.insufficient && trial.idle < fit.idle) fit = { ...trial, days: trial.days.map(day => day.map(stop => chain.find(item => item.id === stop.id)!)) };
    else stretched.clear();
  }
  return { days: fit.days, added, stretched };
}
