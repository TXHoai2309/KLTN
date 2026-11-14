import "server-only";
import { z } from "zod";
import { vietnamCoverageAt } from "../trip-origin/vietnam-coverage";
import { cleanPlaceName, inPlacesArea, readBounded, MAX_PLACES_RESPONSE_BYTES } from "../tripsage-chat/tripsage-places";
import { isSchedulablePlaceId } from "../trip-planner/planner-candidates";

export const GOOGLE_PLACE_DETAILS_ENDPOINT = "https://places.googleapis.com/v1/places/";
export const GOOGLE_PLACE_DETAILS_FIELD_MASK = "id,displayName,location";
/** Hard cap of external places resolved (hence Google calls) per Save. */
export const MAX_EXTERNAL_PLACES_PER_SAVE = 8;

export type ResolvedExternalPlace = { placeId: string; name: string; latitude: number; longitude: number };
export type ExternalPlaceResolution = { status: "OK"; places: Map<string, ResolvedExternalPlace> } | { status: "UNAVAILABLE" };
/** Server-side lookup by Google place id. The Save service never accepts a name or coordinates from the client. */
export type ExternalPlaceResolver = (placeIds: readonly string[], signal?: AbortSignal) => Promise<ExternalPlaceResolution>;

const detailsSchema = z.object({ id: z.string().min(1).max(300), displayName: z.object({ text: z.string().max(1000) }).optional(), location: z.object({ latitude: z.number(), longitude: z.number() }) });

/** Google Place Details (New), one GET per id, no retry, no redirect, bounded time and size; any failure is UNAVAILABLE. */
export function createGooglePlaceDetailsResolver(deps: { apiKey: () => string | undefined | Promise<string | undefined>; fetcher?: typeof fetch; timeoutMs?: number }): ExternalPlaceResolver {
  return async (placeIds, signal) => {
    try {
      const ids = [...new Set(placeIds)];
      if (!ids.length || ids.length > MAX_EXTERNAL_PLACES_PER_SAVE || !ids.every(isSchedulablePlaceId)) return { status: "UNAVAILABLE" };
      const key = (await deps.apiKey())?.trim();
      if (!key) return { status: "UNAVAILABLE" };
      const one = async (id: string): Promise<ResolvedExternalPlace | null> => {
        const timeout = AbortSignal.timeout(deps.timeoutMs ?? 5_000);
        const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
        const aborted = new Promise<never>((_, reject) => combined.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
        const run = async () => {
          const response = await (deps.fetcher ?? fetch)(`${GOOGLE_PLACE_DETAILS_ENDPOINT}${encodeURIComponent(id)}?languageCode=vi&regionCode=VN`, {
            method: "GET", signal: combined, redirect: "error", cache: "no-store",
            headers: { accept: "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": GOOGLE_PLACE_DETAILS_FIELD_MASK },
          });
          if (!response.ok) return null;
          const text = await readBounded(response, MAX_PLACES_RESPONSE_BYTES);
          if (text === null) return null;
          const body = detailsSchema.safeParse(JSON.parse(text));
          if (!body.success || body.data.id !== id) return null;
          const { latitude, longitude } = body.data.location;
          const name = cleanPlaceName(body.data.displayName?.text ?? "");
          if (!name || !inPlacesArea(latitude, longitude) || vietnamCoverageAt({ latitude, longitude }) !== "SUPPORTED") return null;
          return { placeId: id, name, latitude, longitude };
        };
        return Promise.race([run(), aborted]);
      };
      const resolved = await Promise.all(ids.map(one));
      if (resolved.some(place => place === null)) return { status: "UNAVAILABLE" };
      return { status: "OK", places: new Map(resolved.map(place => [place!.placeId, place!])) };
    } catch { return { status: "UNAVAILABLE" }; }
  };
}
