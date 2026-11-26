import { HA_GIANG_CITY_CENTER, isMainLoopOvernightArea, resolveOvernightAnchorTown } from "../../lib/overnight-anchor";
import type { TripRequirementInput } from "../trip-requirement/trip-requirement-contract";
import { DAILY_DRIVING_WARNING_HOURS, planJourney, type JourneyBalancePreferences } from "../trip-origin/journey-planner";
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

export const SAME_CATEGORY_DECAY_SECONDS = 15 * 60;

/**
 * D9: halves `stopValue` when the same day already contains another stop of the exact same category
 * within a 15-minute drive (preventing duplicate village/pass stops from crowding out variety).
 */
export function hasNearbySameCategoryPeer(
  candidate: Pick<PlannerCandidate, "id" | "category" | "latitude" | "longitude">,
  sameDayStops: readonly Pick<PlannerCandidate, "id" | "category" | "latitude" | "longitude">[],
  drivingSecondsBetween: (
    a: Pick<PlannerCandidate, "id" | "latitude" | "longitude">,
    b: Pick<PlannerCandidate, "id" | "latitude" | "longitude">,
  ) => number,
): boolean {
  const category = (candidate.category || "").normalize("NFC").trim().toLowerCase();
  if (!category) return false;
  return sameDayStops.some(peer => {
    if (peer.id === candidate.id) return false;
    const peerCategory = (peer.category || "").normalize("NFC").trim().toLowerCase();
    if (!peerCategory || peerCategory !== category) return false;
    return Math.min(drivingSecondsBetween(peer, candidate), drivingSecondsBetween(candidate, peer)) <= SAME_CATEGORY_DECAY_SECONDS;
  });
}

