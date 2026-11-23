/**
 * Pure URL builders for Place preview (Ticket 09).
 * Uses ONLY the browser Google Maps key (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`); never reads server keys or Stadia keys.
 * All URLs are built strictly from system-supplied catalog coordinates/verified URLs or Google `placeId`s — never from AI prose.
 */

export type PlacePreviewTarget =
  | {
      kind: "GOOGLE_PLACE";
      name: string;
      placeId: string;
    }
  | {
      kind: "CATALOG";
      name: string;
      latitude: number;
      longitude: number;
      address?: string | null;
      description?: string | null;
      verifiedGoogleMapsUrl?: string | null;
    };

const PLACE_ID_PATTERN = /^[A-Za-z0-9_-]{3,300}$/;
const GOOGLE_MAPS_HOSTS = /^(?:www\.)?google\.com$|^maps\.google\.com$|^maps\.app\.goo\.gl$|^goo\.gl$/i;

export function isValidCoordinates(latitude: unknown, longitude: unknown): boolean {
  return (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  );
}

export function isValidPlaceId(placeId: unknown): placeId is string {
  return typeof placeId === "string" && PLACE_ID_PATTERN.test(placeId.trim());
}

export function isVerifiedGoogleMapsUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2000) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" && GOOGLE_MAPS_HOSTS.test(parsed.hostname);
  } catch {
    return false;
  }
}

export function canPreviewPlace(target: PlacePreviewTarget | null | undefined): target is PlacePreviewTarget {
  if (!target || !target.name.trim()) return false;
  if (target.kind === "GOOGLE_PLACE") return isValidPlaceId(target.placeId);
  return isValidCoordinates(target.latitude, target.longitude);
}

export function browserGoogleMapsEmbedKey(envKey?: string | null): string | null {
  const raw = envKey !== undefined ? envKey : process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Maps Embed API v1 place mode URL. Returns null if target is not previewable or the browser key is not configured.
 * Requires Maps Embed API to be enabled on the browser key with production + localhost HTTP referrer restrictions.
 */
export function buildPlacePreviewEmbedUrl(
  target: PlacePreviewTarget | null | undefined,
  apiKey: string | null | undefined = browserGoogleMapsEmbedKey(),
): string | null {
  if (!canPreviewPlace(target)) return null;
  const key = apiKey?.trim();
  if (!key) return null;
  const url = new URL("https://www.google.com/maps/embed/v1/place");
  url.searchParams.set("key", key);
  url.searchParams.set("language", "vi");
  if (target.kind === "GOOGLE_PLACE") {
    url.searchParams.set("q", `place_id:${target.placeId.trim()}`);
  } else {
    url.searchParams.set("q", `${target.latitude},${target.longitude}`);
  }
  return url.toString();
}

/**
 * External "View full reviews on Google Maps" link. Always built from `placeId`, verified catalog Google Maps URL,
 * or catalog coordinates — never from model prose.
 */
export function buildPlacePreviewExternalUrl(target: PlacePreviewTarget | null | undefined): string | null {
  if (!canPreviewPlace(target)) return null;
  if (target.kind === "GOOGLE_PLACE") {
    const url = new URL("https://www.google.com/maps/search/");
    url.searchParams.set("api", "1");
    url.searchParams.set("query", target.name.trim());
    url.searchParams.set("query_place_id", target.placeId.trim());
    return url.toString();
  }
  if (isVerifiedGoogleMapsUrl(target.verifiedGoogleMapsUrl)) {
    return target.verifiedGoogleMapsUrl.trim();
  }
  const url = new URL("https://www.google.com/maps/search/");
  url.searchParams.set("api", "1");
  url.searchParams.set("query", `${target.latitude},${target.longitude}`);
  return url.toString();
}
