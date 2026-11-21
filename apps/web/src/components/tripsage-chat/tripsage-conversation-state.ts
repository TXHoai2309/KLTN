import {
  changesItinerary,
  originRequestPartSchema,
  quickRepliesPartSchema,
  tripInfoPartSchema,
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
  /** Assistant message carrying the newest itinerary part (validated by the caller's parser). */
  lastItineraryMessageId: string | null;
  /** True once a plan-affecting trip info change arrived after the newest itinerary: it is no longer the "current" one. */
  itineraryStale: boolean;
  originRequest: { messageId: string; departureMinute: number; returnDeadlineMinute: number } | null;
  quickReplies: { messageId: string; replies: string[] } | null;
  /** Timeline of the newest itinerary and the suggestions made for it since (a new itinerary starts a fresh list). */
  timeline: TimelinePart | null;
  suggestions: TimelineSuggestion[];
  /** Newest cost table and the message carrying it. */
  cost: { messageId: string; data: CostPart } | null;
  /** Newest access leg; sent back so later cost tables include it. */
  accessLeg: { messageId: string; data: AccessLegPart } | null;
};

/** Reads the conversation in order; only schema-valid parts count. Quick replies and the origin card belong to the last assistant message only. */
export function readConversationState(messages: readonly Message[], isItinerary: (data: unknown) => boolean): ConversationState {
  let tripInfo: TripsageTripInfo | null = null;
  let lastItineraryMessageId: string | null = null;
  let itineraryStale = false;
  let originRequest: ConversationState["originRequest"] = null;
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
      } else if (part.type === "data-itinerary" && isItinerary(part.data)) {
        lastItineraryMessageId = message.id; itineraryStale = false; timeline = null; suggestions = [];
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
      } else if (lastIsAssistant && message === lastAssistant && part.type === "data-origin-request") {
        const parsed = originRequestPartSchema.safeParse(part.data);
        if (parsed.success) originRequest = { messageId: message.id, ...parsed.data };
      } else if (lastIsAssistant && message === lastAssistant && part.type === "data-quick-replies") {
        const parsed = quickRepliesPartSchema.safeParse(part.data);
        if (parsed.success) quickReplies = { messageId: message.id, replies: parsed.data.replies };
      }
    }
  }
  return { tripInfo, lastItineraryMessageId, itineraryStale, originRequest, quickReplies, timeline, suggestions, cost, accessLeg };
}
