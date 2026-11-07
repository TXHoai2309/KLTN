import type { TripRequirementInput } from "../trip-requirement/trip-requirement-contract";
import type { PlannerCandidate } from "../trip-planner/planner-candidates";
import { dateForDay, MORNING_DEPARTURE_MINUTE, PACE_STOP_LIMIT, PLANNING_WINDOW, schedulePlannerDays, visitDuration } from "../trip-planner/planner-engine";
import { validatePlannerDays } from "../trip-planner/planner-validator";
import { travelLegSchema, type PlannerCheck, type PlannerDay, type PlannerResult, type TravelLeg } from "../trip-planner/planner-contract";
import { isFeaturedDestination } from "../trip-planner/planner-candidates";
import { missingLeg, resolveBoundedRoutes, ROUTING_DEADLINE_MS, type CoordinateRoutePair, type RouteProvider, type RoutePair } from "../trip-planner/planner-routes";
import { journeyRouteSchema, type JourneyPlan, type JourneyRoute } from "./journey-route-contract";
import { afterVisitDriving, driveWithRest, REST_POLICY_VERSION } from "./rest-policy";
import { missingJourneyFields } from "./trip-origin-contract";

const missing = (reason: NonNullable<JourneyRoute["reason"]>): JourneyRoute => ({ status: "INSUFFICIENT_DATA", reason, durationSeconds: null, distanceMeters: null, provider: null });
type Request = { kind: "OUTBOUND" | "RETURN"; from: { latitude: number; longitude: number }; to: { latitude: number; longitude: number }; transport: TripRequirementInput["transport"] } | { kind: "TRANSFER"; pair: RoutePair };

/** Extends the existing scheduler/Validator with explicit boundary legs. Never saves. */
export async function planJourney(requirement: TripRequirementInput, selected: readonly PlannerCandidate[][], provider: RouteProvider, timeoutMs?: number, allowBoundaryRepartition = false, fixedArrivals?: ReadonlyMap<string, number>, preferFullDays = false) {
  const stops = selected.flat(), first = stops[0], last = stops.at(-1);
  const origin = requirement.journey?.origin?.confirmed ? requirement.journey.origin : null;
  const requests: Request[] = [];
  if (origin && first) requests.push({ kind: "OUTBOUND", from: origin, to: first, transport: requirement.transport });
  for (let i = 1; i < stops.length; i++) requests.push({ kind: "TRANSFER", pair: { from: stops[i - 1]!, to: stops[i]!, transport: requirement.transport } });
  if (origin && last) requests.push({ kind: "RETURN", from: last, to: origin, transport: requirement.transport });
  const transfer = new Map<string, TravelLeg>();
  const evidence = await resolveBoundedRoutes(requests, async (request, signal): Promise<JourneyRoute> => {
    if (request.kind === "TRANSFER") {
      const parsed = travelLegSchema.safeParse(await provider.route(request.pair, signal));
      const leg = parsed.success && parsed.data.fromDestinationId === request.pair.from.id && parsed.data.toDestinationId === request.pair.to.id ? parsed.data : missingLeg(request.pair, "INVALID_RESPONSE");
      const { fromDestinationId: _from, toDestinationId: _to, ...route } = leg;
      return route;
    }
    if (!provider.coordinateRoute) return missing("NOT_CONFIGURED");
    const parsed = journeyRouteSchema.safeParse(await provider.coordinateRoute(request, signal));
    return parsed.success ? parsed.data : missing("INVALID_RESPONSE");
  }, (_request, reason) => missing(reason), timeoutMs);
  requests.forEach((request, index) => {
    if (request.kind === "TRANSFER") transfer.set(request.pair.to.id, { fromDestinationId: request.pair.from.id, toDestinationId: request.pair.to.id, ...evidence[index]! });
  });
  const outbound = origin && first ? evidence[0]! : missing("NOT_CONFIGURED");
  const returning = origin && last ? evidence.at(-1)! : missing("NOT_CONFIGURED");
  const original = scheduleJourneyEvidence(requirement, selected, transfer, outbound, returning, fixedArrivals);
  if (!allowBoundaryRepartition || selected.length < 2 || evidence.some(route => route.status !== "VERIFIED")) return original;
  const partitions = [selected.map(day => [...day])];
  const cap = PACE_STOP_LIMIT[requirement.pace ?? "MODERATE"];
  // Bounded alternative day boundaries on the SAME directed chain. No extra
  // routing, visit removal, mode/day-count change or lodging coordinates.
  const moveFirst = (days: PlannerCandidate[][]) => {
    if (!days[0]!.length || !days[1]!.length || days[0]!.length + days[1]!.length > cap) return null;
    return [[], [...days[0]!, ...days[1]!], ...days.slice(2)];
  };
  const moveLast = (days: PlannerCandidate[][]) => {
    if (!days.at(-1)!.length || !days.at(-2)!.length || days.at(-1)!.length + days.at(-2)!.length > cap) return null;
    return [...days.slice(0, -2), [...days.at(-2)!, ...days.at(-1)!], []];
  };
  const outboundDays = moveFirst(partitions[0]!);
  const returnDays = moveLast(partitions[0]!);
  if (outboundDays) partitions.push(outboundDays);
  if (returnDays) partitions.push(returnDays);
  if (outboundDays) { const both = moveLast(outboundDays); if (both) partitions.push(both); }
  const balanced = requirement.journey?.departureMinute != null ? balanceJourneyDays(requirement, stops, transfer, outbound, returning, cap) : [];
  if (balanced.length) partitions.push(balanced);
  const score = (result: ReturnType<typeof scheduleJourneyEvidence>) => {
    const checked = validatePlannerDays(requirement, result.days, stops, result.travelOnlyDays);
    return (result.check.status === "VIOLATION" ? 100 : result.check.status === "INSUFFICIENT_DATA" ? 10 : 0)
      + checked.checks.reduce((sum, check) => sum + (check.status === "VIOLATION" ? 100 : check.status === "INSUFFICIENT_DATA" ? 10 : 0), 0)
      + result.days.filter(day => day.journeyDayKind === "EMPTY").length * 100;
  };
  let best = original, bestScore = score(original), bestIdle = idleBeforeLastDay(original.days, original.journeyPlan);
  for (const partition of partitions.slice(1)) {
    const result = scheduleJourneyEvidence(requirement, partition, transfer, outbound, returning);
    const resultScore = score(result), resultIdle = idleBeforeLastDay(result.days, result.journeyPlan);
    if (resultScore < bestScore || (preferFullDays && resultScore === bestScore && resultIdle < bestIdle)) { best = result; bestScore = resultScore; bestIdle = resultIdle; }
  }
  return best;
}

