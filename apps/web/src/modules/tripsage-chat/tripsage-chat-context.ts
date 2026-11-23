import { z } from "zod";
import { tripJourneySchema, type TripJourney } from "../trip-origin/trip-origin-contract";
import type { PlannerResult } from "../trip-planner/planner-contract";
import { ASSUMABLE_FIELDS, type AssumableField } from "../trip-validation/trip-proposal-contract";
import type { AccessLegPart } from "./tripsage-access-leg";
import { LODGING_KINDS } from "./tripsage-chat-parts";
import type { TimelineSuggestion } from "./tripsage-timeline";
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

export const overnightAreaConstraintSchema = z.object({
  afterDay: z.number().int().min(1).max(13),
  area: z.string().trim().min(2).max(60),
}).strict();
export type OvernightAreaConstraint = z.infer<typeof overnightAreaConstraintSchema>;

const clock = z.number().int().min(0).max(1439);

/** Default departure (07:00) and final-day return deadline (18:00) applied when the traveler has not set clocks (ADR-43). */
export const DEFAULT_DEPARTURE_MINUTE = 420;
export const DEFAULT_RETURN_DEADLINE_MINUTE = 1080;

function properNounRule(pattern: string, replacement: string): readonly [RegExp, string] {
  return [new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, "giu"), replacement];
}

const DOCUMENT_PROPER_NOUN_REPLACEMENTS: readonly (readonly [RegExp, string])[] = [
  properNounRule("lũng\\s+cú", "Lũng Cú"),
  properNounRule("quản\\s+bạ", "Quản Bạ"),
  properNounRule("hoàng\\s+su\\s+phì", "Hoàng Su Phì"),
  properNounRule("khâu\\s+vai", "Khâu Vai"),
  properNounRule("đồng\\s+văn", "Đồng Văn"),
  properNounRule("mèo\\s+vạc", "Mèo Vạc"),
  properNounRule("yên\\s+minh", "Yên Minh"),
  properNounRule("nho\\s+quế", "Nho Quế"),
  properNounRule("mã\\s+pì\\s+lèng", "Mã Pì Lèng"),
  properNounRule("tu\\s+sản", "Tu Sản"),
  properNounRule("sủng\\s+là", "Sủng Là"),
  properNounRule("lùng\\s+tám", "Lùng Tám"),
  properNounRule("căng\\s+bắc\\s+mê", "Căng Bắc Mê"),
  properNounRule("họ\\s+vương", "họ Vương"),
  properNounRule("vua\\s+mèo", "Vua Mèo"),
  properNounRule("cô\\s+tiên", "Cô Tiên"),
  properNounRule("nặm\\s+đăm", "Nặm Đăm"),
  properNounRule("chiêu\\s+lầu\\s+thi", "Chiêu Lầu Thi"),
  properNounRule("pả\\s+vi", "Pả Vi"),
  properNounRule("lô\\s+lô\\s+chải", "Lô Lô Chải"),
  properNounRule("hà\\s+thành", "Hà Thành"),
  properNounRule("du\\s+già", "Du Già"),
  properNounRule("hà\\s+giang", "Hà Giang"),
];

