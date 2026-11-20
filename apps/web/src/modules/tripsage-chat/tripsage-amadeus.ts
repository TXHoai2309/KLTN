import "server-only";
import { z } from "zod";
import { cleanPlaceName, readBounded } from "./tripsage-places";

/**
 * Amadeus Self-Service, the provider tripsage-ai uses for flights and hotels (it goes through the official Node SDK;
 * this is a small fetch client so no dependency is added and the HTTP layer is easy to fake). Endpoints used:
 * `POST /v1/security/oauth2/token` (client credentials), `GET /v2/shopping/flight-offers`,
 * `GET /v1/reference-data/locations/hotels/by-geocode` and `GET /v3/shopping/hotel-offers`, all with a Bearer token.
 * Response field names follow tripsage's own schemas (`src/domain/amadeus/schemas.ts`) and the SDK paths it calls.
 * NOT verified live (no Amadeus credentials were available): rate limits, price, and whether the test environment
 * returns data for Vietnamese cities. SEARCH ONLY: no booking, no payment, nothing is stored.
 * The two hosts are constants on purpose: `AMADEUS_ENV` can only choose between them, so no variable redirects the secret.
 */
export const AMADEUS_HOSTS = { test: "https://test.api.amadeus.com", production: "https://api.amadeus.com" } as const;
export type AmadeusEnvironment = keyof typeof AMADEUS_HOSTS;
export const AMADEUS_TIMEOUT_MS = 8_000;
export const AMADEUS_MAX_RESPONSE_BYTES = 512 * 1024;
const MAX_FLIGHT_OFFERS = 5;
const MAX_HOTELS = 20;
const MAX_HOTEL_OFFERS = 5;
const TOKEN_MARGIN_MS = 30_000;

export type FlightQuery = { origin: string; destination: string; departureDate: string; returnDate?: string; adults: number; currency: string; nonStop?: boolean };
export type FlightOffer = {
  price: { total: string; currency: string };
  airlines: string[];
  itineraries: { duration: string; stops: number; segments: { from: string; to: string; departAt: string; arriveAt: string; flight: string }[] }[];
};
export type HotelQuery = { latitude: number; longitude: number; checkInDate: string; checkOutDate: string; adults: number; currency: string; radiusKm?: number };
export type HotelOffer = { hotelId: string; name: string; distanceKm: number | null; room: string | null; price: { total: string; currency: string }; checkInDate: string; checkOutDate: string };

export type FlightOutcome = { status: "RESULTS"; offers: FlightOffer[] } | { status: "NO_RESULTS" } | { status: "UNAVAILABLE" };
export type HotelOutcome = { status: "RESULTS"; offers: HotelOffer[] } | { status: "NO_RESULTS" } | { status: "UNAVAILABLE" };
export type AmadeusLookup = {
  flights: (query: FlightQuery, signal?: AbortSignal) => Promise<FlightOutcome>;
  hotels: (query: HotelQuery, signal?: AbortSignal) => Promise<HotelOutcome>;
};

const money = z.object({ total: z.string().max(40), currency: z.string().min(3).max(3) });
const flightResponse = z.object({ data: z.array(z.object({
  price: money,
  validatingAirlineCodes: z.array(z.string().max(3)).max(5).optional(),
  itineraries: z.array(z.object({
    duration: z.string().max(30),
    segments: z.array(z.object({
      departure: z.object({ iataCode: z.string().max(3), at: z.string().max(40) }),
      arrival: z.object({ iataCode: z.string().max(3), at: z.string().max(40) }),
      carrierCode: z.string().max(3),
      number: z.string().max(8),
    })).min(1).max(8),
  })).min(1).max(4),
})).max(50).optional() });
const geocodeResponse = z.object({ data: z.array(z.object({
  hotelId: z.string().min(1).max(20),
  name: z.string().max(300),
  distance: z.object({ value: z.number(), unit: z.string().max(10).optional() }).optional(),
})).max(200).optional() });
const hotelOffersResponse = z.object({ data: z.array(z.object({
  hotel: z.object({ hotelId: z.string().min(1).max(20), name: z.string().max(300) }),
  offers: z.array(z.object({
    checkInDate: z.string().max(12), checkOutDate: z.string().max(12), price: money,
    room: z.object({ typeEstimated: z.object({ category: z.string().max(60).optional() }).optional() }).optional(),
  })).max(20).default([]),
})).max(50).optional() });
const tokenResponse = z.object({ access_token: z.string().min(1).max(4000), expires_in: z.number().positive().max(86_400) });