/** Squared so one empty afternoon costs more than several short gaps. The last day is free: leaving early helps the return. */
const idleCost = (endMinute: number) => Math.max(0, PLANNING_WINDOW.endMinute - endMinute) ** 2;
function idleBeforeLastDay(days: readonly PlannerDay[], plan: JourneyPlan): number {
  return days.slice(0, -1).reduce((sum, day) => {
    const end = day.stops.at(-1)?.departureMinute ?? (day.day === 1 ? plan.legs.find(leg => leg.kind === "OUTBOUND")?.endMinute : null);
    return end == null ? sum : sum + idleCost(end);
  }, 0);
}

/**
 * Best day boundaries for the SAME chain, all routes verified. Driving and clocks
 * restart each day, so each (day, offset) can be costed alone. Costs mirror planJourney's score.
 */
function balanceJourneyDays(requirement: TripRequirementInput, stops: readonly PlannerCandidate[], transfer: ReadonlyMap<string, TravelLeg>, outbound: JourneyRoute, returning: JourneyRoute, cap: number): PlannerCandidate[][] {
  const dayCount = requirement.durationDays, journey = requirement.journey!;
  const returnMinutes = (start: number, driven: number) => start + Math.ceil(returning.durationSeconds! / 60) + driveWithRest(returning.durationSeconds!, driven, requirement.transport).restMinutes;
  const returnCost = (end: number) => end >= 1440 || (journey.returnDeadlineMinute != null && end > journey.returnDeadlineMinute) ? 100 : 0;
  const costOfDay = (dayIndex: number, offset: number, count: number) => {
    const isLast = dayIndex === dayCount - 1;
    if (!count) {
      if (dayIndex === 0 && offset === 0) {
        const arrival = journey.departureMinute! + Math.ceil(outbound.durationSeconds! / 60) + driveWithRest(outbound.durationSeconds!, 0, requirement.transport).restMinutes;
        return { cost: 0, load: isLast ? 0 : idleCost(arrival) };
      }
      if (!isLast || offset !== stops.length) return { cost: 100, load: 0 };
      return { cost: journey.returnDepartureMinute == null ? 10 : returnCost(returnMinutes(journey.returnDepartureMinute, 0)), load: 0 };
    }
    const today = stops.slice(offset, offset + count), restBefore = new Map<string, number>();
    let driven = 0, start: number | undefined;
    for (const stop of today) {
      if (stop === stops[0]) {
        restBefore.set(stop.id, 0);
        if (dayIndex === 0) {
          const drive = driveWithRest(outbound.durationSeconds!, 0, requirement.transport);
          start = journey.departureMinute! + Math.ceil(outbound.durationSeconds! / 60) + drive.restMinutes;
          driven = drive.accumulatedSeconds;
        }
      } else {
        const drive = driveWithRest(transfer.get(stop.id)!.durationSeconds!, driven, requirement.transport);
        restBefore.set(stop.id, drive.restMinutes);
        driven = drive.accumulatedSeconds;
      }
      driven = afterVisitDriving(driven, visitDuration(stop)!);
    }
    const scheduled = schedulePlannerDays({ ...requirement, startDate: dateForDay(requirement.startDate, dayIndex) }, [today], transfer, { starts: new Map(start === undefined ? [] : [[1, start]]), restBefore })[0]!.stops;
    const departure = scheduled.at(-1)!.departureMinute;
    return {
      cost: scheduled.filter(stop => stop.scheduleState !== "PLANNED").length * 100 + (isLast && departure !== null ? returnCost(returnMinutes(departure, driven)) : 0),
      load: isLast || departure === null ? 0 : idleCost(departure),
    };
  };
  type Plan = { days: PlannerCandidate[][]; cost: number; load: number };
  const memo = new Map<string, Plan | null>();
  const solve = (dayIndex: number, offset: number): Plan | null => {
    if (dayIndex === dayCount) return offset === stops.length ? { days: [], cost: 0, load: 0 } : null;
    const key = `${dayIndex}:${offset}`;
    if (memo.has(key)) return memo.get(key)!;
    let best: Plan | null = null;
    for (let count = Math.min(cap, stops.length - offset); count >= 0; count--) {
      const rest = solve(dayIndex + 1, offset + count);
      if (!rest) continue;
      const day = costOfDay(dayIndex, offset, count);
      const plan = { days: [stops.slice(offset, offset + count), ...rest.days], cost: day.cost + rest.cost, load: day.load + rest.load };
      if (!best || plan.cost < best.cost || (plan.cost === best.cost && plan.load < best.load)) best = plan;
    }
    memo.set(key, best);
    return best;
  };
  return solve(0, 0)?.days ?? [];
}

