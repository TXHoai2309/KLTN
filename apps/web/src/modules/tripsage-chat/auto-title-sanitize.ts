import { cleanAreaDisplayLabel } from "../../lib/traveler-display-clean";
import { extractOriginCityProvince } from "../../lib/traveler-trip-title";
import { sanitizeStoredParts } from "./assistant-conversation-contract";
import { autoTitleFromAssistantParts, buildConversationAutoTitle } from "./conversation-auto-title";
import { savedJourneySchema } from "../trip-origin/journey-saved-contract";

export const STREET_OR_WARD_ORIGIN_RE =
  /^\d+\s+|(?:^|[\s,])(?:p\.|phường|q\.|quận|h\.|huyện|tx\.|thị xã|x\.|xã|đường|ngõ|ngách|hẻm|thôn|xóm|tổ|bến xe)\b/iu;

export type SanitizeCandidateRow = {
  id: string;
  title: string;
  titleCustomized: boolean;
  savedTripId: string | null;
  latestAssistantParts?: unknown;
  tripJourneySnapshot?: unknown;
  tripPinnedItems?: unknown;
  tripStartDate?: string | null;
  tripDurationDays?: number | null;
};

/**
 * Computes a sanitized replacement title for an auto-titled (`titleCustomized === false`) conversation,
 * or `null` when no change is needed (or when the user manually renamed the conversation).
 */
export function computeSanitizedAutoConversationTitle(row: SanitizeCandidateRow): string | null {
  if (row.titleCustomized) return null;
  const current = row.title.normalize("NFC").trim();

  // 1. Re-derive from stored structured assistant message parts if present.
  if (Array.isArray(row.latestAssistantParts)) {
    const safeParts = sanitizeStoredParts(row.latestAssistantParts);
    const derived = autoTitleFromAssistantParts(safeParts);
    if (derived && derived !== current) {
      return derived;
    }
  }

  // 2. If linked to a saved trip, derive from the saved trip's journey + access leg.
  if (row.tripJourneySnapshot) {
    const parsedJourney = savedJourneySchema.safeParse(row.tripJourneySnapshot);
    if (parsedJourney.success) {
      let homeCity: string | null = null;
      if (Array.isArray(row.tripPinnedItems)) {
        for (const item of row.tripPinnedItems) {
          if (item && typeof item === "object" && (item as { kind?: unknown }).kind === "ACCESS") {
            const leg = (item as { leg?: { homeCity?: unknown } }).leg;
            if (typeof leg?.homeCity === "string") homeCity = leg.homeCity;
          }
        }
      }
      const derivedFromTrip = buildConversationAutoTitle({
        tripInfo: {
          ...(homeCity ? { homeCity } : {}),
          ...(row.tripStartDate ? { startDate: row.tripStartDate } : {}),
          ...(typeof row.tripDurationDays === "number" ? { durationDays: row.tripDurationDays } : {}),
        },
        journey: parsedJourney.data.journey,
      });
      if (derivedFromTrip && derivedFromTrip !== current) {
        return derivedFromTrip;
      }
    }
  }

  // 3. Fallback: inspect existing `"<origin> → HG..."` or `"<street address>"` title format.
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

  return null;
}
