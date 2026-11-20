import "server-only";
import { z } from "zod";
import { haversine } from "../trip-planner/planner-geography";
import { isValidCalendarDate } from "../trip-requirement/trip-requirement-contract";
import { cleanPlaceName, readBounded } from "./tripsage-places";
import { currencyCode, decimalAmount, echoesCredential, withLookupDeadline } from "./tripsage-provider-response";

/**
 * Amadeus hotel lookup only. Paths and fields verified against TripSage's domain/amadeus client,
 * schemas and mappers, the Amadeus 11 SDK and the Hotel List v1 / Hotel Search v3 OpenAPI files.
 * Each lookup performs at most 2 business GETs and 1 OAuth token POST, with no retry.
 * NOT verified live: real credentials, coverage in Vietnam, prices or account quotas.
 */
const HOSTS = { test: "https://test.api.amadeus.com", production: "https://api.amadeus.com" } as const;
const TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 512 * 1024;
const MAX_HOTELS = 20;
const MAX_OFFERS = 5;
const TOKEN_MARGIN_MS = 30_000;
const GEOCODE_PATH = "/v1/reference-data/locations/hotels/by-geocode";
const PRICES_PATH = "/v3/shopping/hotel-offers";

export type HotelQuery = {
  latitude: number;
  longitude: number;
  checkInDate: string;
  checkOutDate: string;
  adults: number;
  currency: string;
  radiusKm?: number;
};
export type HotelOffer = {
  hotelId: string;
  name: string;
  distanceKm: number | null;
  room: string | null;
  price: { total: string; currency: string };
  checkInDate: string;
  checkOutDate: string;
};
export type HotelOutcome = { status: "RESULTS"; offers: HotelOffer[] } | { status: "NO_RESULTS" } | { status: "UNAVAILABLE" };
export type HotelLookup = (query: HotelQuery, signal?: AbortSignal) => Promise<HotelOutcome>;

const hotelId = z.string().regex(/^[A-Z0-9]{8}$/u);
const date = z.string().refine(isValidCalendarDate);
const geocodeResponse = z.object({ data: z.array(z.object({
  hotelId,
  geoCode: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).optional(),
  distance: z.object({ value: z.number().nonnegative(), unit: z.string().max(10).optional() }).optional(),
})).max(1000) });
const offerContainer = z.object({
  hotel: z.object({ hotelId }),
  available: z.boolean().optional(),
});
const pricedHotel = z.object({
  hotel: z.object({ name: z.string().max(300).transform(cleanPlaceName).pipe(z.string().min(1)) }),
  offers: z.array(z.union([z.object({ available: z.literal(false) }), z.object({
    available: z.literal(true).optional(),
    checkInDate: date,
    checkOutDate: date,
    price: z.object({ total: decimalAmount, currency: currencyCode }),
    room: z.object({
      type: z.string().max(60).optional(),
      typeEstimated: z.object({ category: z.string().max(60).optional() }).optional(),
    }).optional(),
  })])).max(20),
});
const offersResponse = z.object({ data: z.array(z.unknown()).max(1000) });
const noMatchingHotelError = z.object({ errors: z.array(z.object({
  code: z.literal(424), status: z.literal(400).optional(),
})).min(1) });
const tokenResponse = z.object({ access_token: z.string().min(1).max(4000), expires_in: z.number().positive().max(86_400) });

type CachedToken = { value: string; expiresAt: number };
const defaultTokens = new Map<string, CachedToken>();