/**
 * Form planning only, where every stop was auto-selected: when no day boundaries
 * can fit the chain, drop stops until it fits. Never used for Assistant must-visits.
 */
export async function planJourneyFittingStops(requirement: TripRequirementInput, selected: readonly PlannerCandidate[][], provider: RouteProvider, timeoutMs = ROUTING_DEADLINE_MS) {
  const cache = new Map<string, Promise<unknown>>();
  const once = <T>(key: string, load: () => Promise<T>) => { if (!cache.has(key)) cache.set(key, load()); return cache.get(key) as Promise<T>; };
  const reused: RouteProvider = {
    route: (pair, signal) => once(`${pair.from.id}>${pair.to.id}`, () => provider.route(pair, signal)),
    ...(provider.coordinateRoute ? { coordinateRoute: (pair: CoordinateRoutePair, signal: AbortSignal) => once(`${pair.from.latitude},${pair.from.longitude}>${pair.to.latitude},${pair.to.longitude}`, () => provider.coordinateRoute!(pair, signal)) } : {}),
  };
  const usable = (result: Awaited<ReturnType<typeof planJourney>>, stops: readonly PlannerCandidate[]) => result.check.status !== "VIOLATION" && validatePlannerDays(requirement, result.days, stops, result.travelOnlyDays).checks.every(check => check.status !== "VIOLATION");
  const verified = (result: Awaited<ReturnType<typeof planJourney>>) => result.journeyPlan.legs.every(leg => leg.route.status === "VERIFIED");
  const deadline = Date.now() + timeoutMs;
  const chain = selected.flat();
  const plan = (kept: ReadonlySet<PlannerCandidate>) => planJourney(requirement, selected.map(day => day.filter(stop => kept.has(stop))), reused, Math.max(1, deadline - Date.now()), true, undefined, true);
  const fits = (result: Awaited<ReturnType<typeof planJourney>>, kept: ReadonlySet<PlannerCandidate>) => usable(result, chain.filter(stop => kept.has(stop)));
  const original = await plan(new Set(chain));
  if (fits(original, new Set(chain)) || !verified(original)) return { ...original, selected: chain, reduced: false };
  const kept = new Set(chain), dropped: PlannerCandidate[] = [];
  let best: Awaited<ReturnType<typeof planJourney>> | null = null;
  while (kept.size > 1 && Date.now() < deadline) {
    // Well-known stops go last, whatever their place in the chain.
    const remaining = chain.filter(stop => kept.has(stop));
    const drop = remaining.findLast(stop => !isFeaturedDestination(stop)) ?? remaining.at(-1)!;
    kept.delete(drop); dropped.push(drop);
    const result = await plan(kept);
    if (!verified(result)) break;
    if (fits(result, kept)) { best = result; break; }
  }
  if (!best) return { ...original, selected: chain, reduced: false };
  // Dropping is one-way, so an earlier drop may have been unnecessary. Well-known stops were dropped last, so they retry first.
  for (const stop of dropped.reverse().slice(1)) {
    if (Date.now() >= deadline) break;
    kept.add(stop);
    const result = await plan(kept);
    if (verified(result) && fits(result, kept) && result.check.status === best.check.status) best = result;
    else kept.delete(stop);
  }
  return { ...best, selected: chain.filter(stop => kept.has(stop)), reduced: kept.size < chain.length };
}

