import { cleanAreaDisplayLabel } from "../../lib/traveler-display-clean";
import { extractOriginCityProvince } from "../../lib/traveler-trip-title";
import { sanitizeStoredParts, type StoredAssistantPart } from "./assistant-conversation-contract";
import { autoTitleFromAssistantParts, buildConversationAutoTitle } from "./conversation-auto-title";
import { savedJourneySchema } from "../trip-origin/journey-saved-contract";

export const STREET_OR_WARD_ORIGIN_RE =
  /^\d+\s+|(?:^|[\s,])(?:p\.|phường|q\.|quận|h\.|huyện|tx\.|thị xã|x\.|xã|đường|ngõ|ngách|hẻm|thôn|xóm|tổ|bến xe)\b/iu;

const QUESTION_OPENER_RE =
  /[?？]|^(?:h[oỏ]i|t[uư]\s*v[aấ]n|cho\s+m[iì]nh|m[iì]nh\s+mu[oố]n|ch[oơ]i\s+g[iì]|ăn\s+g[iì]|đi\s+đ[aâ]u)\b/iu;

const TRAVELERS_TOKEN_RE = /^(\d{1,2})\s*ng[uư][oờ]i$/iu;
const DAYS_TOKEN_RE = /^(\d{1,2})\s*ng[aà]y$/iu;
const DATE_TOKEN_RE = /^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?$/u;

export type SanitizeCandidateRow = {
  id: string;
  title: string;
  titleCustomized: boolean;
  savedTripId: string | null;
  latestAssistantParts?: unknown;
  assistantMessagesParts?: readonly unknown[];
  tripJourneySnapshot?: unknown;
  tripPinnedItems?: unknown;
  tripStartDate?: string | null;
  tripDurationDays?: number | null;
};

function mergeAssistantMessagesParts(messagesParts: readonly unknown[]): StoredAssistantPart[] {
  const merged: StoredAssistantPart[] = [];
  for (const rawParts of messagesParts) {
    if (!Array.isArray(rawParts)) continue;
    merged.push(...sanitizeStoredParts(rawParts));
  }
  return merged;
}

function sanitizeDelimitedTitleFallback(current: string): string | null {
  const segments = current
    .split(/[·,]/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length < 2) return null;

  const originSegments: string[] = [];
  let travelersSegment: string | null = null;
  let daysSegment: string | null = null;
  let dateSegment: string | null = null;

  for (const segment of segments) {
    const tMatch = TRAVELERS_TOKEN_RE.exec(segment);
    if (tMatch) {
      travelersSegment = `${Number(tMatch[1])} người`;
      continue;
    }
    const dMatch = DAYS_TOKEN_RE.exec(segment);
    if (dMatch) {
      daysSegment = `${Number(dMatch[1])} ngày`;
      continue;
    }
    if (DATE_TOKEN_RE.test(segment)) {
      dateSegment = segment;
      continue;
    }
    originSegments.push(segment);
  }

  const orderedMeta = [travelersSegment, daysSegment, dateSegment].filter(
    (part): part is string => Boolean(part),
  );
  if (orderedMeta.length === 0 || originSegments.length === 0) return null;

  const originRaw = originSegments.join(", ");
  if (originRaw.length > 100 || QUESTION_OPENER_RE.test(originRaw)) return null;

  const cleanCity = extractOriginCityProvince(originRaw, { allowHaGiang: true });
  if (cleanCity === "Hà Giang") {
    const rebuilt = ["Hà Giang", ...orderedMeta].join(" · ");
    return rebuilt !== current ? rebuilt.slice(0, 120) : null;
  }
  if (cleanCity) {
    const rebuilt = [`${cleanCity} → HG`, ...orderedMeta].join(" · ");
    return rebuilt !== current ? rebuilt.slice(0, 120) : null;
  }
  if (STREET_OR_WARD_ORIGIN_RE.test(originRaw)) {
    const rebuilt = ["Hà Giang", ...orderedMeta].join(" · ");
    return rebuilt !== current ? rebuilt.slice(0, 120) : null;
  }
  return null;
}