/** Normalizes capitalization of proper nouns inside reviewed RAG document source titles (C3). */
export function formatDocumentSourceTitle(rawTitle: string): string {
  let out = rawTitle.trim();
  if (!out) return "";
  for (const [pattern, replacement] of DOCUMENT_PROPER_NOUN_REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/**
 * Trip info the conversation has recorded so far (ADR-42 / ADR-43). Every field is optional: the assistant fills it through
 * `recordTripInfo` as the traveler answers. Confirmed origin coordinates travel separately in `journey`.
 */
export const tripInfoSchema = z.object({
  transport: z.enum(TRANSPORT_VALUES).optional(),
  durationDays: z.number().int().min(MIN_DURATION_DAYS).max(MAX_DURATION_DAYS).optional(),
  startDate: z.string().refine(isValidCalendarDate).optional(),
  interests: z.array(z.enum(INTEREST_VALUES)).min(1).max(INTEREST_VALUES.length).optional(),
  pace: z.enum(PACE_VALUES).optional(),
  travelers: z.number().int().min(1).max(20).optional(),
  /** Day rhythm (ADR-42 §3): lunch 60-120 min, latest visit end 15:00-18:00 (minutes of the day). */
  lunchMinutes: z.number().int().min(60).max(120).optional(),
  dayEndMinute: z.number().int().min(900).max(1080).optional(),
  /** Departure and final-day return deadline clocks recorded in chat (ADR-43, minutes of the day 0-1439). */
  departureMinute: clock.optional(),
  returnDeadlineMinute: clock.optional(),
  /** Required stops (ADR-43 §2, Glossary: Required stop): up to 4 destination IDs from `listDestinations`. */
  mustIncludeDestinationIds: z.array(z.string().trim().min(1).max(128)).max(4).optional(),
  /** Where the traveler lives (free text city name, ticket 04); never coordinates. */
  homeCity: z.string().trim().min(1).max(80).optional(),
  /** First-cluster fields filled as server assumptions in an Assumed draft (ADR-44). Cleared as the traveler confirms or changes them. */
  assumedFields: z.array(z.enum(ASSUMABLE_FIELDS)).max(ASSUMABLE_FIELDS.length).optional(),
  /** Set to true when the traveler declines the post-itinerary meal-suggestions offer so the assistant will not ask again (Ticket 12). */
  mealSuggestionsDeclined: z.boolean().optional(),
  /** Preferred lodging kind for reference price lookups (SerpApi D1); recorded once when the traveler answers. */
  lodgingKind: z.enum(LODGING_KINDS).optional(),
  /** Set to true when the traveler declines flying to Hà Nội so searchFlights is never called for this trip (SerpApi D7). */
  flightDeclined: z.boolean().optional(),
  /** Traveler-stated overnight area constraints (Point 1: e.g. "tối ngày 2 nghỉ ở Đồng Văn"), persisted across edit turns unless cleared. */
  overnightAreas: z.array(overnightAreaConstraintSchema).max(13).optional(),
}).strict();
export type TripsageTripInfo = z.infer<typeof tripInfoSchema>;
export type { AssumableField };

/** Second-cluster and clock defaults the server applies without asking; always shown as defaults (ADR-42 §5, ADR-43 §4). */
export const TRIP_INFO_DEFAULTS: {
  interests: TripInterest[];
  pace: TripPace;
  travelers: number;
  departureMinute: number;
  returnDeadlineMinute: number;
} = {
  interests: ["NATURE", "ADVENTURE"],
  pace: "PACKED", // owner decision 2026-11-22 (ADR-46): afternoons are used by default; the traveler can still ask for a calmer pace
  travelers: 2,
  departureMinute: DEFAULT_DEPARTURE_MINUTE,
  returnDeadlineMinute: DEFAULT_RETURN_DEADLINE_MINUTE,
};
export type DefaultedField = keyof typeof TRIP_INFO_DEFAULTS;

export function withTripInfoDefaults(info: TripsageTripInfo) {
  const defaulted = (Object.keys(TRIP_INFO_DEFAULTS) as DefaultedField[]).filter(key => info[key] === undefined);
  return { info: { ...TRIP_INFO_DEFAULTS, ...info }, defaulted };
}

/** Merges chat-recorded clocks (or visible 07:00 / 18:00 defaults) into a journey without touching origin coordinates. */
export function resolveEffectiveJourney(journey: TripJourney | null | undefined, tripInfo: TripsageTripInfo | null | undefined): TripJourney | null {
  if (!journey) return null;
  const departureMinute = tripInfo?.departureMinute ?? journey.departureMinute ?? DEFAULT_DEPARTURE_MINUTE;
  return {
    ...journey,
    // A final day with no visit is only the drive home; it leaves at the same clock as day 1 unless the traveler says otherwise.
    returnDepartureMinute: journey.returnDepartureMinute ?? departureMinute,
    departureMinute,
    returnDeadlineMinute: tripInfo?.returnDeadlineMinute ?? journey.returnDeadlineMinute ?? DEFAULT_RETURN_DEADLINE_MINUTE,
  };
}

/** A change to these fields makes the previous itinerary obsolete, so it is no longer sent as the current one. */
export function changesItinerary(previous: TripsageTripInfo | null, next: TripsageTripInfo): boolean {
  if (!previous) return false;
  if ((["transport", "durationDays", "startDate"] as const).some(key => previous[key] !== undefined && previous[key] !== next[key])) return true;
  if ((previous.mustIncludeDestinationIds ?? []).join(",") !== (next.mustIncludeDestinationIds ?? []).join(",")) return true;
  const overnightKey = (items?: readonly { afterDay: number; area: string }[]) =>
    (items ?? []).map(item => `${item.afterDay}:${item.area}`).join("|");
  if (overnightKey(previous.overnightAreas) !== overnightKey(next.overnightAreas)) return true;
  return (previous.departureMinute ?? DEFAULT_DEPARTURE_MINUTE) !== (next.departureMinute ?? DEFAULT_DEPARTURE_MINUTE)
    || (previous.returnDeadlineMinute ?? DEFAULT_RETURN_DEADLINE_MINUTE) !== (next.returnDeadlineMinute ?? DEFAULT_RETURN_DEADLINE_MINUTE);
}

const minute = z.number().int().min(0).max(1440).nullable();
/** Compact summary of the latest itinerary: no coordinates, no checks, no routes. */
export const tripsageItinerarySummarySchema = z.object({
  days: z.array(z.object({
    day: z.number().int().min(1).max(MAX_DURATION_DAYS),
    stops: z.array(z.object({ id: z.string().min(1).max(320), name: z.string().min(1).max(200), arrivalMinute: minute, departureMinute: minute }).strict()).max(4),
  }).strict()).max(MAX_DURATION_DAYS),
  /** Routed distance of the whole trip, for the fuel estimate only (never a validation input). */
  distanceKm: z.number().min(0).max(10_000).nullable().optional(),
}).strict();
export type TripsageItinerarySummary = z.infer<typeof tripsageItinerarySummarySchema>;

export function itineraryDistanceKm(result: PlannerResult): number | null {
  const meters = result.journeyPlan?.totals.distanceMeters ?? (result.days.every(day => typeof day.distanceMeters === "number") ? result.days.reduce((sum, day) => sum + day.distanceMeters!, 0) : null);
  return meters === null ? null : Math.round(meters / 100) / 10;
}

export function summarizeItinerary(result: PlannerResult): TripsageItinerarySummary {
  return {
    distanceKm: itineraryDistanceKm(result),
    days: result.days.map(day => ({
      day: day.day,
      stops: day.stops.map(stop => ({ id: stop.destination.id, name: stop.destination.name, arrivalMinute: stop.arrivalMinute, departureMinute: stop.departureMinute })),
    })),
  };
}

/** Data parts the planning chat streams besides the itinerary. The browser renders only schema-valid parts. */
export const tripInfoPartSchema = z.object({ tripInfo: tripInfoSchema }).strict();
export const quickRepliesPartSchema = z.object({ replies: z.array(z.string().trim().min(1).max(40)).min(1).max(4) }).strict();
export const originCandidateDisplaySchema = z.object({ candidateId: z.string().min(1).max(64), label: z.string().trim().min(1).max(300) }).strict();
export type OriginCandidateDisplay = z.infer<typeof originCandidateDisplaySchema>;
export const originCandidatesPartSchema = z.object({
  candidates: z.array(originCandidateDisplaySchema).min(1).max(3),
  token: z.string().min(1).max(8_192),
}).strict();
export type OriginCandidatesPart = z.infer<typeof originCandidatesPartSchema>;
export const journeyPartSchema = z.object({ journey: tripJourneySchema }).strict();
export type JourneyPart = z.infer<typeof journeyPartSchema>;

const safeDocumentTitle = z.string().trim().min(1).max(160)
  .refine(value => !/https?:\/\/|\/api\/|blob\.vercel-storage\.com|\b(?:file|data|javascript):/iu.test(value));
export const sourceItemSchema = z.union([
  z.object({ domain: z.string().min(3).max(253).regex(/^[a-z0-9.-]+$/u) }).strict(),
  z.object({ kind: z.literal("DOCUMENT"), title: safeDocumentTitle }).strict(),
]);
export const sourcesPartSchema = z.object({ sources: z.array(sourceItemSchema).min(1).max(12) }).strict();
export type ChatSourceItem = z.infer<typeof sourceItemSchema>;
export type SourcesPart = z.infer<typeof sourcesPartSchema>;

const MAX_CLIENT_HISTORY_MESSAGES = 40;

/**
 * Strips bulky non-text UI/tool/data parts (such as full `data-itinerary` geometries) before POSTing `messages`
 * to `/api/ai/chat`, because the server only reads text parts from `messages` and receives structured state
 * separately via `journey`, `tripInfo`, `currentItinerary` and `accessLeg`.
 */
export function compactChatMessagesForRequest(messages: readonly unknown[]): unknown[] {
  const compacted: unknown[] = [];
  for (const item of messages) {
    if (!item || typeof item !== "object" || !Array.isArray((item as { parts?: unknown }).parts)) {
      compacted.push(item);
      continue;
    }
    const record = item as { id?: unknown; role?: unknown; parts: unknown[] };
    const keptParts: unknown[] = [];
    let hasText = false;
    for (const part of record.parts) {
      if (!part || typeof part !== "object") continue;
      const obj = part as Record<string, unknown>;
      if (obj.type === "text" && typeof obj.text === "string") {
        hasText = true;
        keptParts.push({ type: "text", text: obj.text });
      } else if (record.role === "assistant" && obj.type === "data-hotels" && obj.data && typeof obj.data === "object") {
        const data = obj.data as Record<string, unknown>;
        const firstHotel = Array.isArray(data.hotels) && data.hotels[0] && typeof data.hotels[0] === "object"
          ? (data.hotels[0] as Record<string, unknown>)
          : null;
        if (typeof data.near === "string" && typeof firstHotel?.checkInDate === "string" && typeof firstHotel?.checkOutDate === "string") {
          keptParts.push({
            type: "data-hotels-ref",
            ...(typeof data.destinationId === "string" ? { destinationId: data.destinationId } : {}),
            near: data.near,
            checkInDate: firstHotel.checkInDate,
            checkOutDate: firstHotel.checkOutDate,
            ...(typeof data.kind === "string" ? { kind: data.kind } : {}),
            ...(typeof data.adults === "number" ? { adults: data.adults } : {}),
          });
        }
      } else if (record.role === "assistant" && obj.type === "data-hotels-ref") {
        keptParts.push(obj);
      } else if (record.role === "assistant" && obj.type === "data-flights" && obj.data && typeof obj.data === "object") {
        const data = obj.data as Record<string, unknown>;
        const firstOffer = Array.isArray(data.offers) && data.offers[0] && typeof data.offers[0] === "object"
          ? (data.offers[0] as Record<string, unknown>)
          : null;
        const firstPrice = firstOffer?.price && typeof firstOffer.price === "object"
          ? (firstOffer.price as Record<string, unknown>)
          : null;
        if (typeof data.departureDate === "string") {
          keptParts.push({
            type: "data-flights-ref",
            ...(typeof data.originAirport === "string" ? { originAirport: data.originAirport } : {}),
            departureDate: data.departureDate,
            ...(typeof data.returnDate === "string" ? { returnDate: data.returnDate } : {}),
            ...(typeof data.adults === "number" ? { adults: data.adults } : {}),
            ...(typeof data.roundTrip === "boolean" ? { roundTrip: data.roundTrip } : {}),
            ...(typeof firstPrice?.total === "string" ? { cheapestTotal: firstPrice.total } : {}),
            ...(typeof firstPrice?.currency === "string" ? { currency: firstPrice.currency } : {}),
            ...(typeof data.lookupDate === "string" ? { lookupDate: data.lookupDate } : {}),
          });
        }
      } else if (record.role === "assistant" && obj.type === "data-flights-ref") {
        keptParts.push(obj);
      }
    }
    if (record.role === "assistant" && !hasText && keptParts.length === 0) continue;
    compacted.push({
      ...(typeof record.id === "string" ? { id: record.id } : {}),
      role: record.role,
      parts: keptParts,
    });
  }
  return compacted.length > MAX_CLIENT_HISTORY_MESSAGES
    ? compacted.slice(-MAX_CLIENT_HISTORY_MESSAGES)
    : compacted;
}

export function buildTripsageChatBody(input: {
  messages: unknown[];
  journey: TripJourney | null;
  tripInfo: TripsageTripInfo | null;
  itinerary: TripsageItinerarySummary | null;
  suggestions?: readonly TimelineSuggestion[];
  accessLeg?: AccessLegPart | null;
  originCandidatesToken?: string | null;
  conversationId?: string | null;
}) {
  return {
    messages: compactChatMessagesForRequest(input.messages),
    journey: input.journey,
    tripInfo: input.tripInfo,
    currentItinerary: input.itinerary,
    ...(input.suggestions?.length ? { suggestions: input.suggestions.slice(0, 60) } : {}),
    accessLeg: input.accessLeg ?? null,
    originCandidatesToken: input.originCandidatesToken ?? null,
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
  };
}