/** Owner-approved 2026-11-07. Advisory only: long days are allowed, never silently so. */
export const DAILY_DRIVING_WARNING_HOURS: Record<TripRequirementInput["transport"], number> = { CAR: 8, MOTORCYCLE: 6 };
export function journeyDrivingWarnings(requirement: TripRequirementInput, days: readonly PlannerDay[]): PlannerResult["warnings"] {
  const hours = DAILY_DRIVING_WARNING_HOURS[requirement.transport];
  return days.filter(day => (day.travelSeconds ?? 0) > hours * 3600).map(day => ({ code: "LONG_DRIVING_DAY", day: day.day, destinationId: null,
    message: `Ngày ${day.day} chạy xe khoảng ${Math.round(day.travelSeconds! / 360) / 10} giờ, vượt mức ${hours} giờ nên cân nhắc. Hãy thêm ngày hoặc bớt điểm.` }));
}

export function scheduleJourneyEvidence(requirement: TripRequirementInput, selected: readonly PlannerCandidate[][], transfer: ReadonlyMap<string, TravelLeg>, outbound: JourneyRoute, returning: JourneyRoute, fixedArrivals?: ReadonlyMap<string, number>) {
  const stops = selected.flat(), first = stops[0], last = stops.at(-1);
  const outboundOnly = requirement.durationDays > 1 && selected[0]?.length === 0 && !!selected[1]?.length;
  const returnOnly = requirement.durationDays > 1 && selected.at(-1)?.length === 0 && !!selected.at(-2)?.length;
  const travelOnlyDays = new Set<number>([...(outboundOnly ? [1] : []), ...(returnOnly ? [requirement.durationDays] : [])]);
  const starts = new Map<number, number | null>();
  const restBefore = new Map<string, number | null>();
  const rests = new Map<string, number | null>();
  const departure = requirement.journey?.departureMinute ?? null;
  const outboundRest = outbound.status === "VERIFIED" ? driveWithRest(outbound.durationSeconds!, 0, requirement.transport).restMinutes : null;
  let accumulated: number | null = 0;
  for (const [dayIndex, day] of selected.entries()) {
    if (dayIndex > 0) accumulated = 0;
    for (const stop of day) {
      if (stop === first && outboundOnly) {
        restBefore.set(stop.id, 0);
        rests.set(stop.id, outboundRest);
        accumulated = 0;
        continue;
      }
      const route = stop === first ? outbound : transfer.get(stop.id);
      if (!route || route.status !== "VERIFIED" || accumulated === null) { accumulated = null; restBefore.set(stop.id, null); rests.set(stop.id, null); }
      else {
        const calculated = driveWithRest(route.durationSeconds!, accumulated, requirement.transport);
        accumulated = calculated.accumulatedSeconds;
        restBefore.set(stop.id, stop === first ? 0 : calculated.restMinutes);
        rests.set(stop.id, calculated.restMinutes);
      }
      accumulated = accumulated === null ? visitDuration(stop)! >= 15 ? 0 : null : afterVisitDriving(accumulated, visitDuration(stop)!);
    }
  }
  const outboundArrival = departure === null || outbound.status !== "VERIFIED" ? null : departure + Math.ceil(outbound.durationSeconds! / 60) + (rests.get(first?.id ?? "") ?? 0);
  starts.set(1, outboundArrival);
  const days = schedulePlannerDays(requirement, selected, transfer, { starts, restBefore, fixedArrivals });
  if (returnOnly) accumulated = 0;
  const returnRest = returning.status === "VERIFIED" && accumulated !== null ? driveWithRest(returning.durationSeconds!, accumulated, requirement.transport).restMinutes : null;
  const finalStop = days.flatMap(day => day.stops).at(-1);
  const returnStart = returnOnly ? requirement.journey?.returnDepartureMinute ?? null : finalStop?.departureMinute ?? null;
  const returnEnd = returnStart === null || returning.status !== "VERIFIED" || returnRest === null ? null : returnStart + Math.ceil(returning.durationSeconds! / 60) + returnRest;
  const legs: JourneyPlan["legs"] = [];
  if (first) legs.push({ kind: "OUTBOUND", day: 1, from: { kind: "ORIGIN" }, to: { kind: "ATTRACTION", destinationId: first.id }, route: outbound,
    startMinute: departure, endMinute: starts.get(1) ?? null, restMinutes: rests.get(first.id) ?? null });
  for (const [index, current] of stops.entries()) {
    if (index === 0) continue;
    const previous = stops[index - 1]!;
    const day = days.find(day => day.stops.some(stop => stop.destination.id === current.id))!;
    const previousStop = days.flatMap(day => day.stops).find(stop => stop.destination.id === previous.id)!;
    const sameDay = day.stops.some(stop => stop.destination.id === previous.id);
    const start = sameDay ? previousStop.departureMinute : MORNING_DEPARTURE_MINUTE;
    const route = transfer.get(current.id)!;
    const rest = rests.get(current.id) ?? null;
    legs.push({ kind: "TRANSFER", day: day.day, from: { kind: "ATTRACTION", destinationId: previous.id }, to: { kind: "ATTRACTION", destinationId: current.id },
      route: { status: route.status, reason: route.reason, durationSeconds: route.durationSeconds, distanceMeters: route.distanceMeters, provider: route.provider, ...(route.geometry ? { geometry: route.geometry } : {}) },
      startMinute: start, endMinute: start === null || route.status !== "VERIFIED" || rest === null ? null : start + Math.ceil(route.durationSeconds! / 60) + rest, restMinutes: rest });
  }
  if (last) legs.push({ kind: "RETURN", day: requirement.durationDays, from: { kind: "ATTRACTION", destinationId: last.id }, to: { kind: "ORIGIN" }, route: returning, startMinute: returnStart, endMinute: returnEnd, restMinutes: returnRest });
  const complete = legs.length > 0 && legs.every(leg => leg.route.status === "VERIFIED" && leg.restMinutes !== null);
  const journeyPlan: JourneyPlan = { policy: REST_POLICY_VERSION, legs, totals: {
    drivingSeconds: complete ? legs.reduce((sum, leg) => sum + leg.route.durationSeconds!, 0) : null,
    restMinutes: complete ? legs.reduce((sum, leg) => sum + leg.restMinutes!, 0) : null,
    distanceMeters: complete ? legs.reduce((sum, leg) => sum + leg.route.distanceMeters!, 0) : null,
  } };
  // Per-day travel totals include origin legs exactly once; unknown is never zero.
  for (const day of days) {
    day.journeyDayKind = day.stops.length ? "VISITS" : outboundOnly && day.day === 1 ? "OUTBOUND_ONLY" : returnOnly && day.day === requirement.durationDays ? "RETURN_ONLY" : "EMPTY";
    const own = legs.filter(leg => leg.day === day.day);
    const known = (own.length > 0 || day.stops.length > 0) && own.every(leg => leg.route.status === "VERIFIED");
    day.distanceMeters = known ? own.reduce((sum, leg) => sum + leg.route.distanceMeters!, 0) : null;
    day.travelSeconds = known ? own.reduce((sum, leg) => sum + leg.route.durationSeconds!, 0) : null;
  }
  const findings: PlannerCheck["issues"] = [];
  let violation = false;
  const add = (code: string, message: string, day: number | null = null) => findings.push({ code, message, day, destinationId: null });
  if (missingJourneyFields(requirement.journey, returnOnly).length) add("JOURNEY_INPUT_MISSING", "Cần xác nhận nơi xuất phát và giờ đi/về để kiểm tra toàn hành trình.");
  for (const leg of legs) {
    if (leg.route.status !== "VERIFIED") add("JOURNEY_ROUTE_UNKNOWN", "Chưa có đủ dữ liệu định tuyến cho chặng bắt buộc.", leg.day);
    if (leg.endMinute !== null && leg.endMinute >= 1440) { violation = true; add("OVERNIGHT_DRIVING_UNSUPPORTED", "Chặng di chuyển kéo sang ngày tiếp theo, ngoài phạm vi hỗ trợ.", leg.day); }
  }
  const timingCheck = validateJourneyTiming(requirement, days, journeyPlan);
  findings.push(...timingCheck.issues);
  if (timingCheck.status === "VIOLATION") violation = true;
  if (returnEnd !== null && requirement.journey?.returnDeadlineMinute != null && returnEnd > requirement.journey.returnDeadlineMinute) { violation = true; add("RETURN_DEADLINE_MISSED", "Phương án không về kịp hạn đã chọn; hãy điều chỉnh giờ, điểm hoặc số ngày.", requirement.durationDays); }
  if (!stops.length) { violation = true; add("NO_SIGHTSEEING_TIME", "Phương án chưa có lượt tham quan; cần điều chỉnh nhu cầu."); }
  const check: PlannerCheck = { key: "TRAVEL_TIME", status: violation ? "VIOLATION" : findings.length ? "INSUFFICIENT_DATA" : "PASS", issues: findings };
  return { days, journeyPlan, check, travelOnlyDays };
}

