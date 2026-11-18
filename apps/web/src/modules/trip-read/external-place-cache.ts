import { EXTERNAL_PLACE_ID_PREFIX } from "../trip-planner/planner-candidates";

/** Google lets coordinates be cached at most 30 consecutive days; names are treated the same (docs/research/google-places-storage-terms.md). */
export const EXTERNAL_PLACE_CACHE_DAYS = 30;
/** Generic Vietnamese label shown when the cache is expired or not for this reader's eyes. */
export const EXTERNAL_PLACE_GENERIC_LABEL = "Địa điểm ngoài danh mục";

export type ExternalPlaceRow = { providerPlaceId: string; name: string | null; latitude: number | null; longitude: number | null; fetchedAt: Date };

/**
 * Display data of a saved external place. Name and coordinates are only a cache: older than 30 days they count as empty, and
 * they are shown only to the Trip owner (`showCache`); everyone else, and an empty cache, gets the generic label and no coordinates.
 */
export function externalPlaceView(place: ExternalPlaceRow, now: Date, showCache: boolean) {
  const fresh = showCache && now.getTime() - place.fetchedAt.getTime() <= EXTERNAL_PLACE_CACHE_DAYS * 86_400_000;
  const name = fresh && place.name ? place.name : EXTERNAL_PLACE_GENERIC_LABEL;
  return {
    id: `${EXTERNAL_PLACE_ID_PREFIX}${place.providerPlaceId}`, name, area: "Ngoài danh mục", category: "Ngoài danh mục", address: null, description: "",
    ...(fresh && place.latitude !== null && place.longitude !== null ? { latitude: place.latitude, longitude: place.longitude } : {}),
    visibility: "VISIBLE" as const, availability: "AVAILABLE" as const, external: true as const,
  };
}
