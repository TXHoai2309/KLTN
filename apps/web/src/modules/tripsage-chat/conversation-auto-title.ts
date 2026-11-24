import type { TripJourney } from "../trip-origin/trip-origin-contract";
import type { AccessLegPart } from "./tripsage-access-leg";
import type { TripsageTripInfo } from "./tripsage-chat-context";
import type { StoredAssistantPart } from "./assistant-conversation-contract";

import { extractOriginCityProvince } from "../../lib/traveler-trip-title";

function shortCity(raw: string | null | undefined): string | null {
  return extractOriginCityProvince(raw, { allowHaGiang: true });
}

function isHaGiangCity(name: string): boolean {
  return /^hà giang$/iu.test(name);
}

function shortDateDayMonth(iso: string | undefined): string | null {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso) : null;
  if (!m) return null;
  return `${Number(m[3])}/${Number(m[2])}`;
}

export function extractTitleCountMetadata(title: string | null | undefined): {
  travelers: number | null;
  days: number | null;
  date: string | null;
} {
  const normalized = title?.normalize("NFC").trim() ?? "";
  if (!normalized) return { travelers: null, days: null, date: null };
  const travelersMatch = /(?:^|[\s,·])(\d{1,2})\s*ng[uư][oờ]i(?=$|[\s,·])/iu.exec(normalized);
  const daysMatch = /(?:^|[\s,·])(\d{1,2})\s*ng[aà]y(?=$|[\s,·])/iu.exec(normalized);
  const dateMatch = /(?:^|[\s,·])(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)(?=$|[\s,·])/u.exec(normalized);
  const travelers = travelersMatch ? Number(travelersMatch[1]) : null;
  const days = daysMatch ? Number(daysMatch[1]) : null;
  return {
    travelers: travelers && travelers > 0 ? travelers : null,
    days: days && days > 0 ? days : null,
    date: dateMatch?.[1] ?? null,
  };
}

export interface ConversationAutoTitleInput {
  tripInfo?: TripsageTripInfo | null;
  journey?: TripJourney | null;
  accessLeg?: AccessLegPart | null;
  existingTitle?: string | null;
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
  const existingMeta = extractTitleCountMetadata(input.existingTitle);

  const confirmedHome = shortCity(input.accessLeg?.homeCity) ?? shortCity(info?.homeCity);
  const confirmedOrigin =
    input.journey?.origin?.confirmed && !assumed.has("origin")
      ? shortCity(input.journey.origin.label)
      : null;

  const departure = confirmedHome ?? confirmedOrigin;
  const confirmedStartDate = !assumed.has("startDate") ? shortDateDayMonth(info?.startDate) : null;
  const confirmedDays = !assumed.has("durationDays") && typeof info?.durationDays === "number"
    ? info.durationDays
    : existingMeta.days;
  const confirmedTravelers =
    typeof input.accessLeg?.travelers === "number" && input.accessLeg.travelers > 0
      ? input.accessLeg.travelers
      : typeof info?.travelers === "number" && info.travelers > 0
        ? info.travelers
        : existingMeta.travelers;

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
    if (existingMeta.days !== null) parts.push(`${existingMeta.days} ngày`);
    parts.push(confirmedStartDate);
  } else if (confirmedDays !== null) {
    parts.push(`${confirmedDays} ngày`);
  }

  return parts.join(" · ").slice(0, 120);
}

/** Extracts confirmed trip info / journey / access leg from stored assistant parts to derive an auto-title. */
export function autoTitleFromAssistantParts(
  parts: readonly StoredAssistantPart[],
  options?: { existingTitle?: string | null },
): string | null {
  let tripInfo: NonNullable<TripsageTripInfo> | null = null;
  let journey: TripJourney | null = null;
  let accessLeg: AccessLegPart | null = null;
  let costTravelers: number | null = null;
  for (const part of parts) {
    if (part.type === "data-trip-info") {
      const rawIncoming =
        part.data.tripInfo && typeof part.data.tripInfo === "object"
          ? (part.data.tripInfo as Record<string, unknown>)
          : {};
      const incoming = Object.fromEntries(
        Object.entries(rawIncoming).filter(([, value]) => value !== undefined),
      ) as NonNullable<TripsageTripInfo>;
      tripInfo = Object.assign({}, tripInfo ?? {}, incoming);
    } else if (part.type === "data-journey") {
      journey = part.data.journey;
    } else if (part.type === "data-access-leg") {
      accessLeg = part.data;
    } else if (part.type === "data-cost") {
      const maybeTravelers = (part.data as { travelers?: unknown } | undefined)?.travelers;
      if (typeof maybeTravelers === "number" && maybeTravelers > 0) {
        costTravelers = maybeTravelers;
      }
    }
  }
  const effectiveTripInfo: NonNullable<TripsageTripInfo> | null =
    costTravelers !== null && !(typeof tripInfo?.travelers === "number" && tripInfo.travelers > 0)
      ? Object.assign({}, tripInfo ?? {}, { travelers: costTravelers })
      : tripInfo;
  return buildConversationAutoTitle({
    tripInfo: effectiveTripInfo,
    journey,
    accessLeg,
    existingTitle: options?.existingTitle,
  });
}
