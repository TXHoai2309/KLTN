import { z } from "zod";
import type { TripJourney } from "../trip-origin/trip-origin-contract";
import type { PlannerResult } from "../trip-planner/planner-contract";
import {
  INTEREST_VALUES,
  MAX_DURATION_DAYS,
  MIN_DURATION_DAYS,
  PACE_VALUES,
  TRANSPORT_VALUES,
  isValidCalendarDate,
  type TripInterest,
  type TripPace,
} from "../trip-requirement/trip-requirement-contract";

/**
 * Client-safe (pure, no server imports): the structured request context shared by the chat browser client
 * and the chat route. The server never trusts it beyond these strict schemas and re-validates everything it schedules.
 */

/**
 * Trip info the conversation has recorded so far (ADR-42). Every field is optional: the assistant fills it through
 * `recordTripInfo` as the traveler answers. The origin and clocks travel separately as `journey`.
 */
export const tripInfoSchema = z.object({
  transport: z.enum(TRANSPORT_VALUES).optional(),
  durationDays: z.number().int().min(MIN_DURATION_DAYS).max(MAX_DURATION_DAYS).optional(),
  startDate: z.string().refine(isValidCalendarDate).optional(),
  interests: z.array(z.enum(INTEREST_VALUES)).min(1).max(INTEREST_VALUES.length).optional(),
  pace: z.enum(PACE_VALUES).optional(),
  travelers: z.number().int().min(1).max(20).optional(),
}).strict();
export type TripsageTripInfo = z.infer<typeof tripInfoSchema>;

/** Second-cluster defaults the server applies without asking; always shown as defaults (ADR-42 §5). */
export const TRIP_INFO_DEFAULTS: { interests: TripInterest[]; pace: TripPace; travelers: number } = { interests: ["NATURE", "ADVENTURE"], pace: "MODERATE", travelers: 2 };
export type DefaultedField = keyof typeof TRIP_INFO_DEFAULTS;

export function withTripInfoDefaults(info: TripsageTripInfo) {
  const defaulted = (Object.keys(TRIP_INFO_DEFAULTS) as DefaultedField[]).filter(key => info[key] === undefined);
  return { info: { ...TRIP_INFO_DEFAULTS, ...info }, defaulted };
}

/** A change to these fields makes the previous itinerary obsolete, so it is no longer sent as the current one. */
export function changesItinerary(previous: TripsageTripInfo | null, next: TripsageTripInfo): boolean {
  return (["transport", "durationDays", "startDate"] as const).some(key => previous?.[key] !== undefined && previous[key] !== next[key]);
}

const minute = z.number().int().min(0).max(1440).nullable();
/** Compact summary of the latest itinerary: no coordinates, no checks, no routes. */
export const tripsageItinerarySummarySchema = z.object({
  days: z.array(z.object({
    day: z.number().int().min(1).max(MAX_DURATION_DAYS),
    stops: z.array(z.object({ id: z.string().min(1).max(120), name: z.string().min(1).max(200), arrivalMinute: minute, departureMinute: minute }).strict()).max(4),
  }).strict()).max(MAX_DURATION_DAYS),
}).strict();
export type TripsageItinerarySummary = z.infer<typeof tripsageItinerarySummarySchema>;

export function summarizeItinerary(result: PlannerResult): TripsageItinerarySummary {
  return {
    days: result.days.map(day => ({
      day: day.day,
      stops: day.stops.map(stop => ({ id: stop.destination.id, name: stop.destination.name, arrivalMinute: stop.arrivalMinute, departureMinute: stop.departureMinute })),
    })),
  };
}

/** Data parts the planning chat streams besides the itinerary. The browser renders only schema-valid parts. */
export const tripInfoPartSchema = z.object({ tripInfo: tripInfoSchema }).strict();
export const quickRepliesPartSchema = z.object({ replies: z.array(z.string().trim().min(1).max(40)).min(1).max(4) }).strict();
const clock = z.number().int().min(0).max(1439);
export const originRequestPartSchema = z.object({ departureMinute: clock, returnDeadlineMinute: clock }).strict();

export function buildTripsageChatBody(input: { messages: unknown[]; journey: TripJourney | null; tripInfo: TripsageTripInfo | null; itinerary: TripsageItinerarySummary | null }) {
  return { messages: input.messages, journey: input.journey, tripInfo: input.tripInfo, currentItinerary: input.itinerary };
}
