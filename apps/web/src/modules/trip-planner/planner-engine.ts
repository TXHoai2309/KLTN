import type { TripRequirementInput } from "../trip-requirement/trip-requirement-contract";
import { weekdays } from "../destination/destination-contract";
import { isDestinationEligibleForNewItinerary } from "../destination/destination-eligibility";
import type { PlannerCandidate } from "./planner-candidates";
import { orderPlannerCandidates, pickPlannerStops } from "./planner-order";
export { haversine } from "./planner-geography";
import { estimateSeconds } from "./planner-geography";
import type { PlannerDay, PlannerStop, TravelLeg } from "./planner-contract";
import type { RoutePair } from "./planner-routes";

// Explicit preliminary planning preferences, not verified destination availability.
export const PLANNING_WINDOW = { startMinute: 480, endMinute: 1080 } as const;
/** ADR-55: lunch once a visit ends 11:15–14:00, or when the drive to the next stop would pass 12:00. */
export const LUNCH = { fromMinute: 675, toMinute: 840, byMinute: 720, minutes: 60 } as const;
export function takesLunchAfter(departureMinute: number | null, nextDriveMinutes: number | null): boolean {
  if (departureMinute === null) return false;
  if (departureMinute >= LUNCH.fromMinute) return departureMinute <= LUNCH.toMinute;
  return nextDriveMinutes !== null && departureMinute + nextDriveMinutes > LUNCH.byMinute;
}
/** ADR-55: from Day 2, breakfast then travel at 07:30 (was 06:00). Visits still begin within the planning window. */
export const MORNING_DEPARTURE_MINUTE = 450;
/** Earliest a day's first drive can physically start; the Validator's bound, so plans saved under the 06:00 rule stay valid. */
export const EARLIEST_DEPARTURE_MINUTE = 360;
export const BREAKFAST_MINUTES = 30;
/** ADR-55: a day is bounded by time, not a stop count; this only keeps the day search and payloads bounded. */
export const MAX_STOPS_PER_DAY = 8;
/** ADR-55: relaxed pace ends the day earlier and stops longer on the road; it no longer caps stops. */
export const dayEndMinute = (requirement: Pick<TripRequirementInput, "pace" | "dayRhythm">) =>
  Math.min(requirement.dayRhythm?.dayEndMinute ?? (requirement.pace === "RELAXED" ? 1020 : PLANNING_WINDOW.endMinute), PLANNING_WINDOW.endMinute);
/**
 * ADR-55: roadside photo stops on a drive of 10+ minutes. Kept after the route leg ends and before the visit, so the
 * Validator's exact leg/rest checks are unchanged.
 */
