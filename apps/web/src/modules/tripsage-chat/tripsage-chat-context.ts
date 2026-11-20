import { z } from "zod";
import type { TripJourney } from "../trip-origin/trip-origin-contract";
import type { PlannerResult } from "../trip-planner/planner-contract";
import {
  INTEREST_VALUES,
  MAX_DURATION_DAYS,
  MIN_DURATION_DAYS,
  TRANSPORT_VALUES,
  isValidCalendarDate,
  type TripInterest,
  type TripTransport,
} from "../trip-requirement/trip-requirement-contract";
import { validateRequiredFields } from "../trip-requirement/trip-requirement-form-logic";

/**
 * Client-safe (pure, no server imports): the structured request context shared by the chat browser client
 * and the chat route. The server never trusts it beyond these strict schemas and re-validates everything it schedules.
 */

/** What the one-page info dialog collects. Origin and clocks travel separately as `journey`. */
export const tripsageRequirementSchema = z.object({
  transport: z.enum(TRANSPORT_VALUES),
  durationDays: z.number().int().min(MIN_DURATION_DAYS).max(MAX_DURATION_DAYS),
  startDate: z.string().refine(isValidCalendarDate),
  interests: z.array(z.enum(INTEREST_VALUES)).min(1).max(INTEREST_VALUES.length),
}).strict();
export type TripsageRequirement = z.infer<typeof tripsageRequirementSchema>;

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

export type TripsageRequirementDraft = { transport: "" | TripTransport; durationDays: string; startDate: string; interests: TripInterest[] };
export const EMPTY_REQUIREMENT_DRAFT: TripsageRequirementDraft = { transport: "", durationDays: "", startDate: "", interests: [] };

export function draftFromRequirement(requirement: TripsageRequirement | null): TripsageRequirementDraft {
  return requirement ? { transport: requirement.transport, durationDays: String(requirement.durationDays), startDate: requirement.startDate, interests: [...requirement.interests] } : { ...EMPTY_REQUIREMENT_DRAFT };
}

/** Same required-field rules as `/trips/new` (shared form logic), plus the date and interests the chat gate also demands. */
export function validateRequirementDraft(draft: TripsageRequirementDraft): { ok: true; requirement: TripsageRequirement } | { ok: false; errors: Record<string, string> } {
  const shared = validateRequiredFields({ startDate: draft.startDate, durationDays: draft.durationDays, transport: draft.transport, companionType: "", companionGroupSize: "", interests: draft.interests, pace: "", mobilityFlags: [], mobilityNote: "" });
  const errors: Record<string, string> = {};
  for (const key of ["durationDays", "transport", "startDate", "interests"]) if (shared[key]) errors[key] = shared[key];
  if (!draft.startDate.trim()) errors.startDate = "Vui lòng chọn ngày bắt đầu.";
  if (!draft.interests.length) errors.interests = "Vui lòng chọn ít nhất một sở thích.";
  if (Object.keys(errors).length) return { ok: false, errors };
  const parsed = tripsageRequirementSchema.safeParse({ transport: draft.transport, durationDays: Number(draft.durationDays), startDate: draft.startDate.trim(), interests: INTEREST_VALUES.filter(value => draft.interests.includes(value)) });
  return parsed.success ? { ok: true, requirement: parsed.data } : { ok: false, errors: { _form: "Vui lòng kiểm tra lại thông tin chuyến đi." } };
}

export const OPENING_MESSAGE = "Hãy lập hành trình theo thông tin mình vừa nhập.";
export const REPLAN_MESSAGE = "Mình vừa sửa thông tin chuyến đi. Hãy lập lại hành trình theo thông tin mới.";

export function buildTripsageChatBody(input: { messages: unknown[]; journey: TripJourney | null; requirement: TripsageRequirement | null; itinerary: TripsageItinerarySummary | null }) {
  return { messages: input.messages, journey: input.journey, requirement: input.requirement, currentItinerary: input.itinerary };
}
