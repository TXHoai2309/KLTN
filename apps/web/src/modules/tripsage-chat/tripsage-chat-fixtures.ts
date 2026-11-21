import type { TripsageTripInfo } from "./tripsage-chat-context";

/** Test fixture: trip info the conversation would have recorded for a one-day car trip (pairs with COMPLETE_JOURNEY_FIXTURE). */
export const TRIP_INFO_FIXTURE: TripsageTripInfo = { transport: "CAR", durationDays: 1, startDate: "2026-11-02", interests: ["NATURE"] };

/** Every tool the planning chat registers with no optional feature group on, sorted. */
export const BASE_TOOL_NAMES_SORTED = ["addSuggestions", "estimateCosts", "fetchPage", "listDestinations", "lookupLocalKnowledge", "proposeItinerary", "recordTripInfo", "requestOrigin", "searchPlaces", "suggestReplies", "webSearch"];
