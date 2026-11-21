import "server-only";
import { z } from "zod";
import { vietnamCoverageAt } from "../trip-origin/vietnam-coverage";

/**
 * Google Places API (New) Text Search. Verified against developers.google.com on 2026-11-14:
 * `POST https://places.googleapis.com/v1/places:searchText`, headers `X-Goog-Api-Key` and a mandatory
 * `X-Goog-FieldMask`, body `textQuery`/`languageCode`/`regionCode`/`pageSize` (1-20)/`locationRestriction.rectangle`.
 * `places.id` is the IDs-Only SKU; `places.displayName` and `places.location` are the Pro SKU.
 * NOT verified: the per-request price and quota. Nothing is stored here; only the place_id may be persisted later.
 */
export const GOOGLE_PLACES_SEARCH_ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
export const GOOGLE_PLACES_FIELD_MASK = "places.id,places.displayName,places.location";
export const MAX_PLACES_RESPONSE_BYTES = 256 * 1024;
const PAGE_SIZE = 5;
const DEFAULT_TIMEOUT_MS = 5_000;
/** Hà Giang province bounding box (south-west, north-east): the KLTN planning scope. Results are re-checked locally. */
const AREA = { low: { latitude: 22.3, longitude: 104.3 }, high: { latitude: 23.4, longitude: 105.6 } } as const;

export const inPlacesArea = (latitude: number, longitude: number) => latitude >= AREA.low.latitude && latitude <= AREA.high.latitude && longitude >= AREA.low.longitude && longitude <= AREA.high.longitude;

export type ExternalPlaceSuggestion = { placeId: string; name: string; latitude: number; longitude: number };
export type PlacesOutcome = { status: "RESULTS"; places: ExternalPlaceSuggestion[] } | { status: "NO_RESULTS" } | { status: "UNAVAILABLE" };
/** `near`: restrict the search to a small box around a KLTN destination (coordinates from the database, never the model). */
export type PlacesNear = { latitude: number; longitude: number; radiusKm: number };
export type PlacesSearch = (query: string, signal?: AbortSignal, near?: PlacesNear) => Promise<PlacesOutcome>;

/** A box of `radiusKm` around a point, clipped to the Hà Giang search area. */
export function nearRectangle(near: PlacesNear) {
  const dLat = near.radiusKm / 111; const dLng = near.radiusKm / (111 * Math.cos((near.latitude * Math.PI) / 180));
  return {
    low: { latitude: Math.max(AREA.low.latitude, near.latitude - dLat), longitude: Math.max(AREA.low.longitude, near.longitude - dLng) },
    high: { latitude: Math.min(AREA.high.latitude, near.latitude + dLat), longitude: Math.min(AREA.high.longitude, near.longitude + dLng) },
  };
}

const responseSchema = z.object({ places: z.array(z.object({
  id: z.string().min(1).max(300),
  displayName: z.object({ text: z.string().max(1000) }).optional(),
  location: z.object({ latitude: z.number(), longitude: z.number() }),
})).max(20).optional() });

/** Untrusted text: no control characters, collapsed whitespace, short. */
export const cleanPlaceName = (text: string) => text.normalize("NFC").replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ").replace(/\s+/gu, " ").trim().slice(0, 80);

export async function readBounded(response: Response, maxBytes: number): Promise<string | null> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { void reader.cancel().catch(() => {}); return null; }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/** One request per call, no retry, no redirect, bounded time and size. Errors never leave this function. */
export function createGooglePlacesSearch(deps: { apiKey: () => string | undefined | Promise<string | undefined>; fetcher?: typeof fetch; timeoutMs?: number }): PlacesSearch {
  return async (query, signal, near) => {
    try {
      const key = (await deps.apiKey())?.trim();
      if (!key) return { status: "UNAVAILABLE" };
      const timeout = AbortSignal.timeout(deps.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
      const aborted = new Promise<never>((_, reject) => combined.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
      const run = async (): Promise<PlacesOutcome> => {
        const response = await (deps.fetcher ?? fetch)(GOOGLE_PLACES_SEARCH_ENDPOINT, {
          method: "POST", signal: combined, redirect: "error", cache: "no-store",
          headers: { "content-type": "application/json", accept: "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": GOOGLE_PLACES_FIELD_MASK },
          body: JSON.stringify({ textQuery: query, languageCode: "vi", regionCode: "VN", pageSize: PAGE_SIZE, locationRestriction: { rectangle: near ? nearRectangle(near) : AREA } }),
        });
        if (!response.ok) return { status: "UNAVAILABLE" };
        const text = await readBounded(response, MAX_PLACES_RESPONSE_BYTES);
        if (text === null) return { status: "UNAVAILABLE" };
        const body = responseSchema.safeParse(JSON.parse(text));
        if (!body.success) return { status: "UNAVAILABLE" };
        const places: ExternalPlaceSuggestion[] = [];
        for (const place of body.data.places ?? []) {
          const { latitude, longitude } = place.location;
          const inArea = inPlacesArea(latitude, longitude);
          if (!inArea || vietnamCoverageAt({ latitude, longitude }) !== "SUPPORTED") continue;
          const name = cleanPlaceName(place.displayName?.text ?? "");
          if (name && !places.some(p => p.placeId === place.id)) places.push({ placeId: place.id, name, latitude, longitude });
        }
        return places.length ? { status: "RESULTS", places: places.slice(0, PAGE_SIZE) } : { status: "NO_RESULTS" };
      };
      return await Promise.race([run(), aborted]);
    } catch { return { status: "UNAVAILABLE" }; }
  };
}
