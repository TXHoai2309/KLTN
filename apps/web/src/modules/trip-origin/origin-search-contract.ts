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

const FACILITY_PREFIX_RE = /^(?:cong(?:\s+(?:vao|ra|chinh|sau|so\s*\d+))?|bai\s+(?:gui|do)\s+xe(?:\s+may|\s+o\s+to)?|nha\s+cho|quay\s+ve|tram(?:\s+xe\s+buyt)?|doi\s+dien|van\s+phong(?:\s+nha\s+xe)?)\s+/u;
const GENERIC_PLACE_TOKENS = new Set([
  "ben", "xe", "khach", "bus", "station", "terminal", "cong", "vao", "ra", "chinh", "sau",
  "bai", "gui", "do", "may", "o", "to", "nha", "cho", "quay", "ve", "tram", "buyt",
  "doi", "dien", "duong", "pho", "ngo", "phuong", "xa", "quan", "huyen", "thanh", "tp", "thi", "tran", "tinh",
]);

function originCoreKey(primaryKey: string): string {
  const tokens = primaryKey.split(" ").filter(token => token.length >= 2 && !GENERIC_PLACE_TOKENS.has(token));
  return tokens.join(" ");
}

function tokensSubsetOf(shorter: string, longer: string): boolean {
  const shortTokens = shorter.split(" ").filter(token => token.length >= 2);
  if (shortTokens.length < 2) return false;
  const longSet = new Set(longer.split(" ").filter(token => token.length >= 2));
  return shortTokens.every(token => longSet.has(token));
}

function isSameNearbyPlace(repKey: string, itemKey: string): boolean {
  if (!repKey || !itemKey) return false;
  if (repKey === itemKey) return true;
  if (Math.min(repKey.length, itemKey.length) >= 6 && (repKey.includes(itemKey) || itemKey.includes(repKey))) {
    return true;
  }
  // e.g. "ben xe giap bat" vs "ben xe khach giap bat" or "bai gui xe ben xe giap bat"
  if (tokensSubsetOf(repKey, itemKey) || tokensSubsetOf(itemKey, repKey)) {
    return true;
  }
  // e.g. "ben xe giap bat" vs "giap bat bus station" within <= 2 km
  const repCore = originCoreKey(repKey);
  const itemCore = originCoreKey(itemKey);
  return repCore.length >= 6 && repCore === itemCore;
}

function candidateLabelQuality(label: string): number {
  let score = 0;
  if (!LEADING_PLATFORM_TAG_RE.test(label)) score += 4;
  const primary = originPrimaryKey(label);
  if (!FACILITY_PREFIX_RE.test(primary)) score += 2;
  if (!/\bbus\s+station\b/u.test(primary)) score += 1;
  return score;
}

/**
 * D6: Collapses multiple map nodes/gates/nearby variants belonging to the same landmark or station within `<= 2 km`
 * (e.g., OSM nodes `(A) Bến Xe Giáp Bát`, `Bến xe khách Giáp Bát`, `Bãi gửi xe Bến xe Giáp Bát`) into one canonical candidate.
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
      return isSameNearbyPlace(originPrimaryKey(representative.label), itemKey);
    });
    if (!match) {
      clusters.push({ representative: item, merged: false });
      continue;
    }
    match.merged = true;
    const repScore = candidateLabelQuality(match.representative.label);
    const itemScore = candidateLabelQuality(item.label);
    if (itemScore > repScore) {
      match.representative = item;
    }
  }
  return clusters.map(({ representative, merged }) => {
    if (!merged) return representative;
    const cleaned = cleanOriginCandidateLabel(representative.label);
    return cleaned && cleaned !== representative.label ? { ...representative, label: cleaned } : representative;
  });
}