export function diversityAdjustedStopValue(
  candidate: PlannerCandidate,
  interests: TripRequirementInput["interests"],
  sameDayStops: readonly Pick<PlannerCandidate, "id" | "category" | "latitude" | "longitude">[],
  drivingSecondsBetween: (
    a: Pick<PlannerCandidate, "id" | "latitude" | "longitude">,
    b: Pick<PlannerCandidate, "id" | "latitude" | "longitude">,
  ) => number,
): number {
  const base = stopValue(candidate, interests);
  return hasNearbySameCategoryPeer(candidate, sameDayStops, drivingSecondsBetween) ? base * 0.5 : base;
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
type Fit = {
  days: PlannerCandidate[][];
  violations: number;
  insufficient: number;
  emptyDays: number;
  idle: number;
  dayIdle: number[];
  returnEndMinute: number | null;
  penultimateHgKm: number | null;
  day1LongDrive: boolean;
};

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

function penultimateHaGiangKm(days: readonly PlannerDay[]): number | null {
  if (days.length < 2) return null;
  const lastStop = days.at(-2)?.stops.at(-1)?.destination;
  if (!lastStop) return null;
  return haversine(lastStop, HA_GIANG_CITY_CENTER);
}

/** Evaluate a fixed day partition (no boundary repartition) under cached DB roads / estimates (D2 / Q6). */
async function fitFixedDays(
  requirement: TripRequirementInput,
  days: readonly PlannerCandidate[][],
  travelLookup?: TravelTimeLookup,
  windingFactor = DEFAULT_WINDING_FACTOR,
  coordinateRoute?: RouteProvider["coordinateRoute"],
  journeyPreferences?: JourneyBalancePreferences,
): Promise<Fit> {
  const count = (checks: { status: string }[], status: string) => checks.filter(check => check.status === status).length;
  const chain = days.flat();
  const provider = estimateProvider(requirement.transport, travelLookup, windingFactor, coordinateRoute);
  if (requirement.journey) {
    const result = await planJourney(requirement, days, provider, 5_000, false, undefined, false, journeyPreferences);
    const byId = new Map(chain.map(candidate => [candidate.id, candidate]));
    const checks = validatePlannerDays(requirement, result.days, chain, result.travelOnlyDays).checks;
    const day1Seconds = result.days[0]?.travelSeconds ?? 0;
    return {
      days: result.days.map(day => day.stops.map(stop => byId.get(stop.destination.id)!)),
      violations: count(checks, "VIOLATION") + Number(result.check.status === "VIOLATION"),
      insufficient: count(checks, "INSUFFICIENT_DATA") + Number(result.check.status === "INSUFFICIENT_DATA"),
      emptyDays: result.days.filter(day => day.journeyDayKind === "EMPTY").length,
      idle: idleMinutes(requirement, result.days),
      dayIdle: dayIdleList(requirement, result.days),
      returnEndMinute: result.journeyPlan.legs.find(leg => leg.kind === "RETURN")?.endMinute ?? null,
      penultimateHgKm: penultimateHaGiangKm(result.days),
      day1LongDrive: day1Seconds > DAILY_DRIVING_WARNING_HOURS[requirement.transport] * 3600,
    };
  }
  const routes = new Map<string, TravelLeg>();
  for (const [index, to] of chain.entries()) {
    if (index) routes.set(to.id, await provider.route({ from: chain[index - 1]!, to, transport: requirement.transport }, AbortSignal.abort()));
  }
  const scheduled = schedulePlannerDays(requirement, days, routes);
  const checks = validatePlannerDays(requirement, scheduled, chain).checks;
  return {
    days: days.map(day => [...day]),
    violations: count(checks, "VIOLATION"),
    insufficient: count(checks, "INSUFFICIENT_DATA"),
    emptyDays: days.filter(day => day.length === 0).length,
    idle: idleMinutes(requirement, scheduled),
    dayIdle: dayIdleList(requirement, scheduled),
    returnEndMinute: null,
    penultimateHgKm: penultimateHaGiangKm(scheduled),
    day1LongDrive: false,
  };
}

/** Best day split of this chain under cached DB roads (with calibrated D2 fallback), judged by the same scheduler and Validator as the real plan. */
async function fitDays(
  requirement: TripRequirementInput,
  chain: readonly PlannerCandidate[],
  travelLookup?: TravelTimeLookup,
  windingFactor = DEFAULT_WINDING_FACTOR,
  coordinateRoute?: RouteProvider["coordinateRoute"],
  journeyPreferences?: JourneyBalancePreferences,
): Promise<Fit> {
  const count = (checks: { status: string }[], status: string) => checks.filter(check => check.status === status).length;
  const provider = estimateProvider(requirement.transport, travelLookup, windingFactor, coordinateRoute);
  if (requirement.journey) {
    const result = await planJourney(requirement, splitEven(chain, requirement.durationDays), provider, 5_000, true, undefined, true, journeyPreferences);
    const byId = new Map(chain.map(candidate => [candidate.id, candidate]));
    const checks = validatePlannerDays(requirement, result.days, chain, result.travelOnlyDays).checks;
    const day1Seconds = result.days[0]?.travelSeconds ?? 0;
    return {
      days: result.days.map(day => day.stops.map(stop => byId.get(stop.destination.id)!)),
      violations: count(checks, "VIOLATION") + Number(result.check.status === "VIOLATION"),
      insufficient: count(checks, "INSUFFICIENT_DATA") + Number(result.check.status === "INSUFFICIENT_DATA"),
      emptyDays: result.days.filter(day => day.journeyDayKind === "EMPTY").length,
      idle: idleMinutes(requirement, result.days),
      dayIdle: dayIdleList(requirement, result.days),
      returnEndMinute: result.journeyPlan.legs.find(leg => leg.kind === "RETURN")?.endMinute ?? null,
      penultimateHgKm: penultimateHaGiangKm(result.days),
      day1LongDrive: day1Seconds > DAILY_DRIVING_WARNING_HOURS[requirement.transport] * 3600,
    };
  }
  const routes = new Map<string, TravelLeg>();
  for (const [index, to] of chain.entries()) if (index) routes.set(to.id, await provider.route({ from: chain[index - 1]!, to, transport: requirement.transport }, AbortSignal.abort()));
  const days = balancePlannerDays(
    requirement,
    splitEven(chain, requirement.durationDays),
    routes,
    journeyPreferences ? { gentleFamily: journeyPreferences.gentleFamily, explicitOvernightDays: journeyPreferences.explicitOvernightDays } : undefined,
  );
  const scheduled = schedulePlannerDays(requirement, days, routes);
  const checks = validatePlannerDays(requirement, scheduled, chain).checks;
  return {
    days,
    violations: count(checks, "VIOLATION"),
    insufficient: count(checks, "INSUFFICIENT_DATA"),
    emptyDays: days.filter(day => day.length === 0).length,
    idle: idleMinutes(requirement, scheduled),
    dayIdle: dayIdleList(requirement, scheduled),
    returnEndMinute: null,
    penultimateHgKm: penultimateHaGiangKm(scheduled),
    day1LongDrive: false,
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
  /** Stops prioritized when filling free time (e.g. mustIncludeDestinationIds after adding a day). */
  prioritizeIds?: ReadonlySet<string>;
  /** 0-based day indices whose final stop is locked by a traveler-stated overnight constraint (Q6). */
  lockedDayEndIndices?: ReadonlySet<number>;
  /** Soft preferences for S6 (gentle/family overnight) and S14 (relax-on-add-day spread & return pull). */
  journeyPreferences?: JourneyBalancePreferences;
  fill?: boolean;
  budgetMs?: number;
  travelLookup?: TravelTimeLookup;
  windingFactor?: number;
  coordinateRoute?: RouteProvider["coordinateRoute"];
}): Promise<ArrangedTrip> {
  const { requirement, travelLookup, journeyPreferences } = input;
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
  const added: PlannerCandidate[] = [];
  const timed = !requirement.journey || requirement.journey.departureMinute != null;
  const limit = Math.min(28, requirement.durationDays * MAX_STOPS_PER_DAY);
  const legKm = (a: Point & { id?: string }, b: Point & { id?: string }) => {
    const hit = travelLookup && a.id && b.id ? travelLookup(a.id, b.id, requirement.transport) : null;
    return hit ? hit.distanceMeters / 1000 : estimatedRoadKm(a, b, windingFactor);
  };
  const legSecs = (a: Point & { id?: string }, b: Point & { id?: string }) => {
    const hit = travelLookup && a.id && b.id ? travelLookup(a.id, b.id, requirement.transport) : null;
    return hit ? hit.durationSeconds : (legKm(a, b) / MAX_AVERAGE_KMH[requirement.transport]) * 3600;
  };
  const allowFillCandidate = (candidate: PlannerCandidate) => {
    if (!usableForFill(candidate)) return false;
    // S6: for gentle/family trips, avoid auto-filling off-main-loop stops (e.g. Bắc Mê) unless explicitly prioritized.
    if (journeyPreferences?.gentleFamily && !input.prioritizeIds?.has(candidate.id)) {
      const anchor = resolveOvernightAnchorTown(candidate);
      if (anchor && !isMainLoopOvernightArea(anchor.area)) return false;
    }
    return true;
  };

  // D2 / Q6: when real traveler-stated overnight constraints lock specific day-end stops, keep those
  // constrained days fixed and fill free time (or newly added empty days) in unconstrained days.
  if (input.lockedDayEndIndices && input.lockedDayEndIndices.size > 0) {
    let currentDays = input.days.map(day => [...day]);
    if (!currentDays.flat().length) return { days: currentDays, added, stretched: new Map() };
    let fit = await fitFixedDays(requirement, currentDays, travelLookup, windingFactor, memoizedCoordinateRoute, journeyPreferences);
    const inDays = (candidate: PlannerCandidate) => currentDays.some(day => day.some(stop => stop.id === candidate.id));
    while (input.fill && timed && !fit.violations && currentDays.flat().length < limit && Date.now() < deadline) {
      const openDayIndices = currentDays
        .map((day, idx) => ({ day, idx }))
        .filter(({ day, idx }) =>
          !input.lockedDayEndIndices!.has(idx)
          && day.length < MAX_STOPS_PER_DAY
          && (day.length === 0 || (fit.dayIdle[idx] ?? 0) >= MIN_FILL_SAFETY_MARGIN_MINUTES),
        )
        .map(({ idx }) => idx);
      if (openDayIndices.length === 0) break;

      const proposals: { candidate: PlannerCandidate; dayIdx: number; insertAt: number; priority: number; fillsEmpty: number; ratio: number }[] = [];
      for (const candidate of input.pool) {
        if (!allowFillCandidate(candidate) || inDays(candidate) || input.excludedIds?.has(candidate.id)) continue;
        const priority = input.prioritizeIds?.has(candidate.id) ? 1 : 0;
        for (const dayIdx of openDayIndices) {
          const day = currentDays[dayIdx]!;
          const prevAnchor = dayIdx > 0 ? currentDays.slice(0, dayIdx).flat().at(-1) ?? origin : origin;
          const nextAnchor = currentDays.slice(dayIdx + 1).flat()[0] ?? origin;
          let bestDetour = Infinity;
          let bestAt = day.length;
          for (let at = 0; at <= day.length; at++) {
            const before = at > 0 ? day[at - 1]! : prevAnchor;
            const after = at < day.length ? day[at]! : nextAnchor;
            const extra = (before ? legSecs(before, candidate) : 0) + (after ? legSecs(candidate, after) : 0) - (before && after ? legSecs(before, after) : 0);
            if (extra < bestDetour) {
              bestDetour = extra;
              bestAt = at;
            }
          }
          const duplicateNearby = hasNearbySameCategoryPeer(candidate, day, legSecs);
          const adjustedValue = duplicateNearby ? value(candidate) * 0.5 : value(candidate);
          const minutes = Math.max(0, bestDetour) / 60 + visitDuration(candidate)! + scenicBufferMinutes(Math.max(0, bestDetour), requirement);
          const roadside = bestDetour < 600 && visitDuration(candidate)! <= 30 ? (duplicateNearby ? 0.5 : 1) : 0;
          proposals.push({
            candidate,
            dayIdx,
            insertAt: bestAt,
            priority,
            fillsEmpty: day.length === 0 ? 1 : 0,
            ratio: (adjustedValue + roadside) / Math.max(1, minutes),
          });
        }
      }
      proposals.sort((a, b) =>
        b.priority - a.priority
        || b.fillsEmpty - a.fillsEmpty
        || b.ratio - a.ratio
        || a.candidate.id.localeCompare(b.candidate.id, "en"),
      );
      let accepted = false;
      for (const prop of proposals.slice(0, 6)) {
        if (Date.now() >= deadline) break;
        const trialDays = currentDays.map((day, idx) =>
          idx === prop.dayIdx ? [...day.slice(0, prop.insertAt), prop.candidate, ...day.slice(prop.insertAt)] : [...day],
        );
        const trial = await fitFixedDays(requirement, trialDays, travelLookup, windingFactor, memoizedCoordinateRoute, journeyPreferences);
        const isLastDay = prop.dayIdx === currentDays.length - 1;
        const marginOk = isLastDay
          ? (trial.dayIdle[prop.dayIdx] ?? 0) >= 0
          : (trial.dayIdle[prop.dayIdx] ?? 0) >= MIN_FILL_SAFETY_MARGIN_MINUTES;
        if (!trial.violations && trial.insufficient <= fit.insufficient && marginOk) {
          currentDays = trialDays;
          fit = trial;
          added.push(prop.candidate);
          accepted = true;
          break;
        }
      }
      if (!accepted) break;
    }
    return { days: currentDays, added, stretched: new Map() };
  }

  let chain = orderRoundTrip(input.days.flat(), origin, orderOpts);
  if (!chain.length) return { days: input.days.map(day => [...day]), added, stretched: new Map() };
  let fit = await fitDays(requirement, chain, travelLookup, windingFactor, memoizedCoordinateRoute, journeyPreferences);

  // S14: when adding a day to relax the schedule, also test bounded loop orderings that finish closer to
  // TP Hà Giang (without creating a long Day-1 drive or major detour) so the penultimate night sits nearer
  // TP Hà Giang and the final return drive finishes earlier.
  if (journeyPreferences?.relaxSpreadAndPullReturn && chain.length >= 2 && timed) {
    const chainKm = (seq: readonly PlannerCandidate[]) =>
      seq.reduce((sum, stop, idx) => sum + (idx ? legKm(seq[idx - 1]!, stop) : origin ? legKm(origin, stop) : 0), 0)
      + (origin && seq.length ? legKm(seq.at(-1)!, origin) : 0);
    const baseKm = chainKm(chain);
    let closestIdx = 0;
    let closestDist = Infinity;
    chain.forEach((stop, idx) => {
      const d = haversine(stop, HA_GIANG_CITY_CENTER);
      if (d < closestDist) {
        closestDist = d;
        closestIdx = idx;
      }
    });
    const candidates: PlannerCandidate[][] = [];
    if (closestIdx < chain.length - 1) {
      candidates.push([...chain.slice(closestIdx + 1), ...chain.slice(0, closestIdx + 1)]);
      const tailStop = chain[closestIdx]!;
      const rest = chain.filter((_, idx) => idx !== closestIdx);
      if (rest.length > 0) {
        const restOrdered = orderRoundTrip(rest, origin, orderOpts);
        candidates.push([...restOrdered, tailStop]);
      }
    }
    const seenKeys = new Set([chain.map(s => s.id).join(",")]);
    const isBetterRelaxFit = (trial: Fit, current: Fit) => {
      if (trial.violations !== current.violations) return trial.violations < current.violations;
      if (trial.insufficient !== current.insufficient) return trial.insufficient < current.insufficient;
      if (trial.emptyDays !== current.emptyDays) return trial.emptyDays < current.emptyDays;
      if (trial.day1LongDrive !== current.day1LongDrive) return !trial.day1LongDrive;
      const curRet = current.returnEndMinute ?? Number.POSITIVE_INFINITY;
      const triRet = trial.returnEndMinute ?? Number.POSITIVE_INFINITY;
      if (Math.abs(triRet - curRet) >= 15) return triRet < curRet;
      const curHg = current.penultimateHgKm ?? Number.POSITIVE_INFINITY;
      const triHg = trial.penultimateHgKm ?? Number.POSITIVE_INFINITY;
      if (Math.abs(triHg - curHg) >= 5) return triHg < curHg;
      return trial.idle < current.idle;
    };
    for (const candidateChain of candidates) {
      if (Date.now() >= deadline) break;
      const key = candidateChain.map(s => s.id).join(",");
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      if (baseKm > 0 && chainKm(candidateChain) > baseKm * 1.25) continue;
      const trial = await fitDays(requirement, candidateChain, travelLookup, windingFactor, memoizedCoordinateRoute, journeyPreferences);
      if (isBetterRelaxFit(trial, fit)) {
        chain = candidateChain;
        fit = trial;
      }
    }
  }

  // Clocks are unknown without a departure time, so fitting cannot tell what fits: order only.
  const inChain = (candidate: PlannerCandidate) => chain.some(stop => stop.id === candidate.id);
  while (input.fill && timed && !fit.violations && fit.idle >= MIN_FILL_SAFETY_MARGIN_MINUTES && chain.length < limit && Date.now() < deadline) {
    const dayIndexAtChainPos = (pos: number): number => {
      let seen = 0;
      for (let d = 0; d < fit.days.length; d++) {
        seen += fit.days[d]!.length;
        if (pos <= seen) return d;
      }
      return Math.max(0, fit.days.length - 1);
    };
    const options = input.pool.filter(candidate => allowFillCandidate(candidate) && !inChain(candidate) && !input.excludedIds?.has(candidate.id))
      .map(candidate => {
        let detourSeconds = Infinity;
        let bestAt = 0;
        for (let at = 0; at <= chain.length; at++) {
          const before = at ? chain[at - 1]! : origin, after = at < chain.length ? chain[at]! : origin;
          const extra = (before ? legSecs(before, candidate) : 0) + (after ? legSecs(candidate, after) : 0) - (before && after ? legSecs(before, after) : 0);
          if (extra < detourSeconds) {
            detourSeconds = extra;
            bestAt = at;
          }
        }
        const targetDayStops = fit.days[dayIndexAtChainPos(bestAt)] ?? chain;
        const duplicateNearby = hasNearbySameCategoryPeer(candidate, targetDayStops, legSecs);
        const adjustedValue = duplicateNearby ? value(candidate) * 0.5 : value(candidate);
        const minutes = detourSeconds / 60 + visitDuration(candidate)! + scenicBufferMinutes(detourSeconds, requirement);
        const roadside = detourSeconds < 600 && visitDuration(candidate)! <= 30 ? (duplicateNearby ? 0.5 : 1) : 0;
        const priority = input.prioritizeIds?.has(candidate.id) ? 1 : 0;
        return { candidate, priority, ratio: (adjustedValue + roadside) / Math.max(1, minutes) };
      })
      .sort((a, b) => b.priority - a.priority || b.ratio - a.ratio || a.candidate.id.localeCompare(b.candidate.id, "en"));
    let accepted = false;
    for (const option of options.slice(0, 4)) {
      if (Date.now() >= deadline) break;
      const next = orderRoundTrip([...chain, option.candidate], origin, orderOpts);
      const trial = await fitDays(requirement, next, travelLookup, windingFactor, memoizedCoordinateRoute, journeyPreferences);
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
    const trial = stretched.size ? await fitDays(requirement, chain.map(stretch), travelLookup, windingFactor, memoizedCoordinateRoute, journeyPreferences) : null;
    if (trial && !trial.violations && trial.insufficient <= fit.insufficient && trial.idle < fit.idle) fit = { ...trial, days: trial.days.map(day => day.map(stop => chain.find(item => item.id === stop.id)!)) };
    else stretched.clear();
  }
  return { days: fit.days, added, stretched };
}
