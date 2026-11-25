import type { PlannerResult } from "@/modules/trip-planner/planner-contract";
import { tripJourneySchema, type TripJourney } from "@/modules/trip-origin/trip-origin-contract";
import {
  changesItinerary,
  journeyPartSchema,
  originCandidatesPartSchema,
  quickRepliesPartSchema,
  tripInfoPartSchema,
  type OriginCandidateDisplay,
  type TripsageTripInfo,
} from "@/modules/tripsage-chat/tripsage-chat-context";
import {
  chosenLodgingListToMap,
  chosenLodgingsPartSchema,
  dedupeTimelineSuggestions,
  pruneChosenLodgings,
  suggestionsPartSchema,
  timelinePartSchema,
  type ChosenLodgingMap,
  type TimelinePart,
  type TimelineSuggestion,
} from "@/modules/tripsage-chat/tripsage-timeline";
import { costPartSchema, type CostPart } from "@/modules/tripsage-chat/tripsage-cost";
import { accessLegPartSchema, type AccessLegPart } from "@/modules/tripsage-chat/tripsage-access-leg";

type Part = { type: string; data?: unknown };
type Message = { id: string; role: string; parts: readonly Part[] };

export type ConversationState = {
  /** Latest schema-valid trip info the server recorded. */
  tripInfo: TripsageTripInfo | null;
  /** Latest server-confirmed journey from `data-journey`. */
  journey: TripJourney | null;
  /** Assistant message carrying the newest itinerary part (validated by the caller's parser). */
  lastItineraryMessageId: string | null;
  /** True once a plan-affecting trip info or journey change arrived after the newest itinerary: it is no longer the "current" one. */
  itineraryStale: boolean;
  /** Origin candidate quick-reply buttons on the last assistant message (ADR-43 §3). */
  originCandidates: { messageId: string; candidates: OriginCandidateDisplay[] } | null;
  /** Latest signed origin candidate token to carry back on the next turn; cleared once a later `data-journey` confirms an origin. */
  originCandidatesToken: string | null;
  quickReplies: { messageId: string; replies: string[] } | null;
  /** Timeline of the newest itinerary and the suggestions made for it since (a new itinerary starts a fresh list). */
  timeline: TimelinePart | null;
  suggestions: TimelineSuggestion[];
  /** Chosen lodgings restored from persisted conversation state for the newest itinerary (Ticket 10). */
  chosenLodgings: ChosenLodgingMap;
  /** Newest cost table and the message carrying it. */
  cost: { messageId: string; data: CostPart } | null;
  /** Newest access leg; sent back so later cost tables include it. */
  accessLeg: { messageId: string; data: AccessLegPart } | null;
};

function sameJourney(a: TripJourney | null, b: TripJourney): boolean {
  if (!a) return false;
  return a.origin?.label === b.origin?.label
    && a.origin?.latitude === b.origin?.latitude
    && a.origin?.longitude === b.origin?.longitude
    && a.departureMinute === b.departureMinute
    && a.returnDeadlineMinute === b.returnDeadlineMinute;
}

export const STALE_ITINERARY_MESSAGE = "Thông tin chuyến đã đổi — bản lịch này chưa cập nhật";

/**
 * Bug 7: returns true when the current recorded trip info or confirmed journey differs from the displayed proposal
 * (startDate, durationDays, transport, travelers, or origin), so the UI flags the plan stale and locks Save.
 */
export function isProposalOutdated(input: {
  proposal: PlannerResult;
  tripInfo?: TripsageTripInfo | null;
  journey?: TripJourney | null;
  cost?: CostPart | null;
  itineraryStale?: boolean;
}): boolean {
  if (input.itineraryStale) return true;
  const { proposal, tripInfo, journey, cost } = input;
  if (tripInfo) {
    if (tripInfo.startDate && proposal.requirement.startDate && tripInfo.startDate !== proposal.requirement.startDate) return true;
    if (tripInfo.durationDays !== undefined && tripInfo.durationDays !== proposal.requirement.durationDays) return true;
    if (tripInfo.transport && tripInfo.transport !== proposal.requirement.transport) return true;
    if (tripInfo.travelers !== undefined && cost && tripInfo.travelers !== cost.travelers) return true;
  }
  const latestOrigin = journey?.origin?.label;
  const planOrigin = proposal.requirement.journey?.origin?.label;
  if (latestOrigin && planOrigin && latestOrigin !== planOrigin) return true;
  return false;
}