export function createAmadeusHotelLookup(deps: {
  clientId: () => string | undefined | Promise<string | undefined>;
  clientSecret: () => string | undefined | Promise<string | undefined>;
  environment?: () => string | undefined;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
  tokens?: Map<string, CachedToken>;
}): HotelLookup {
  const fetcher = deps.fetcher ?? fetch;
  const now = deps.now ?? Date.now;
  const tokens = deps.tokens ?? defaultTokens;

  async function accessToken(host: string, id: string, secret: string, cacheKey: string, signal: AbortSignal): Promise<CachedToken | null> {
    const cached = tokens.get(cacheKey);
    if (cached && cached.expiresAt - TOKEN_MARGIN_MS > now()) return cached;
    const response = await fetcher(`${host}/v1/security/oauth2/token`, {
      method: "POST", signal, redirect: "error", cache: "no-store",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret }).toString(),
    });
    if (!response.ok) return null;
    const text = await readBounded(response, 16 * 1024);
    signal.throwIfAborted();
    if (text === null) return null;
    const parsed = tokenResponse.safeParse(JSON.parse(text));
    if (!parsed.success) return null;
    const token = { value: parsed.data.access_token, expiresAt: now() + parsed.data.expires_in * 1000 };
    tokens.set(cacheKey, token);
    return token;
  }

  return async (query, outer) => {
    const result = await withLookupDeadline<HotelOutcome>(deps.timeoutMs ?? TIMEOUT_MS, outer, async signal => {
      const [rawId, rawSecret] = await Promise.all([deps.clientId(), deps.clientSecret()]);
      signal.throwIfAborted();
      const id = rawId?.trim();
      const secret = rawSecret?.trim();
      if (!id || !secret) return { status: "UNAVAILABLE" };
      const host = deps.environment?.()?.trim().toLowerCase() === "production" ? HOSTS.production : HOSTS.test;
      const cacheKey = `${host}|${id}`;
      const token = await accessToken(host, id, secret, cacheKey, signal);
      if (!token) return { status: "UNAVAILABLE" };
      const bearer = token.value;

      async function get(path: string, params: Record<string, string>) {
        signal.throwIfAborted();
        const response = await fetcher(`${host}${path}?${new URLSearchParams(params)}`, {
          method: "GET", signal, redirect: "error", cache: "no-store",
          headers: { accept: "application/json", authorization: `Bearer ${bearer}` },
        });
        if (response.status === 401 && tokens.get(cacheKey) === token) tokens.delete(cacheKey);
        // A 400 with Amadeus' business code 424 is documented for Hotel Search v3 only.
        if (!response.ok && !(path === PRICES_PATH && response.status === 400)) return null;
        const text = await readBounded(response, MAX_RESPONSE_BYTES);
        return text === null ? null : { status: response.status, body: JSON.parse(text) as unknown };
      }

      const listed = await get(GEOCODE_PATH, {
        latitude: String(query.latitude), longitude: String(query.longitude), radius: String(query.radiusKm ?? 10), radiusUnit: "KM",
      });
      const geo = geocodeResponse.safeParse(listed?.body);
      if (!geo.success) return { status: "UNAVAILABLE" };
      const nearby = geo.data.data.map(hotel => {
        const distanceKm = hotel.distance?.unit?.toUpperCase() === "KM" ? hotel.distance.value : null;
        const rankKm = distanceKm ?? (hotel.geoCode ? haversine(query, hotel.geoCode) : Infinity);
        return { id: hotel.hotelId, distanceKm, rankKm };
      }).sort((a, b) => a.rankKm - b.rankKm);
      const selected = new Map<string, number | null>();
      for (const hotel of nearby) {
        if (!selected.has(hotel.id)) selected.set(hotel.id, hotel.distanceKm);
        if (selected.size === MAX_HOTELS) break;
      }
      if (!selected.size) return { status: "NO_RESULTS" };

      const priced = await get(PRICES_PATH, {
        hotelIds: [...selected.keys()].join(","), checkInDate: query.checkInDate, checkOutDate: query.checkOutDate,
        adults: String(query.adults), currency: query.currency, includeClosed: "false", bestRateOnly: "true",
      });
      if (!priced) return { status: "UNAVAILABLE" };
      if (priced.status === 400) return noMatchingHotelError.safeParse(priced.body).success
        ? { status: "NO_RESULTS" }
        : { status: "UNAVAILABLE" };
      const body = offersResponse.safeParse(priced.body);
      if (!body.success) return { status: "UNAVAILABLE" };

      const byHotel = new Map<string, HotelOffer>();
      for (const entry of body.data.data) {
        const container = offerContainer.safeParse(entry);
        if (!container.success) return { status: "UNAVAILABLE" };
        const { hotel: { hotelId }, available } = container.data;
        if (available === false || !selected.has(hotelId) || byHotel.has(hotelId)) continue;
        const details = pricedHotel.safeParse(entry);
        if (!details.success) return { status: "UNAVAILABLE" };
        const best = details.data.offers.find(offer => offer.available !== false);
        if (!best) continue;
        if (best.checkInDate !== query.checkInDate || best.checkOutDate !== query.checkOutDate) return { status: "UNAVAILABLE" };
        const room = cleanPlaceName(best.room?.type ?? "") || cleanPlaceName(best.room?.typeEstimated?.category ?? "") || null;
        byHotel.set(hotelId, {
          hotelId, name: details.data.hotel.name, room, distanceKm: selected.get(hotelId) ?? null,
          price: best.price, checkInDate: best.checkInDate, checkOutDate: best.checkOutDate,
        });
      }
      const offers = [...selected.keys()].flatMap(id => byHotel.get(id) ?? []).slice(0, MAX_OFFERS);
      if (!offers.length) return { status: "NO_RESULTS" };
      return echoesCredential(offers, [id, secret, bearer]) ? { status: "UNAVAILABLE" } : { status: "RESULTS", offers };
    });
    return result ?? { status: "UNAVAILABLE" };
  };
}
