import type { TripRequirementInput } from "../trip-requirement/trip-requirement-contract";
import { weekdays } from "../destination/destination-contract";
import { isDestinationEligibleForNewItinerary } from "../destination/destination-eligibility";
import { interestScore, type PlannerCandidate } from "./planner-candidates";
import type { PlannerDay, PlannerStop, TravelLeg } from "./planner-contract";
import type { RoutePair } from "./planner-routes";

// Explicit preliminary planning preferences, not verified destination availability.
export const PLANNING_WINDOW = { startMinute: 480, endMinute: 1080 } as const;
export const PACE_STOP_LIMIT = { RELAXED: 2, MODERATE: 3, PACKED: 4 } as const;
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
export function haversine(a: PlannerCandidate, b: PlannerCandidate) {
  const rad = (x: number) => x * Math.PI / 180;
  const h = Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export function selectPlannerDays(requirement: TripRequirementInput, input: readonly PlannerCandidate[]): PlannerCandidate[][] {
  const cap = PACE_STOP_LIMIT[requirement.pace ?? "MODERATE"];
  const pool = [...new Map(input.filter(candidate => isDestinationEligibleForNewItinerary(candidate) && Number.isFinite(candidate.latitude) && Number.isFinite(candidate.longitude) && Math.abs(candidate.latitude) <= 90 && Math.abs(candidate.longitude) <= 180 && visitDuration(candidate) !== null && visitDuration(candidate)! <= 600).map(candidate => [candidate.id, candidate])).values()];
  const days: PlannerCandidate[][] = []; let previous: PlannerCandidate | undefined;
  let remainingBudget = Math.min(28, requirement.durationDays * cap, pool.length);
  for (let index = 0; index < requirement.durationDays; index++) {
    const date = dateForDay(requirement.startDate, index), today: PlannerCandidate[] = [];
    const count = Math.min(cap, Math.ceil(remainingBudget / (requirement.durationDays - index)));
    let visitBudget = 0;
    for (let slot = 0; slot < count; slot++) {
      const choices = pool.filter(candidate => {
        const hours = openingFor(candidate, date), duration = visitDuration(candidate)!;
        if (hours?.status === "CLOSED" || visitBudget + duration > 600) return false;
        return hours?.status !== "OPEN" || hours.intervals.some(interval => Math.min(interval.closesAtMinute, 1080) - Math.max(interval.opensAtMinute, 480) >= duration);
      });
      choices.sort((a, b) => {
        const interest = interestScore(b, requirement.interests) - interestScore(a, requirement.interests);
        if (!previous) return interest || a.id.localeCompare(b.id, "en");
        const distance = haversine(previous, a) - haversine(previous, b);
        // Same-area preference only breaks nearby ties; Haversine is NOT routing evidence.
        return distance + (a.area === previous.area ? -2 : 0) - (b.area === previous.area ? -2 : 0) - interest * 5 || a.id.localeCompare(b.id, "en");
      });
      const chosen = choices[0]; if (!chosen) break;
      today.push(chosen); previous = chosen; visitBudget += visitDuration(chosen)!;
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
export function schedulePlannerDays(requirement: TripRequirementInput, selected: readonly PlannerCandidate[][], routes: ReadonlyMap<string, TravelLeg>): PlannerDay[] {
  return selected.map((candidates, index) => {
    const date = dateForDay(requirement.startDate, index);
    let cursor: number | null = PLANNING_WINDOW.startMinute;
    const stops: PlannerStop[] = candidates.map((candidate, order) => {
      const inbound = routes.get(candidate.id) ?? null;
      const duration = visitDuration(candidate)!;
      if (inbound?.status === "INSUFFICIENT_DATA") cursor = null;
      else if (cursor !== null && inbound) cursor += Math.ceil(inbound.durationSeconds! / 60);
      let arrival = cursor;
      const hours = openingFor(candidate, date);
      if (arrival !== null && hours?.status === "OPEN") {
        const interval = hours.intervals.find(interval => Math.max(arrival!, interval.opensAtMinute) + duration <= Math.min(interval.closesAtMinute, 1080));
        arrival = interval ? Math.max(arrival, interval.opensAtMinute) : null;
      }
      const impossible = cursor !== null && (hours?.status === "CLOSED" || arrival === null || arrival + duration > PLANNING_WINDOW.endMinute);
      const state = impossible ? "UNSCHEDULED" : arrival === null ? "TIME_UNKNOWN" : "PLANNED";
      if (state !== "PLANNED") arrival = null;
      const departure = arrival === null ? null : arrival + duration;
      cursor = departure;
      const { id, name, description, area, address, category, latitude, longitude, image } = candidate;
      return { order: order + 1, destination: { id, name, description, area, address, category, latitude, longitude, image }, arrivalMinute: arrival,
        departureMinute: departure, visitDurationMinutes: duration, scheduleState: state, inbound, validationStatus: "INSUFFICIENT_DATA" };
    });
    const complete = stops.length > 0 && stops.every(stop => !stop.inbound || stop.inbound.status === "VERIFIED");
    return { day: index + 1, date, stops, distanceMeters: complete ? stops.reduce((sum, stop) => sum + (stop.inbound?.distanceMeters ?? 0), 0) : null,
      travelSeconds: complete ? stops.reduce((sum, stop) => sum + (stop.inbound?.durationSeconds ?? 0), 0) : null };
  });
}