/** Reads the conversation in order; only schema-valid parts count. Quick replies and candidate buttons belong to the last assistant message only. */
export function readConversationState(messages: readonly Message[], isItinerary: (data: unknown) => boolean): ConversationState {
  let tripInfo: TripsageTripInfo | null = null;
  let journey: TripJourney | null = null;
  let lastItineraryMessageId: string | null = null;
  let itineraryStale = false;
  let itineraryTravelers: number | null = null;
  let originCandidates: ConversationState["originCandidates"] = null;
  let originCandidatesToken: string | null = null;
  let quickReplies: ConversationState["quickReplies"] = null;
  let timeline: TimelinePart | null = null;
  let suggestions: TimelineSuggestion[] = [];
  let chosenLodgings: ChosenLodgingMap = {};
  let latestItineraryDays = 0;
  let cost: ConversationState["cost"] = null;
  let accessLeg: ConversationState["accessLeg"] = null;
  const lastAssistant = [...messages].reverse().find(message => message.role === "assistant");
  const lastIsAssistant = messages.at(-1)?.role === "assistant";
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (part.type === "data-trip-info") {
        const parsed = tripInfoPartSchema.safeParse(part.data);
        if (!parsed.success) continue;
        const travelersChanged =
          itineraryTravelers !== null
          && parsed.data.tripInfo.travelers !== undefined
          && parsed.data.tripInfo.travelers !== itineraryTravelers;
        if (lastItineraryMessageId && (changesItinerary(tripInfo, parsed.data.tripInfo) || travelersChanged)) itineraryStale = true;
        tripInfo = parsed.data.tripInfo;
      } else if (part.type === "data-journey") {
        const parsed = journeyPartSchema.safeParse(part.data);
        if (!parsed.success) continue;
        if (lastItineraryMessageId && !sameJourney(journey, parsed.data.journey)) itineraryStale = true;
        journey = parsed.data.journey;
        if (parsed.data.journey.origin?.confirmed) originCandidatesToken = null;
      } else if (part.type === "data-origin-candidates") {
        const parsed = originCandidatesPartSchema.safeParse(part.data);
        if (!parsed.success) continue;
        originCandidatesToken = parsed.data.token;
        if (lastIsAssistant && message === lastAssistant) {
          originCandidates = { messageId: message.id, candidates: parsed.data.candidates };
        }
      } else if (part.type === "data-itinerary" && isItinerary(part.data)) {
        lastItineraryMessageId = message.id; itineraryStale = false; timeline = null; suggestions = [];
        itineraryTravelers = tripInfo?.travelers ?? null;
        const days = Array.isArray((part.data as { days?: unknown[] } | null)?.days) ? (part.data as { days: unknown[] }).days.length : 0;
        latestItineraryDays = days;
        chosenLodgings = days > 0 ? pruneChosenLodgings(chosenLodgings, days) : {};
        const embeddedJourney = tripJourneySchema.safeParse((part.data as { requirement?: { journey?: unknown } } | null)?.requirement?.journey);
        if (embeddedJourney.success && embeddedJourney.data.origin?.confirmed) {
          journey = embeddedJourney.data;
        }
      } else if (part.type === "data-timeline" && message.id === lastItineraryMessageId) {
        const parsed = timelinePartSchema.safeParse(part.data);
        if (parsed.success) timeline = parsed.data;
      } else if (part.type === "data-suggestions" && lastItineraryMessageId) {
        const parsed = suggestionsPartSchema.safeParse(part.data);
        if (parsed.success) suggestions = dedupeTimelineSuggestions([...suggestions, ...parsed.data.suggestions]);
      } else if (part.type === "data-chosen-lodgings" && lastItineraryMessageId) {
        const parsed = chosenLodgingsPartSchema.safeParse(part.data);
        if (parsed.success) {
          const restored = chosenLodgingListToMap(parsed.data.chosenLodgings);
          chosenLodgings = latestItineraryDays > 0 ? pruneChosenLodgings(restored, latestItineraryDays) : restored;
        }
      } else if (part.type === "data-access-leg") {
        const parsed = accessLegPartSchema.safeParse(part.data);
        if (parsed.success) accessLeg = { messageId: message.id, data: parsed.data };
      } else if (part.type === "data-cost") {
        const parsed = costPartSchema.safeParse(part.data);
        if (parsed.success) cost = { messageId: message.id, data: parsed.data };
      } else if (lastIsAssistant && message === lastAssistant && part.type === "data-quick-replies") {
        const parsed = quickRepliesPartSchema.safeParse(part.data);
        if (parsed.success) quickReplies = { messageId: message.id, replies: parsed.data.replies };
      }
    }
  }
  if (latestItineraryDays > 0) {
    chosenLodgings = pruneChosenLodgings(chosenLodgings, latestItineraryDays, suggestions);
  }
  return { tripInfo, journey, lastItineraryMessageId, itineraryStale, originCandidates, originCandidatesToken, quickReplies, timeline, suggestions, chosenLodgings, cost, accessLeg };
}
