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
import { suggestionsPartSchema, timelinePartSchema, type TimelinePart, type TimelineSuggestion } from "@/modules/tripsage-chat/tripsage-timeline";
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

/** Reads the conversation in order; only schema-valid parts count. Quick replies and candidate buttons belong to the last assistant message only. */
export function readConversationState(messages: readonly Message[], isItinerary: (data: unknown) => boolean): ConversationState {
  let tripInfo: TripsageTripInfo | null = null;
  let journey: TripJourney | null = null;
  let lastItineraryMessageId: string | null = null;
  let itineraryStale = false;
  let originCandidates: ConversationState["originCandidates"] = null;
  let originCandidatesToken: string | null = null;
  let quickReplies: ConversationState["quickReplies"] = null;
  let timeline: TimelinePart | null = null;
  let suggestions: TimelineSuggestion[] = [];
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
        if (lastItineraryMessageId && changesItinerary(tripInfo, parsed.data.tripInfo)) itineraryStale = true;
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
        const embeddedJourney = tripJourneySchema.safeParse((part.data as { requirement?: { journey?: unknown } } | null)?.requirement?.journey);
        if (embeddedJourney.success && embeddedJourney.data.origin?.confirmed) {
          journey = embeddedJourney.data;
        }
      } else if (part.type === "data-timeline" && message.id === lastItineraryMessageId) {
        const parsed = timelinePartSchema.safeParse(part.data);
        if (parsed.success) timeline = parsed.data;
      } else if (part.type === "data-suggestions" && lastItineraryMessageId) {
        const parsed = suggestionsPartSchema.safeParse(part.data);
        if (parsed.success) suggestions = [...suggestions, ...parsed.data.suggestions];
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
  return { tripInfo, journey, lastItineraryMessageId, itineraryStale, originCandidates, originCandidatesToken, quickReplies, timeline, suggestions, cost, accessLeg };
}
