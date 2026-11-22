import "server-only";
import { z } from "zod";
import { isValidCalendarDate } from "../trip-requirement/trip-requirement-contract";
import { cleanPlaceName } from "./tripsage-places";
import type { SerpApiClient } from "./tripsage-serpapi";

/**
 * SerpApi `google_flights` reference flight lookup only (no booking, payment, or persistence).
 * Single request per lookup (including round-trip `type=1`: returns total round-trip price +
 * outbound segments; never performs a second request with `departure_token`).
 *
 * NOT verified live: real SerpApi JSON payloads, Vietnam coverage, or prices.
 */
const MAX_OFFERS = 5;
const DEFAULT_CURRENCY = "VND";
const NO_RESULTS_ERROR_PATTERN = /hasn't returned any results|no results/iu;

export type FlightQuery = {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  adults: number;
  nonStop?: boolean;
  currency?: string;
};

export type FlightOffer = {
  price: { total: string; currency: string };
  totalDurationMinutes?: number;
  itineraries: {
    connections: number;
    segments: { from: string; to: string; departAt: string; arriveAt: string; airline: string; flight: string }[];
  }[];
};

export type TypicalPriceRange = {
  min: string;
  max: string;
  currency: string;
};

export type FlightOutcome =
  | { status: "RESULTS"; offers: FlightOffer[]; roundTrip?: boolean; typicalPriceRange?: TypicalPriceRange | null }
  | { status: "NO_RESULTS" }
  | { status: "UNAVAILABLE" };

export type FlightLookup = (query: FlightQuery, signal?: AbortSignal) => Promise<FlightOutcome>;

const iataSchema = z.string().regex(/^[A-Z]{3}$/u);

function normalizeFlightTime(raw: string): string | null {
  const trimmed = raw.trim();
  const match = /^(\d{4}-\d{2}-\d{2})[ T]([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/u.exec(trimmed);
  if (!match) return null;
  const [, datePart, hh, mm, ss = "00"] = match;
  if (!isValidCalendarDate(datePart!)) return null;
  return `${datePart}T${hh}:${mm}:${ss}`;
}

function normalizeFlightNumber(raw: string): string | null {
  const compact = raw.replace(/\s+/gu, "").toUpperCase();
  return /^[A-Z0-9]{2,3}\d{1,5}[A-Z]?$/u.test(compact) ? compact : null;
}

function formatAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

const airportTimeSchema = z.string().max(32).transform((value, ctx) => {
  const normalized = normalizeFlightTime(value);
  if (!normalized) {
    ctx.addIssue({ code: "custom", message: "Invalid flight timestamp" });
    return z.NEVER;
  }
  return normalized;
});

const segmentSchema = z.object({
  departure_airport: z.object({ id: iataSchema, time: airportTimeSchema }),
  arrival_airport: z.object({ id: iataSchema, time: airportTimeSchema }),
  airline: z.string().max(300).transform(cleanPlaceName).pipe(z.string().min(1)),
  flight_number: z.string().max(32).transform((value, ctx) => {
    const normalized = normalizeFlightNumber(value);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "Invalid flight number" });
      return z.NEVER;
    }
    return normalized;
  }),
});

const layoverSchema = z.object({
  id: z.string().max(10).optional(),
  duration: z.number().finite().nonnegative().optional(),
});

const flightOptionSchema = z.object({
  flights: z.array(segmentSchema).min(1).max(8),
  layovers: z.array(layoverSchema).max(8).nullish(),
  total_duration: z.number().int().positive().max(10_000).nullish(),
  price: z.number().finite().positive().nullish(),
});

const priceInsightsSchema = z.object({
  typical_price_range: z.tuple([z.number().finite().positive(), z.number().finite().positive()]).nullish(),
}).nullish();

// Options are validated one by one below, so a single malformed option cannot discard the whole response.
const flightsResponseSchema = z.object({
  best_flights: z.array(z.unknown()).max(100).optional(),
  other_flights: z.array(z.unknown()).max(100).optional(),
  price_insights: priceInsightsSchema,
}).refine(data => Array.isArray(data.best_flights) || Array.isArray(data.other_flights));

export function createSerpApiFlightLookup(client: SerpApiClient): FlightLookup {
  return async (query, signal) => {
    const isRoundTrip = Boolean(query.returnDate);
    const currency = query.currency || DEFAULT_CURRENCY;

    const outcome = await client.search({
      engine: "google_flights",
      departure_id: query.origin,
      arrival_id: query.destination,
      outbound_date: query.departureDate,
      ...(isRoundTrip ? { return_date: query.returnDate, type: "1" } : { type: "2" }),
      adults: String(query.adults),
      currency,
      gl: "vn",
      hl: "vi",
      sort_by: "2",
    }, signal);

    if (outcome.status !== "OK") return { status: "UNAVAILABLE" };
    const unavailable = (reason: string) => { console.warn("[tripsage-serpapi] flights unavailable", reason); return { status: "UNAVAILABLE" } as const; };

    if (typeof outcome.data.error === "string" && NO_RESULTS_ERROR_PATTERN.test(outcome.data.error)) {
      return { status: "NO_RESULTS" };
    }

    const parsed = flightsResponseSchema.safeParse(outcome.data);
    if (!parsed.success) return unavailable("unexpected-shape");

    const received = [...(parsed.data.best_flights ?? []), ...(parsed.data.other_flights ?? [])];
    const rawOptions = received.flatMap(option => {
      const checked = flightOptionSchema.safeParse(option);
      return checked.success ? [checked.data] : [];
    });
    if (received.length && !rawOptions.length) return unavailable("all-options-invalid");

    const pricedOptions = rawOptions
      .filter((option): option is typeof option & { price: number } => typeof option.price === "number")
      .filter(option => !query.nonStop || option.flights.length === 1)
      .sort((a, b) => a.price - b.price)
      .slice(0, MAX_OFFERS);

    if (!pricedOptions.length) return { status: "NO_RESULTS" };

    const offers: FlightOffer[] = pricedOptions.map(option => ({
      price: { total: formatAmount(option.price), currency },
      ...(option.total_duration ? { totalDurationMinutes: option.total_duration } : {}),
      itineraries: [{
        connections: option.flights.length - 1,
        segments: option.flights.map(segment => ({
          from: segment.departure_airport.id,
          to: segment.arrival_airport.id,
          departAt: segment.departure_airport.time,
          arriveAt: segment.arrival_airport.time,
          airline: segment.airline,
          flight: segment.flight_number,
        })),
      }],
    }));

    const range = parsed.data.price_insights?.typical_price_range;
    const typicalPriceRange: TypicalPriceRange | null = range && range[0] <= range[1]
      ? { min: formatAmount(range[0]), max: formatAmount(range[1]), currency }
      : null;

    return {
      status: "RESULTS",
      offers,
      roundTrip: isRoundTrip,
      typicalPriceRange,
    };
  };
}