export function scenicBufferMinutes(drivingSeconds: number | null, requirement: Pick<TripRequirementInput, "transport" | "pace">): number {
  const minutes = (drivingSeconds ?? 0) / 60;
  if (minutes < 10) return 0;
  const relaxed = requirement.pace === "RELAXED" ? 1.5 : 1;
  const share = requirement.transport === "MOTORCYCLE" ? 0.2 : 0.15;
  return Math.min(Math.round(25 * relaxed / 5) * 5, Math.round(minutes * share * relaxed / 5) * 5);
}
export function dateForDay(startDate: string | null, index: number): string | null {
  if (!startDate) return null;
  const date = new Date(`${startDate}T00:00:00+07:00`);
  date.setUTCDate(date.getUTCDate() + index);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
export function weekdayOf(date: string) { return weekdays[(new Date(`${date}T12:00:00+07:00`).getUTCDay() + 6) % 7]; }
export function openingFor(candidate: PlannerCandidate, date: string | null) { return date ? candidate.openingDays.find(day => day.dayOfWeek === weekdayOf(date)) : undefined; }
export function visitDuration(candidate: PlannerCandidate) {
  const suggested = candidate.suggestedDurationMinutes, minimum = candidate.minimumDurationMinutes;
  if ((suggested !== null && (!Number.isInteger(suggested) || suggested <= 0)) || (minimum !== null && (!Number.isInteger(minimum) || minimum <= 0))) return null;
  if (suggested === null && minimum === null) return null;
  return Math.max(suggested ?? 0, minimum ?? 0);
}
export function selectPlannerDays(requirement: TripRequirementInput, input: readonly PlannerCandidate[]): PlannerCandidate[][] {
  const cap = MAX_STOPS_PER_DAY;
  // ADR-55: a day holds what fits its clock (visits plus estimated drives); routing and the checks fit the final days.
  const dayBudget = dayEndMinute(requirement) - PLANNING_WINDOW.startMinute;
  const dates = Array.from({ length: requirement.durationDays }, (_, index) => dateForDay(requirement.startDate, index));
  const availableOn = (candidate: PlannerCandidate, date: string | null) => {
    const hours = openingFor(candidate, date), duration = visitDuration(candidate)!;
    return hours?.status !== "CLOSED" && (hours?.status !== "OPEN" || hours.intervals.some(interval => Math.min(interval.closesAtMinute, 1080) - Math.max(interval.opensAtMinute, 480) >= duration));
  };
  const eligible = [...new Map(input.filter(candidate => !candidate.external && isDestinationEligibleForNewItinerary(candidate) && Number.isFinite(candidate.latitude) && Number.isFinite(candidate.longitude) && Math.abs(candidate.latitude) <= 90 && Math.abs(candidate.longitude) <= 180 && visitDuration(candidate) !== null && visitDuration(candidate)! <= 600 && dates.some(date => availableOn(candidate, date))).map(candidate => [candidate.id, candidate])).values()];
  // How many average stops a day's clock holds: n visits and n − 1 drives of ~20 min. Keeps a far outlier out of a short trip.
  const averageVisit = eligible.reduce((sum, candidate) => sum + visitDuration(candidate)!, 0) / Math.max(1, eligible.length);
  const perDay = Math.max(1, Math.min(cap, Math.floor((dayBudget + 20) / (averageVisit + 20))));
  const budget = Math.min(28, requirement.durationDays * perDay, eligible.length);
  const picked = pickPlannerStops(requirement, eligible, budget);
  // The others stay behind as stand-ins for a date-specific closure.
  const pool = [...orderPlannerCandidates(requirement, picked, budget), ...eligible.filter(candidate => !picked.includes(candidate))];
  const days: PlannerCandidate[][] = [];
  let remainingBudget = budget;
  for (let index = 0; index < requirement.durationDays; index++) {
    const date = dateForDay(requirement.startDate, index), today: PlannerCandidate[] = [];
    const count = Math.min(cap, Math.ceil(remainingBudget / (requirement.durationDays - index)));
    let visitBudget = 0;
    for (let slot = 0; slot < count; slot++) {
      const chosen = pool.find(candidate => availableOn(candidate, date));
      // Carry the next geographic stop to tomorrow rather than jumping over it
      // to fill today's quota, then doubling back to it on a later day.
      const drive = chosen && today.length ? estimateSeconds(today.at(-1)!, chosen, requirement.transport) / 60 : 0;
      if (!chosen || visitBudget + drive + visitDuration(chosen)! > dayBudget) break;
      today.push(chosen); visitBudget += drive + visitDuration(chosen)!;
      pool.splice(pool.findIndex(candidate => candidate.id === chosen.id), 1); remainingBudget--;
    }
    days.push(today);
  }
  return days;
}
export function plannerRoutePairs(days: readonly PlannerCandidate[][], transport: TripRequirementInput["transport"]): RoutePair[] {
  const stops = days.flat();
  return stops.slice(1).map((to, index) => ({ from: stops[index]!, to, transport }));
}
export type JourneyScheduleTiming = { starts: ReadonlyMap<number, number | null>; restBefore: ReadonlyMap<string, number | null>; fixedArrivals?: ReadonlyMap<string, number> };
export function schedulePlannerDays(requirement: TripRequirementInput, selected: readonly PlannerCandidate[][], routes: ReadonlyMap<string, TravelLeg>, timing?: JourneyScheduleTiming): PlannerDay[] {
  return selected.map((candidates, index) => {
    const date = dateForDay(requirement.startDate, index);
    let cursor: number | null = timing?.starts.has(index + 1) ? timing.starts.get(index + 1)! : timing ? MORNING_DEPARTURE_MINUTE : PLANNING_WINDOW.startMinute;
    let lunched = false;
    // ADR-42 §3: per-trip lunch length and latest visit end; defaults keep the owner-approved 60 min and 18:00.
    const lunchMinutes = requirement.dayRhythm?.lunchMinutes ?? LUNCH.minutes;
    const dayEnd = dayEndMinute(requirement);
    const stops: PlannerStop[] = candidates.map((candidate, order) => {
      const inbound = routes.get(candidate.id) ?? null;
      const duration = visitDuration(candidate)!;
      if (inbound?.status === "INSUFFICIENT_DATA") cursor = null;
      else if (cursor !== null && inbound) cursor += Math.ceil(inbound.durationSeconds! / 60) + (timing ? scenicBufferMinutes(inbound.durationSeconds, requirement) : 0);
      if (timing?.restBefore.get(candidate.id) === null) cursor = null;
      else if (cursor !== null) cursor += timing?.restBefore.get(candidate.id) ?? 0;
      if (cursor !== null) cursor = Math.max(PLANNING_WINDOW.startMinute, cursor);
      // ADR-55: arrivals are shown as "about" times on a 5-minute grid; rounding up only adds slack.
      if (cursor !== null && timing) cursor = Math.ceil(cursor / 5) * 5;
      let arrival = cursor;
      const hours = openingFor(candidate, date);
      if (arrival !== null && hours?.status === "OPEN") {
        const interval = hours.intervals.find(interval => Math.max(arrival!, interval.opensAtMinute) + duration <= Math.min(interval.closesAtMinute, dayEnd));
        arrival = interval ? Math.max(arrival, interval.opensAtMinute) : null;
      }
      if (timing?.fixedArrivals?.has(candidate.id)) arrival = timing.fixedArrivals.get(candidate.id)!;
      const impossible = cursor !== null && (hours?.status === "CLOSED" || arrival === null || arrival + duration > dayEnd);
      const state = impossible ? "UNSCHEDULED" : arrival === null ? "TIME_UNKNOWN" : "PLANNED";
      if (state !== "PLANNED") arrival = null;
      const departure = arrival === null ? null : arrival + duration;
      cursor = departure;
      const nextDrive = order < candidates.length - 1 ? routes.get(candidates[order + 1]!.id)?.durationSeconds ?? null : null;
      if (timing && !lunched && order < candidates.length - 1 && takesLunchAfter(departure, nextDrive === null ? null : Math.ceil(nextDrive / 60))) {
        cursor = departure! + lunchMinutes; lunched = true;
      }
      const { id, name, description, area, address, category, latitude, longitude, image } = candidate;
      return { order: order + 1, destination: { id, name, description, area, address, category, latitude, longitude, image, ...(candidate.external ? { external: true as const } : {}) }, arrivalMinute: arrival,
        departureMinute: departure, visitDurationMinutes: duration, ...(candidate.userChosenDuration ? { userChosenDuration: true as const } : {}), scheduleState: state, inbound, validationStatus: "INSUFFICIENT_DATA" };
    });
    const complete = stops.length > 0 && stops.every(stop => !stop.inbound || stop.inbound.status === "VERIFIED");
    return { day: index + 1, date, stops, distanceMeters: complete ? stops.reduce((sum, stop) => sum + (stop.inbound?.distanceMeters ?? 0), 0) : null,
      travelSeconds: complete ? stops.reduce((sum, stop) => sum + (stop.inbound?.durationSeconds ?? 0), 0) : null };
  });
}
