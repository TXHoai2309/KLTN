import "server-only";
import { z } from "zod";
import { isValidCalendarDate } from "../trip-requirement/trip-requirement-contract";
import { cleanPlaceName, readBounded } from "./tripsage-places";
import { currencyCode, decimalAmount, echoesCredential, MAX_DECIMAL_LENGTH, withLookupDeadline } from "./tripsage-provider-response";

/**
 * Flight lookup only. Verified against TripSage's domain/flights/providers/duffel.ts and
 * domain/flights/mappers.ts, and Duffel v2 Offer Requests (https://duffel.com/docs/api/offer-requests).
 * The documented API wraps POST fields in `data` and uses a query parameter for `return_offers`.
 * NOT verified live: real credentials, coverage in Vietnam, prices or account quotas.
 */
const ENDPOINT = "https://api.duffel.com/air/offer_requests?return_offers=true&supplier_timeout=6000";
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 8_000;
const MAX_OFFERS = 5;

export type FlightQuery = {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  adults: number;
  nonStop?: boolean;
};

export type FlightOffer = {
  price: { total: string; currency: string };
  itineraries: {
    connections: number;
    segments: { from: string; to: string; departAt: string; arriveAt: string; airline: string; flight: string }[];
  }[];
};

export type FlightOutcome = { status: "RESULTS"; offers: FlightOffer[] } | { status: "NO_RESULTS" } | { status: "UNAVAILABLE" };
export type FlightLookup = (query: FlightQuery, signal?: AbortSignal) => Promise<FlightOutcome>;

const airport = z.object({ iata_code: z.string().regex(/^[A-Z]{3}$/u) });
const airportTime = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?$/u)
  .refine(value => isValidCalendarDate(value.slice(0, 10)));
const carrierCode = z.string().regex(/^[A-Z0-9]{2}$/u);
const flightNumber = z.string().regex(/^\d{1,4}[A-Z]?$/u);
const segment = z.object({
  origin: airport,
  destination: airport,
  departing_at: airportTime,
  arriving_at: airportTime,
  operating_carrier: z.object({ name: z.string().max(300).transform(cleanPlaceName).pipe(z.string().min(1)), iata_code: carrierCode }),
  operating_carrier_flight_number: flightNumber.nullish(),
  marketing_carrier: z.object({ iata_code: carrierCode }).nullish(),
  marketing_carrier_flight_number: flightNumber.nullish(),
}).refine(s => Boolean((s.marketing_carrier && s.marketing_carrier_flight_number) || s.operating_carrier_flight_number));
const offerResponse = z.object({ data: z.object({ offers: z.array(z.object({
  total_amount: decimalAmount,
  total_currency: currencyCode,
  slices: z.array(z.object({ segments: z.array(segment).min(1).max(8) })).min(1).max(2),
})) }) });

function sortableAmount(amount: string): bigint {
  const [whole, fraction = ""] = amount.split(".");
  return BigInt(whole + fraction.padEnd(MAX_DECIMAL_LENGTH, "0"));
}

export function createDuffelFlightLookup(deps: {
  accessToken: () => string | undefined | Promise<string | undefined>;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}): FlightLookup {
  return async (query, outer) => {
    const result = await withLookupDeadline<FlightOutcome>(deps.timeoutMs ?? TIMEOUT_MS, outer, async signal => {
      const key = (await deps.accessToken())?.trim();
      signal.throwIfAborted();
      if (!key) return { status: "UNAVAILABLE" };

      const slices = [{ origin: query.origin, destination: query.destination, departure_date: query.departureDate }];
      if (query.returnDate) slices.push({ origin: query.destination, destination: query.origin, departure_date: query.returnDate });
      const response = await (deps.fetcher ?? fetch)(ENDPOINT, {
        method: "POST", signal, redirect: "error", cache: "no-store",
        headers: { accept: "application/json", "content-type": "application/json", authorization: `Bearer ${key}`, "duffel-version": "v2" },
        body: JSON.stringify({ data: {
          slices, cabin_class: "economy", max_connections: query.nonStop ? 0 : 1,
          passengers: Array.from({ length: query.adults }, () => ({ type: "adult" })),
        } }),
      });
      if (!response.ok) return { status: "UNAVAILABLE" };
      const text = await readBounded(response, MAX_RESPONSE_BYTES);
      if (text === null) return { status: "UNAVAILABLE" };
      const parsed = offerResponse.safeParse(JSON.parse(text));
      if (!parsed.success) return { status: "UNAVAILABLE" };
      const { offers } = parsed.data.data;
      if (!offers.length) return { status: "NO_RESULTS" };
      // Duffel normally quotes in the organization's billing currency. Do not rank different currencies together.
      if (new Set(offers.map(offer => offer.total_currency)).size !== 1) return { status: "UNAVAILABLE" };
      const ranked = offers.map(offer => ({ offer, amount: sortableAmount(offer.total_amount) }))
        .sort((a, b) => a.amount < b.amount ? -1 : a.amount > b.amount ? 1 : 0)
        .slice(0, MAX_OFFERS);
      const results = ranked.map(({ offer }) => ({
        price: { total: offer.total_amount, currency: offer.total_currency },
        itineraries: offer.slices.map(slice => ({
          connections: slice.segments.length - 1,
          segments: slice.segments.map(s => {
            const flight = s.marketing_carrier && s.marketing_carrier_flight_number
              ? s.marketing_carrier.iata_code + s.marketing_carrier_flight_number
              : s.operating_carrier.iata_code + s.operating_carrier_flight_number;
            return {
              from: s.origin.iata_code, to: s.destination.iata_code,
              departAt: s.departing_at, arriveAt: s.arriving_at, airline: s.operating_carrier.name, flight,
            };
          }),
        })),
      }));
      return echoesCredential(results, [key]) ? { status: "UNAVAILABLE" } : { status: "RESULTS", offers: results };
    });
    return result ?? { status: "UNAVAILABLE" };
  };
}