type Token = { value: string; expiresAt: number };
/** Shared across requests (one runtime per request would otherwise fetch a token every turn). Keyed by host and client id. */
const defaultTokens = new Map<string, Token>();

export type AmadeusDeps = {
  clientId: () => string | undefined | Promise<string | undefined>;
  clientSecret: () => string | undefined | Promise<string | undefined>;
  environment?: () => string | undefined;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
  tokens?: Map<string, Token>;
};

const iata = (code: string) => code.replace(/[^A-Z0-9]/gu, "").slice(0, 3);
const clean = (text: string) => cleanPlaceName(text);

/** One bounded attempt per provider call, no redirect, errors never leave this module. Secrets live only inside it. */
export function createAmadeusLookup(deps: AmadeusDeps): AmadeusLookup {
  const fetcher = deps.fetcher ?? fetch;
  const now = deps.now ?? Date.now;
  const tokens = deps.tokens ?? defaultTokens;

  async function credentials() {
    const id = (await deps.clientId())?.trim(); const secret = (await deps.clientSecret())?.trim();
    if (!id || !secret) return null;
    const environment: AmadeusEnvironment = deps.environment?.()?.trim().toLowerCase() === "production" ? "production" : "test";
    return { id, secret, host: AMADEUS_HOSTS[environment] };
  }

  async function accessToken(creds: { id: string; secret: string; host: string }, signal: AbortSignal): Promise<string | null> {
    const cacheKey = `${creds.host}|${creds.id}`;
    const cached = tokens.get(cacheKey);
    if (cached && cached.expiresAt - TOKEN_MARGIN_MS > now()) return cached.value;
    const response = await fetcher(`${creds.host}/v1/security/oauth2/token`, {
      method: "POST", signal, redirect: "error", cache: "no-store",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: creds.id, client_secret: creds.secret }).toString(),
    });
    if (!response.ok) return null;
    const text = await readBounded(response, 16 * 1024);
    if (text === null) return null;
    const parsed = tokenResponse.safeParse(JSON.parse(text));
    if (!parsed.success) return null;
    tokens.set(cacheKey, { value: parsed.data.access_token, expiresAt: now() + parsed.data.expires_in * 1000 });
    return parsed.data.access_token;
  }

  /** Runs `work` with a valid bearer token under one combined time budget; any failure is UNAVAILABLE. */
  async function withToken<T>(signal: AbortSignal | undefined, unavailable: T, work: (call: (path: string, params: Record<string, string>) => Promise<unknown | null>) => Promise<T>): Promise<T> {
    try {
      const creds = await credentials();
      if (!creds) return unavailable;
      const timeout = AbortSignal.timeout(deps.timeoutMs ?? AMADEUS_TIMEOUT_MS);
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
      const aborted = new Promise<never>((_, reject) => combined.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
      const run = async () => {
        const token = await accessToken(creds, combined);
        if (!token) return unavailable;
        return work(async (path, params) => {
          const response = await fetcher(`${creds.host}${path}?${new URLSearchParams(params).toString()}`, {
            method: "GET", signal: combined, redirect: "error", cache: "no-store",
            headers: { accept: "application/json", authorization: `Bearer ${token}` },
          });
          if (!response.ok) return null;
          const text = await readBounded(response, AMADEUS_MAX_RESPONSE_BYTES);
          return text === null ? null : JSON.parse(text);
        });
      };
      return await Promise.race([run(), aborted]);
    } catch { return unavailable; }
  }

  return {
    flights: (query, signal) => withToken<FlightOutcome>(signal, { status: "UNAVAILABLE" }, async call => {
      const raw = await call("/v2/shopping/flight-offers", {
        originLocationCode: query.origin, destinationLocationCode: query.destination, departureDate: query.departureDate,
        ...(query.returnDate ? { returnDate: query.returnDate } : {}), adults: String(query.adults), currencyCode: query.currency,
        ...(query.nonStop ? { nonStop: "true" } : {}), max: String(MAX_FLIGHT_OFFERS),
      });
      if (raw === null) return { status: "UNAVAILABLE" };
      const body = flightResponse.safeParse(raw);
      if (!body.success) return { status: "UNAVAILABLE" };
      const offers: FlightOffer[] = (body.data.data ?? []).slice(0, MAX_FLIGHT_OFFERS).map(offer => ({
        price: { total: offer.price.total, currency: offer.price.currency },
        airlines: (offer.validatingAirlineCodes ?? []).map(iata),
        itineraries: offer.itineraries.map(itinerary => ({
          duration: itinerary.duration, stops: Math.max(0, itinerary.segments.length - 1),
          segments: itinerary.segments.map(s => ({ from: iata(s.departure.iataCode), to: iata(s.arrival.iataCode), departAt: s.departure.at, arriveAt: s.arrival.at, flight: `${iata(s.carrierCode)}${s.number.replace(/[^0-9A-Z]/gu, "")}` })),
        })),
      }));
      return offers.length ? { status: "RESULTS", offers } : { status: "NO_RESULTS" };
    }),

    hotels: (query, signal) => withToken<HotelOutcome>(signal, { status: "UNAVAILABLE" }, async call => {
      const listed = await call("/v1/reference-data/locations/hotels/by-geocode", {
        latitude: String(query.latitude), longitude: String(query.longitude), radius: String(query.radiusKm ?? 10), radiusUnit: "KM",
      });
      if (listed === null) return { status: "UNAVAILABLE" };
      const geo = geocodeResponse.safeParse(listed);
      if (!geo.success) return { status: "UNAVAILABLE" };
      const hotels = (geo.data.data ?? []).slice(0, MAX_HOTELS);
      if (!hotels.length) return { status: "NO_RESULTS" };
      const distances = new Map(hotels.map(h => [h.hotelId, h.distance && (h.distance.unit ?? "KM").toUpperCase() === "KM" ? h.distance.value : null]));
      const priced = await call("/v3/shopping/hotel-offers", {
        hotelIds: hotels.map(h => h.hotelId).join(","), checkInDate: query.checkInDate, checkOutDate: query.checkOutDate,
        adults: String(query.adults), currency: query.currency, bestRateOnly: "true",
      });
      if (priced === null) return { status: "UNAVAILABLE" };
      const body = hotelOffersResponse.safeParse(priced);
      if (!body.success) return { status: "UNAVAILABLE" };
      const offers: HotelOffer[] = [];
      for (const entry of body.data.data ?? []) {
        const best = entry.offers[0];
        if (!best) continue;
        offers.push({ hotelId: entry.hotel.hotelId, name: clean(entry.hotel.name), distanceKm: distances.get(entry.hotel.hotelId) ?? null, room: best.room?.typeEstimated?.category ? clean(best.room.typeEstimated.category) : null, price: { total: best.price.total, currency: best.price.currency }, checkInDate: best.checkInDate, checkOutDate: best.checkOutDate });
      }
      offers.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
      return offers.length ? { status: "RESULTS", offers: offers.slice(0, MAX_HOTEL_OFFERS) } : { status: "NO_RESULTS" };
    }),
  };
}
