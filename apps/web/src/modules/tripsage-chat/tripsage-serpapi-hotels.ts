import "server-only";
import { z } from "zod";
import { haversine } from "../trip-planner/planner-geography";
import { cleanPlaceName } from "./tripsage-places";
import type { SerpApiClient } from "./tripsage-serpapi";

/**
 * SerpApi `google_hotels` lodging reference lookup only (no booking, payment, or persistence).
 * Uses text query (`q`) with lodging kind + DB destination name + "Hà Giang" because `google_hotels`
 * accepts no coordinate parameters and `property_types` does not cover homestays/guesthouses.
 * Post-filters results locally within 10 km using `haversine` against DB coordinates.
 *
 * NOT verified live: real SerpApi JSON responses, Vietnam/Hà Giang coverage, or prices.
 */
const DEFAULT_RADIUS_KM = 10;
const MAX_PRICED_OFFERS = 5;
const MAX_UNPRICED_OFFERS = 3;

export const LODGING_KINDS = ["HOTEL", "HOMESTAY", "GUESTHOUSE", "ANY"] as const;
export type LodgingKind = (typeof LODGING_KINDS)[number];

const KIND_QUERY_PREFIX: Record<LodgingKind, string> = {
  HOTEL: "khách sạn",
  HOMESTAY: "homestay",
  GUESTHOUSE: "nhà nghỉ",
  ANY: "chỗ ở",
};

export type HotelQuery = {
  nearName: string;
  latitude: number;
  longitude: number;
  checkInDate: string;
  checkOutDate: string;
  adults: number;
  currency: string;
  kind?: LodgingKind;
  radiusKm?: number;
};

export type HotelOffer = {
  name: string;
  distanceKm: number | null;
  room: string | null;
  rating: number | null;
  reviews: number | null;
  price: { total: string; perNight: string | null; currency: string } | null;
  checkInDate: string;
  checkOutDate: string;
};

export type HotelOutcome =
  | { status: "RESULTS"; offers: HotelOffer[] }
  | { status: "NO_RESULTS" }
  | { status: "UNAVAILABLE" };

export type HotelLookup = (query: HotelQuery, signal?: AbortSignal) => Promise<HotelOutcome>;

const NO_RESULTS_ERROR_PATTERN = /hasn't returned any results|no results/iu;

const rateSchema = z.object({
  extracted_lowest: z.number().finite().positive().nullish(),
});

const gpsSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
});

const propertySchema = z.object({
  name: z.string().max(300),
  gps_coordinates: gpsSchema.nullish(),
  rate_per_night: rateSchema.nullish(),
  total_rate: rateSchema.nullish(),
  overall_rating: z.number().finite().min(0).max(5).nullish(),
  reviews: z.number().int().min(0).nullish(),
});

const hotelsResponseSchema = z.object({
  properties: z.array(propertySchema).max(500),
});

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function formatAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

export function buildHotelSearchQuery(nearName: string, kind: LodgingKind = "ANY"): string {
  const cleaned = cleanPlaceName(nearName);
  return `${KIND_QUERY_PREFIX[kind]} gần ${cleaned}, Hà Giang`;
}

export function createSerpApiHotelLookup(client: SerpApiClient): HotelLookup {
  return async (query, signal) => {
    const cleanedNear = cleanPlaceName(query.nearName);
    if (!cleanedNear) return { status: "UNAVAILABLE" };

    const nights = daysBetween(query.checkInDate, query.checkOutDate);
    if (!Number.isFinite(nights) || nights < 1) return { status: "UNAVAILABLE" };

    const kind: LodgingKind = query.kind ?? "ANY";
    const currency = query.currency || "VND";
    const radiusKm = query.radiusKm ?? DEFAULT_RADIUS_KM;

    const outcome = await client.search({
      engine: "google_hotels",
      q: buildHotelSearchQuery(cleanedNear, kind),
      check_in_date: query.checkInDate,
      check_out_date: query.checkOutDate,
      adults: String(query.adults),
      currency,
      gl: "vn",
      hl: "vi",
    }, signal);

    if (outcome.status !== "OK") return { status: "UNAVAILABLE" };

    if (typeof outcome.data.error === "string" && NO_RESULTS_ERROR_PATTERN.test(outcome.data.error)) {
      return { status: "NO_RESULTS" };
    }

    const parsed = hotelsResponseSchema.safeParse(outcome.data);
    if (!parsed.success) return { status: "UNAVAILABLE" };

    if (!parsed.data.properties.length) return { status: "NO_RESULTS" };

    const candidates: { rawDistanceKm: number; offer: HotelOffer }[] = [];
    const seenNames = new Set<string>();

    for (const property of parsed.data.properties) {
      if (!property.gps_coordinates) continue;
      const name = cleanPlaceName(property.name);
      if (!name) continue;

      const rawDistanceKm = haversine(query, property.gps_coordinates);
      if (!Number.isFinite(rawDistanceKm) || rawDistanceKm > radiusKm) continue;

      const dedupKey = name.toLowerCase();
      if (seenNames.has(dedupKey)) continue;
      seenNames.add(dedupKey);

      const perNightNum = property.rate_per_night?.extracted_lowest ?? null;
      const totalNum = property.total_rate?.extracted_lowest ?? null;

      let price: HotelOffer["price"] = null;
      if (totalNum !== null || perNightNum !== null) {
        const perNight = perNightNum !== null ? formatAmount(perNightNum) : null;
        const total = totalNum !== null ? formatAmount(totalNum) : formatAmount(perNightNum! * nights);
        price = { total, perNight, currency };
      }

      candidates.push({
        rawDistanceKm,
        offer: {
          name,
          distanceKm: Math.round(rawDistanceKm * 10) / 10,
          room: null,
          rating: property.overall_rating ?? null,
          reviews: property.reviews ?? null,
          price,
          checkInDate: query.checkInDate,
          checkOutDate: query.checkOutDate,
        },
      });
    }

    candidates.sort((a, b) => a.rawDistanceKm - b.rawDistanceKm);

    const priced = candidates.filter(item => item.offer.price !== null).slice(0, MAX_PRICED_OFFERS).map(item => item.offer);
    const unpriced = candidates.filter(item => item.offer.price === null).slice(0, MAX_UNPRICED_OFFERS).map(item => item.offer);
    const offers = [...priced, ...unpriced];

    return offers.length ? { status: "RESULTS", offers } : { status: "NO_RESULTS" };
  };
}
