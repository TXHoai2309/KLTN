import type { TripJourney } from "../trip-origin/trip-origin-contract";
import type { AccessLegPart } from "./tripsage-access-leg";
import type { TripsageTripInfo } from "./tripsage-chat-context";
import type { StoredAssistantPart } from "./assistant-conversation-contract";

function shortCity(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.replace(/\s*\([^)]*\)/gu, "").split(",")[0]?.trim() ?? "";
  if (!trimmed) return null;
  if (/^(?:tp\.?\s*hcm|hcm|thành phố hồ chí minh|hồ chí minh)$/iu.test(trimmed)) return "TP.HCM";
  const cleaned = trimmed.replace(/^(?:tp\.?|thành phố|tỉnh)\s+/iu, "").trim();
  return cleaned || null;
}

function isHaGiangCity(name: string): boolean {
  return /^hà giang$/iu.test(name);
}

function shortDateDayMonth(iso: string | undefined): string | null {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso) : null;
  if (!m) return null;
  return `${Number(m[3])}/${Number(m[2])}`;
}

export interface ConversationAutoTitleInput {
  tripInfo?: TripsageTripInfo | null;
  journey?: TripJourney | null;
  accessLeg?: AccessLegPart | null;
}

/**
 * Slim BR-7 & B11: builds an automatic sidebar title strictly from confirmed trip info
 * (never assumed fields), e.g.:
 * - "Đà Nẵng → HG · 4 người · 12/12"
 * - "Hà Giang · 2 người · 13/12"
 * - "Đà Nẵng → HG · 4 người" (when date is missing)
 * - "Hà Nội → HG · 4 ngày" (when homeCity & date are missing)
 * Returns `null` when no confirmed trip route/info is present yet (e.g. pure Q&A or all-assumed draft).
 */
export function buildConversationAutoTitle(input: ConversationAutoTitleInput): string | null {
  const info = input.tripInfo;
  const assumed = new Set(info?.assumedFields ?? []);

  const confirmedHome = shortCity(input.accessLeg?.homeCity) ?? shortCity(info?.homeCity);
  const confirmedOrigin =
    input.journey?.origin?.confirmed && !assumed.has("origin")
      ? shortCity(input.journey.origin.label)
      : null;

  const departure = confirmedHome ?? confirmedOrigin;
  const confirmedStartDate = !assumed.has("startDate") ? shortDateDayMonth(info?.startDate) : null;
  const confirmedDays = !assumed.has("durationDays") && typeof info?.durationDays === "number"
    ? info.durationDays
    : null;
  const confirmedTravelers =
    typeof input.accessLeg?.travelers === "number"
      ? input.accessLeg.travelers
      : typeof info?.travelers === "number"
        ? info.travelers
        : null;

  // Require at least a confirmed departure/hub OR confirmed date/days to rename from raw first message.
  if (!departure && !confirmedStartDate && !confirmedDays) return null;

  const routePart = departure
    ? isHaGiangCity(departure)
      ? "Hà Giang"
      : `${departure} → HG`
    : "Hà Giang";

  const parts = [routePart];
  if (confirmedTravelers !== null && confirmedTravelers > 0) {
    parts.push(`${confirmedTravelers} người`);
  }
  if (confirmedStartDate) {
    parts.push(confirmedStartDate);
  } else if (confirmedDays !== null) {
    parts.push(`${confirmedDays} ngày`);
  }

  return parts.join(" · ").slice(0, 120);
}

/** Extracts confirmed trip info / journey / access leg from stored assistant parts to derive an auto-title. */
export function autoTitleFromAssistantParts(parts: readonly StoredAssistantPart[]): string | null {
  let tripInfo: TripsageTripInfo | null = null;
  let journey: TripJourney | null = null;
  let accessLeg: AccessLegPart | null = null;
  for (const part of parts) {
    if (part.type === "data-trip-info") tripInfo = part.data.tripInfo;
    else if (part.type === "data-journey") journey = part.data.journey;
    else if (part.type === "data-access-leg") accessLeg = part.data;
  }
  return buildConversationAutoTitle({ tripInfo, journey, accessLeg });
}
