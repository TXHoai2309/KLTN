import { fromMinute, toMinute, weekdays } from "../destination/destination-contract";
import type { FavoriteList } from "../favorite/favorite-contract";
import type { PublicLocation } from "../destination/public-destination-query";
import { isValidCalendarDate } from "../trip-requirement/trip-requirement-contract";

export type OpeningWeekday = (typeof weekdays)[number];

export type OpeningIntervalLabel = {
  opensAt: string;
  closesAt: string;
};

export type OpeningDayMeta = {
  dayOfWeek: OpeningWeekday;
  status: "OPEN" | "CLOSED" | "UNKNOWN";
  intervals: OpeningIntervalLabel[];
};

export type EditCatalogDestinationMeta = {
  suggestedDurationMinutes: number | null;
  minimumDurationMinutes: number | null;
  isOutdoor?: boolean;
  openingDays: OpeningDayMeta[];
};

export type SmartVisitTiming = {
  startMinute: number;
  startTime: string;
  durationMinutes: number;
  usedSuggestedDuration: boolean;
  adjustedForOpening: boolean;
};

export const DEFAULT_VISIT_START_MINUTE = 480; // 08:00
export const DEFAULT_VISIT_BUFFER_MINUTES = 15;
export const FALLBACK_VISIT_DURATION_MINUTES = 60;
const MAX_START_MINUTE = 1439;

export function weekdayForLocalDate(localDate: string | null): OpeningWeekday | null {
  if (!localDate || !isValidCalendarDate(localDate)) return null;
  return weekdays[(new Date(`${localDate}T00:00:00Z`).getUTCDay() + 6) % 7] ?? null;
}

export function openingDayFromMinuteIntervals(input: {
  dayOfWeek: OpeningWeekday;
  status: "OPEN" | "CLOSED" | "UNKNOWN";
  intervals: readonly { opensAtMinute: number; closesAtMinute: number }[];
}): OpeningDayMeta {
  return {
    dayOfWeek: input.dayOfWeek,
    status: input.status,
    intervals: input.intervals.map((interval) => ({
      opensAt: interval.opensAtMinute >= 1440 ? "24:00" : fromMinute(interval.opensAtMinute),
      closesAt: interval.closesAtMinute >= 1440 ? "24:00" : fromMinute(interval.closesAtMinute),
    })),
  };
}

export function findOpeningDayForDate(
  openingDays: readonly OpeningDayMeta[] | null | undefined,
  localDate: string | null,
): OpeningDayMeta | null {
  const weekday = weekdayForLocalDate(localDate);
  if (!weekday || !openingDays?.length) return null;
  return openingDays.find((day) => day.dayOfWeek === weekday) ?? null;
}

export function formatOpeningSummaryForDate(
  openingDays: readonly OpeningDayMeta[] | null | undefined,
  localDate: string | null,
): { status: "OPEN" | "CLOSED" | "UNKNOWN"; label: string } {
  const day = findOpeningDayForDate(openingDays, localDate);
  if (!day || day.status === "UNKNOWN") {
    return { status: "UNKNOWN", label: "Chưa có dữ liệu giờ mở cửa" };
  }
  if (day.status === "CLOSED") {
    return { status: "CLOSED", label: "Đóng cửa vào ngày này" };
  }
  if (day.intervals.length === 0) {
    return { status: "UNKNOWN", label: "Chưa có khung giờ mở cửa" };
  }
  return {
    status: "OPEN",
    label: `Mở cửa ${day.intervals.map((item) => `${item.opensAt}–${item.closesAt}`).join(", ")}`,
  };
}

export function resolveDefaultDurationMinutes(
  meta: Pick<EditCatalogDestinationMeta, "suggestedDurationMinutes" | "minimumDurationMinutes"> | null | undefined,
): { durationMinutes: number; usedSuggestedDuration: boolean } {
  const suggested = meta?.suggestedDurationMinutes;
  if (suggested != null && Number.isInteger(suggested) && suggested >= 1) {
    return { durationMinutes: suggested, usedSuggestedDuration: true };
  }
  const minimum = meta?.minimumDurationMinutes;
  if (minimum != null && Number.isInteger(minimum) && minimum >= 1) {
    return {
      durationMinutes: Math.max(minimum, FALLBACK_VISIT_DURATION_MINUTES),
      usedSuggestedDuration: false,
    };
  }
  return {
    durationMinutes: FALLBACK_VISIT_DURATION_MINUTES,
    usedSuggestedDuration: false,
  };
}

/**
 * Computes a sensible initial start time & duration when adding a destination
 * to `dayVisits`, sequencing after existing stops and respecting opening hours when available.
 */
export function computeSmartVisitTiming(input: {
  dayVisits: readonly { startMinute: number; plannedDurationMinutes: number }[];
  localDate: string | null;
  meta?: EditCatalogDestinationMeta | null;
}): SmartVisitTiming {
  const { durationMinutes, usedSuggestedDuration } = resolveDefaultDurationMinutes(input.meta);

  let candidateStart = DEFAULT_VISIT_START_MINUTE;
  if (input.dayVisits.length > 0) {
    const latestEnd = input.dayVisits.reduce(
      (maxEnd, visit) => Math.max(maxEnd, visit.startMinute + visit.plannedDurationMinutes),
      0,
    );
    candidateStart = latestEnd + DEFAULT_VISIT_BUFFER_MINUTES;
  }

  let adjustedForOpening = false;
  const openingDay = findOpeningDayForDate(input.meta?.openingDays, input.localDate);
  if (openingDay?.status === "OPEN" && openingDay.intervals.length > 0) {
    const parsedIntervals = openingDay.intervals
      .map((item) => ({ opens: toMinute(item.opensAt), closes: toMinute(item.closesAt) }))
      .filter((item) => item.closes > item.opens)
      .sort((a, b) => a.opens - b.opens);

    const alreadyFits = parsedIntervals.some(
      (item) => candidateStart >= item.opens && candidateStart + durationMinutes <= item.closes,
    );
    if (!alreadyFits) {
      const nextFitting = parsedIntervals.find(
        (item) => Math.max(candidateStart, item.opens) + durationMinutes <= item.closes,
      ) ?? parsedIntervals.find((item) => item.closes > candidateStart);
      if (nextFitting && candidateStart < nextFitting.opens && nextFitting.opens <= MAX_START_MINUTE) {
        candidateStart = nextFitting.opens;
        adjustedForOpening = true;
      }
    }
  }

  const startMinute = Math.min(MAX_START_MINUTE, Math.max(0, candidateStart));
  return {
    startMinute,
    startTime: fromMinute(startMinute),
    durationMinutes,
    usedSuggestedDuration,
    adjustedForOpening,
  };
}

export function extractFavoriteDestinationIds(list: FavoriteList): Set<string> {
  return new Set(list.destinations.map((item) => item.targetId));
}

export function filterDrawerDestinations(
  items: readonly PublicLocation[],
  favoritesOnly: boolean,
  favoriteIds: ReadonlySet<string>,
): PublicLocation[] {
  if (!favoritesOnly) return [...items];
  return items.filter((item) => favoriteIds.has(item.id));
}

export function createClientVisitId(destinationId: string): string {
  const safeSuffix =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID().slice(0, 8)
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const normalizedDest = destinationId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 16) || "dest";
  return `visit-${normalizedDest}-${safeSuffix}`;
}