/**
 * Computes a sanitized replacement title for an auto-titled (`titleCustomized === false`) conversation,
 * or `null` when no change is needed (or when the user manually renamed the conversation).
 */
export function computeSanitizedAutoConversationTitle(row: SanitizeCandidateRow): string | null {
  if (row.titleCustomized) return null;
  const current = row.title.normalize("NFC").trim();

  // 1. Re-derive from stored structured assistant message parts across turns if present.
  const messageList = row.assistantMessagesParts ?? (row.latestAssistantParts ? [row.latestAssistantParts] : []);
  if (messageList.length > 0) {
    const safeParts = mergeAssistantMessagesParts(messageList);
    if (safeParts.length > 0) {
      const derived = autoTitleFromAssistantParts(safeParts, { existingTitle: current });
      if (derived && derived !== current) {
        return derived;
      }
    }
  }

  // 2. If linked to a saved trip, derive from the saved trip's journey + access leg while preserving travelers.
  if (row.tripJourneySnapshot) {
    const parsedJourney = savedJourneySchema.safeParse(row.tripJourneySnapshot);
    if (parsedJourney.success) {
      let homeCity: string | null = null;
      let accessTravelers: number | null = null;
      if (Array.isArray(row.tripPinnedItems)) {
        for (const item of row.tripPinnedItems) {
          if (item && typeof item === "object" && (item as { kind?: unknown }).kind === "ACCESS") {
            const leg = (item as { leg?: { homeCity?: unknown; travelers?: unknown } }).leg;
            if (typeof leg?.homeCity === "string") homeCity = leg.homeCity;
            if (typeof leg?.travelers === "number" && leg.travelers > 0) accessTravelers = leg.travelers;
          }
        }
      }
      const derivedFromTrip = buildConversationAutoTitle({
        tripInfo: {
          ...(homeCity ? { homeCity } : {}),
          ...(accessTravelers !== null ? { travelers: accessTravelers } : {}),
          ...(row.tripStartDate ? { startDate: row.tripStartDate } : {}),
          ...(typeof row.tripDurationDays === "number" ? { durationDays: row.tripDurationDays } : {}),
        },
        journey: parsedJourney.data.journey,
        existingTitle: current,
      });
      if (derivedFromTrip && derivedFromTrip !== current) {
        return derivedFromTrip;
      }
    }
  }

  // 3. Fallback: inspect existing `"<origin> → HG..."` or comma/middot `"<origin>, <N> người, <date>"` title format.
  const arrowIdx = current.indexOf("→");
  if (arrowIdx > 0) {
    const left = current.slice(0, arrowIdx).trim();
    const right = current.slice(arrowIdx + 1).trim();
    const cleanCity = extractOriginCityProvince(left, { allowHaGiang: true });
    if (cleanCity === "Hà Giang") {
      const strippedRight = right.replace(/^HG\b\s*·?\s*/iu, "").trim();
      const rebuilt = strippedRight ? `Hà Giang · ${strippedRight}` : "Hà Giang";
      return rebuilt !== current ? rebuilt : null;
    }
    if (cleanCity) {
      const rebuilt = `${cleanCity} → ${right}`;
      return rebuilt !== current ? rebuilt : null;
    }
    if (STREET_OR_WARD_ORIGIN_RE.test(left) || cleanAreaDisplayLabel(left) === null) {
      const strippedRight = right.replace(/^HG\b\s*·?\s*/iu, "").trim();
      const rebuilt = strippedRight ? `Hà Giang · ${strippedRight}` : "Hành trình Hà Giang";
      return rebuilt !== current ? rebuilt : null;
    }
  }

  return sanitizeDelimitedTitleFallback(current);
}
