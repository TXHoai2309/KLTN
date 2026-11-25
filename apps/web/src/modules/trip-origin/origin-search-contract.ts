import { z } from "zod";
import { haversine } from "../trip-planner/planner-geography";
import { originSelectionSchema } from "./trip-origin-contract";

export const ORIGIN_SEARCH_REVISION = "origin-search-v1" as const;
export const OSM_ATTRIBUTION = { text: "© OpenStreetMap contributors", url: "https://www.openstreetmap.org/copyright", license: "ODbL-1.0" } as const;
export const GOOGLE_ORIGIN_ATTRIBUTION = { text: "Google Maps", url: "https://maps.google.com", license: "Google Maps Platform" } as const;
export const STADIA_ORIGIN_ATTRIBUTION = { text: "© Stadia Maps · © OpenMapTiles · © OpenStreetMap", url: "https://stadiamaps.com/attribution/", license: "ODbL-1.0" } as const;
export const originSearchRequestSchema = z.object({
  query: z.string().normalize().trim().min(2).max(160)
    .refine(q => !/[\u0000-\u001f\u007f@]/u.test(q) && !/https?:\/\/|\b(?:\+?\d[\s().-]*){8,}\b/iu.test(q), "Chỉ nhập tên địa điểm công khai; không gửi email, số điện thoại hoặc ghi chú riêng tư."),
}).strict();
export const originSearchResultsSchema = z.array(originSelectionSchema.extend({
  source: z.enum(["NOMINATIM", "STADIA", "GOOGLE_PLACES"]), confirmed: z.literal(false),
}).strict()).max(5);
export type OriginSearchResult = z.infer<typeof originSearchResultsSchema>[number];
export type OriginSearchOutcome =
  | { status: "RESULTS" | "NO_RESULTS"; results: OriginSearchResult[]; cached: boolean }
  | { status: "BUSY"; retryAfterSeconds: number }
  | { status: "UNAVAILABLE" };

/** Distance (km) within which near-identical search hits of the same physical place collapse into one candidate. */
export const ORIGIN_DUPLICATE_RADIUS_KM = 2;
const LEADING_PLATFORM_TAG_RE = /^(?:\([a-z0-9]{1,3}\)|\[[a-z0-9]{1,3}\])\s*/iu;

function foldOriginName(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\p{M}\p{Cf}]/gu, "")
    .replace(/đ/gu, "d")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

/** Removes noisy platform prefixes like "(A) " at the very start of a candidate display label. */
export function cleanOriginCandidateLabel(label: string): string {
  return label.replace(LEADING_PLATFORM_TAG_RE, "").replace(/\s+/gu, " ").trim();
}

function originPrimaryKey(label: string): string {
  const firstSegment = (label.split(",")[0] ?? label).trim();
  return foldOriginName(cleanOriginCandidateLabel(firstSegment));
}

/**
 * D6: Collapses multiple map nodes/gates belonging to the same landmark or station within `<= 2 km`
 * (e.g., OSM nodes `(A) Bến Xe Giáp Bát` and `Bến Xe Giáp Bát`) into one canonical candidate.
 */
export function deduplicateOriginResults<T extends { label: string; latitude: number; longitude: number }>(
  results: readonly T[],
): T[] {
  const clusters: { representative: T; merged: boolean }[] = [];
  for (const item of results) {
    const itemKey = originPrimaryKey(item.label);
    const match = clusters.find(({ representative }) => {
      if (representative.latitude === item.latitude && representative.longitude === item.longitude) return true;
      if (haversine(representative, item) > ORIGIN_DUPLICATE_RADIUS_KM) return false;
      const repKey = originPrimaryKey(representative.label);
      if (!repKey || !itemKey) return false;
      return (
        repKey === itemKey
        || (Math.min(repKey.length, itemKey.length) >= 6 && (repKey.includes(itemKey) || itemKey.includes(repKey)))
      );
    });
    if (!match) {
      clusters.push({ representative: item, merged: false });
      continue;
    }
    match.merged = true;
    const repHasTag = LEADING_PLATFORM_TAG_RE.test(match.representative.label);
    const itemHasTag = LEADING_PLATFORM_TAG_RE.test(item.label);
    if (repHasTag && !itemHasTag) {
      match.representative = item;
    }
  }
  return clusters.map(({ representative, merged }) => {
    if (!merged) return representative;
    const cleaned = cleanOriginCandidateLabel(representative.label);
    return cleaned && cleaned !== representative.label ? { ...representative, label: cleaned } : representative;
  });
}