/** Independent deterministic check of schedule/rest against route evidence. */
export function validateJourneyTiming(requirement: TripRequirementInput, days: readonly import("../trip-planner/planner-contract").PlannerDay[], plan: JourneyPlan): PlannerCheck {
  const issues: PlannerCheck["issues"] = [];
  let status: PlannerCheck["status"] = "PASS";
  let driving: number | null = 0, priorDay = 0;
  const visits = new Map(days.flatMap(day => day.stops.map(stop => [stop.destination.id, stop] as const)));
  const add = (code: string, day: number, violation = false) => {
    if (violation || status === "PASS") status = violation ? "VIOLATION" : "INSUFFICIENT_DATA";
    issues.push({ code, day, destinationId: null, message: violation ? "Thời gian chặng hoặc nghỉ dự kiến chưa khớp bằng chứng định tuyến." : "Chưa đủ dữ liệu để kiểm tra thời gian chặng và nghỉ dự kiến." });
  };
  for (const leg of plan.legs) {
    if (leg.day !== priorDay) { driving = 0; priorDay = leg.day; }
    if (leg.from.kind === "ATTRACTION") {
      const visit = visits.get(leg.from.destinationId);
      if (visit && visit.visitDurationMinutes >= 15) driving = 0;
    }
    if (leg.route.status !== "VERIFIED" || driving === null) { driving = null; add("JOURNEY_REST_UNKNOWN", leg.day); continue; }
    const expected = driveWithRest(leg.route.durationSeconds!, driving, requirement.transport);
    driving = expected.accumulatedSeconds;
    if (leg.restMinutes !== expected.restMinutes) add("JOURNEY_REST_MISMATCH", leg.day, true);
    if (leg.startMinute === null || leg.endMinute === null) { add("JOURNEY_CLOCK_UNKNOWN", leg.day); continue; }
    if (leg.endMinute !== leg.startMinute + Math.ceil(leg.route.durationSeconds! / 60) + expected.restMinutes) add("JOURNEY_TRAVEL_TIME_MISMATCH", leg.day, true);
    if (leg.to.kind === "ATTRACTION") {
      const visit = visits.get(leg.to.destinationId);
      const visitDay = days.find(day => day.stops.some(stop => stop.destination.id === (leg.to.kind === "ATTRACTION" ? leg.to.destinationId : "")));
      if (visitDay?.day === leg.day && visit?.arrivalMinute != null && visit.arrivalMinute < leg.endMinute) add("JOURNEY_ARRIVAL_TOO_EARLY", leg.day, true);
    }
  }
  return { key: "TRAVEL_TIME", status, issues };
}
