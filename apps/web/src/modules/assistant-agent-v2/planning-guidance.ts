import type { PlannerResult } from "../trip-planner/planner-contract";
import { betweenDayNights, sameArea } from "../assistant-planning/planning-trip-structure";

/** Read-only planning guidance. Everything here is derived from the stored
 * canonical proposal; nothing is invented, retrieved, scheduled or published. */
export type GuidanceSignal =
  | { code: "DENSER_DAY"; day: number; stopCount: number; lighterDay: number; lighterStopCount: number }
  | { code: "LONG_TRAVEL_DAY"; day: number; travelMinutes: number }
  | { code: "LATE_FINISH"; day: number; finishMinute: number }
  | { code: "LATE_ARRIVAL_TO_OVERNIGHT"; day: number; finishMinute: number; area: string | null }
  | { code: "BALANCED_LOAD"; maxStopCount: number; maxTravelMinutes: number | null }
  | { code: "DATE_REQUIRED_FOR_HOURS" };
export type GuidanceFallback = { day: number; dropStop: string; reason: "LATE_FINISH" | "LONG_TRAVEL_DAY" | "DENSER_DAY" | "SLOWDOWN" };
export type GuidanceDay = { day: number; stops: string[]; stopCount: number; travelMinutes: number | null; finishMinute: number | null };
/** A night between two itinerary days. It is an area suggestion derived from the day-end stop,
 * never a lodging, a price or a booking, and it is not a sightseeing stop. */
export type GuidanceOvernight = { afterDay: number; area: string | null; nextDayLegMinutes: number | null; source: "DERIVED" | "USER" };
export type ProposalGuidance = {
  days: GuidanceDay[];
  overnights: GuidanceOvernight[];
  signals: GuidanceSignal[];
  fallbackSuggestions: GuidanceFallback[];
  validation: { status: PlannerResult["status"]; pendingChecks: string[]; eligibleForFinalConfirmation: boolean };
};

/** Product-judgement thresholds for "worth mentioning", not validation rules. */
export const LONG_TRAVEL_DAY_MINUTES = 240;
export const LATE_FINISH_MINUTE = 18 * 60;

export function analyzeCurrentProposal(proposal: Pick<PlannerResult, "days" | "status" | "checks" | "requirement" | "eligibleForFinalConfirmation">, tripStructure?: { overnightCount: number; overnightAreas?: { afterDay: number; area: string }[] }): ProposalGuidance {
  const days: GuidanceDay[] = proposal.days.map(day => {
    const legsKnown = day.stops.every(stop => stop.order === 1 || stop.inbound?.status === "VERIFIED");
    const seconds = day.stops.reduce((sum, stop) => sum + (stop.inbound?.status === "VERIFIED" ? stop.inbound.durationSeconds ?? 0 : 0), 0);
    const last = day.stops.at(-1);
    return {
      day: day.day, stops: day.stops.map(stop => stop.destination.name), stopCount: day.stops.length,
      travelMinutes: legsKnown && day.stops.length ? Math.round(seconds / 60) : null,
      finishMinute: last && day.stops.every(stop => stop.scheduleState === "PLANNED") ? last.departureMinute : null,
    };
  });
  const signals: GuidanceSignal[] = [];
  const reasons = new Map<number, GuidanceFallback["reason"]>();
  for (const day of days) {
    if (day.finishMinute !== null && day.finishMinute > LATE_FINISH_MINUTE) { signals.push({ code: "LATE_FINISH", day: day.day, finishMinute: day.finishMinute }); reasons.set(day.day, "LATE_FINISH"); }
    if (day.travelMinutes !== null && day.travelMinutes >= LONG_TRAVEL_DAY_MINUTES) { signals.push({ code: "LONG_TRAVEL_DAY", day: day.day, travelMinutes: day.travelMinutes }); if (!reasons.has(day.day)) reasons.set(day.day, "LONG_TRAVEL_DAY"); }
  }
  const densest = days.reduce<GuidanceDay | null>((best, day) => !best || day.stopCount > best.stopCount ? day : best, null);
  const lightest = days.reduce<GuidanceDay | null>((best, day) => !best || day.stopCount < best.stopCount ? day : best, null);
  if (densest && lightest && densest.stopCount >= 3 && densest.stopCount > lightest.stopCount) {
    signals.push({ code: "DENSER_DAY", day: densest.day, stopCount: densest.stopCount, lighterDay: lightest.day, lighterStopCount: lightest.stopCount });
    if (!reasons.has(densest.day)) reasons.set(densest.day, "DENSER_DAY");
  }
  if (!signals.length && days.length) {
    const travel = days.map(day => day.travelMinutes).filter((minutes): minutes is number => minutes !== null);
    signals.push({ code: "BALANCED_LOAD", maxStopCount: Math.max(...days.map(day => day.stopCount)), maxTravelMinutes: travel.length ? Math.max(...travel) : null });
    // No problem to fix, but "what if I run slow?" still needs an answer: the day with the most road time.
    const slowest = days.filter(day => day.stopCount >= 2).reduce<GuidanceDay | null>((best, day) => !best || (day.travelMinutes ?? 0) > (best.travelMinutes ?? 0) ? day : best, null);
    if (slowest) reasons.set(slowest.day, "SLOWDOWN");
  }
  const overnights: GuidanceOvernight[] = Array.from({ length: tripStructure ? betweenDayNights(proposal.days.length, tripStructure.overnightCount) : 0 }, (_, index) => {
    const lastStop = proposal.days[index]?.stops.at(-1), nextLeg = proposal.days[index + 1]?.stops[0]?.inbound;
    const area = lastStop?.destination.area?.trim() || null, wanted = tripStructure?.overnightAreas?.find(item => item.afterDay === index + 1);
    return { afterDay: index + 1, area, nextDayLegMinutes: nextLeg?.status === "VERIFIED" && nextLeg.durationSeconds !== null ? Math.round(nextLeg.durationSeconds / 60) : null, source: wanted && sameArea(wanted.area, area) ? "USER" as const : "DERIVED" as const };
  });
  for (const overnight of overnights) {
    const day = days.find(item => item.day === overnight.afterDay);
    if (day?.finishMinute != null && day.finishMinute > LATE_FINISH_MINUTE) signals.push({ code: "LATE_ARRIVAL_TO_OVERNIGHT", day: day.day, finishMinute: day.finishMinute, area: overnight.area });
  }
  const openingHours = proposal.checks.find(check => check.key === "OPENING_HOURS");
  if (!proposal.requirement.startDate && openingHours?.status !== "PASS") signals.push({ code: "DATE_REQUIRED_FOR_HOURS" });
  const fallbackSuggestions: GuidanceFallback[] = days.flatMap(day => {
    const reason = reasons.get(day.day), dropStop = day.stops.at(-1);
    return reason && dropStop && day.stopCount >= 2 ? [{ day: day.day, dropStop, reason }] : [];
  });
  return {
    days, overnights, signals, fallbackSuggestions,
    validation: { status: proposal.status, pendingChecks: proposal.checks.filter(check => check.status === "INSUFFICIENT_DATA").map(check => check.key), eligibleForFinalConfirmation: proposal.eligibleForFinalConfirmation },
  };
}
