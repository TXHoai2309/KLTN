import { z } from "zod";
import {
  cleanAreaDisplayLabel,
  cleanPlaceDisplayName,
  cleanTravelerDisplay,
  resolveOvernightAreaLabel,
  type OvernightAreaContext,
} from "../../lib/traveler-display-clean";
import type { PlannerResult } from "../trip-planner/planner-contract";
import { LUNCH, scenicBufferMinutes, takesLunchAfter } from "../trip-planner/planner-engine";

/**
 * Client-safe day timeline (ADR-42 §2). Built by the server from a scheduled itinerary; every clock time comes from
 * the planner. Suggestions attach to `slotId`s and never change a time or become a visit.
 */
export const LUNCH_WINDOW = { fromMinute: LUNCH.fromMinute, toMinute: LUNCH.toMinute } as const;
export const DEFAULT_LUNCH_MINUTES = 60;
/** Days finishing before 16:00 show afternoon free time instead of placing "Nghỉ đêm" in the morning/midday. */
export const EARLY_DAY_END_MINUTE = 960;
const minute = z.number().int().min(0).max(2880).nullable();
export const TIMELINE_KINDS = ["DEPART", "DRIVE", "VISIT", "LUNCH", "FREE_TIME", "OVERNIGHT", "ARRIVE_HOME"] as const;
export const timelinePartSchema = z.object({
  days: z.array(z.object({
    day: z.number().int().min(1).max(14),
    date: z.string().max(10).nullable(),
    items: z.array(z.object({
      slotId: z.string().regex(/^d\d{1,2}-[a-z]+(-\d{1,2})?$/),
      kind: z.enum(TIMELINE_KINDS),
      startMinute: minute,
      endMinute: minute,
      label: z.string().min(1).max(200),
      description: z.string().trim().min(1).max(220).optional(),
      latitude: z.number().finite().min(-90).max(90).optional(),
      longitude: z.number().finite().min(-180).max(180).optional(),
      address: z.string().trim().min(1).max(300).optional(),
      googleMapsUrl: z.string().url().max(2000).optional(),
      placeId: z.string().min(1).max(300).optional(),
    }).strict()).max(40),
  }).strict()).min(1).max(14),
}).strict();
export type TimelinePart = z.infer<typeof timelinePartSchema>;
export type TimelineItem = TimelinePart["days"][number]["items"][number];

export const SUGGESTION_KINDS = ["MEAL", "EVENING", "LODGING", "TIP", "ACTIVITY"] as const;
export const suggestionSchema = z.object({
  slotId: z.string().regex(/^d\d{1,2}-[a-z]+(-\d{1,2})?$/),
  kind: z.enum(SUGGESTION_KINDS),
  title: z.string().trim().min(1).max(80),
  detail: z.string().trim().max(300).optional(),
  /** Set only for a Google Places result of this turn; shown as "chưa kiểm tra". */
  place: z.object({
    placeId: z.string().min(1).max(300).optional(),
    name: z.string().min(1).max(80),
    distanceKm: z.number().min(0).max(50),
  }).strict().optional(),
}).strict();
export const suggestionsPartSchema = z.object({ suggestions: z.array(suggestionSchema).min(1).max(16) }).strict();
export type TimelineSuggestion = z.infer<typeof suggestionSchema>;

export const chosenLodgingItemSchema = z.object({
  nightIndex: z.number().int().min(1).max(13),
  placeId: z.string().trim().min(1).max(300),
  name: z.string().trim().min(1).max(120),
}).strict();
export const chosenLodgingsPartSchema = z.object({
  chosenLodgings: z.array(chosenLodgingItemSchema).max(13),
}).strict().superRefine((value, ctx) => {
  const seen = new Set<number>();
  for (const item of value.chosenLodgings) {
    if (seen.has(item.nightIndex)) {
      ctx.addIssue({ code: "custom", message: "Duplicate nightIndex in chosenLodgings." });
      return;
    }
    seen.add(item.nightIndex);
  }
});
export type ChosenLodgingItem = z.infer<typeof chosenLodgingItemSchema>;
export type ChosenLodgingMap = Record<number, { placeId: string; name: string }>;

/** Extracts the 1-based night index from an overnight slotId (e.g. "d2-overnight" -> 2). */
export function nightIndexFromSlotId(slotId: string): number | null {
  const match = /^d(\d{1,2})-overnight$/.exec(slotId);
  if (!match) return null;
  const night = Number(match[1]);
  return Number.isInteger(night) && night >= 1 && night <= 13 ? night : null;
}

/** True iff the suggestion is a system-attached Google lodging suggestion for the given night. */
export function isEligibleLodgingSuggestion(suggestion: TimelineSuggestion, nightIndex: number): boolean {
  return (
    suggestion.kind === "LODGING" &&
    suggestion.slotId === `d${nightIndex}-overnight` &&
    Boolean(suggestion.place?.placeId?.trim())
  );
}

/**
 * Selects, replaces, or deselects a chosen lodging for `nightIndex`.
 * Only accepts a `placeId` present in the system's LODGING suggestions for that night (max 1 per night).
 */
export function toggleChosenLodging(
  current: ChosenLodgingMap,
  suggestions: readonly TimelineSuggestion[],
  nightIndex: number,
  placeId: string,
): ChosenLodgingMap {
  const match = suggestions.find(
    item => isEligibleLodgingSuggestion(item, nightIndex) && item.place!.placeId === placeId,
  );
  if (!match) return current;
  const next: ChosenLodgingMap = { ...current };
  if (next[nightIndex]?.placeId === placeId) {
    delete next[nightIndex];
  } else {
    next[nightIndex] = { placeId, name: (match.place!.name || match.title).trim().slice(0, 120) };
  }
  return next;
}

/** Drops chosen lodgings for nights that no longer exist after a replan (and optionally those no longer in suggestions). */
export function pruneChosenLodgings(
  current: ChosenLodgingMap,
  totalDays: number,
  suggestions?: readonly TimelineSuggestion[],
): ChosenLodgingMap {
  const maxNight = Math.max(0, totalDays - 1);
  const next: ChosenLodgingMap = {};
  for (const [key, value] of Object.entries(current)) {
    const night = Number(key);
    if (!Number.isInteger(night) || night < 1 || night > maxNight) continue;
    if (
      suggestions &&
      suggestions.some(s => isEligibleLodgingSuggestion(s, night)) &&
      !suggestions.some(s => isEligibleLodgingSuggestion(s, night) && s.place!.placeId === value.placeId)
    ) {
      continue;
    }
    next[night] = value;
  }
  return next;
}

export function chosenLodgingMapToList(map: ChosenLodgingMap): ChosenLodgingItem[] {
  return Object.entries(map)
    .map(([key, value]) => ({ nightIndex: Number(key), placeId: value.placeId, name: value.name }))
    .filter(item => Number.isInteger(item.nightIndex) && item.nightIndex >= 1 && item.nightIndex <= 13)
    .sort((a, b) => a.nightIndex - b.nightIndex);
}

export function chosenLodgingListToMap(items: readonly ChosenLodgingItem[]): ChosenLodgingMap {
  const out: ChosenLodgingMap = {};
  for (const item of items) {
    if (Number.isInteger(item.nightIndex) && item.nightIndex >= 1 && item.nightIndex <= 13) {
      out[item.nightIndex] = { placeId: item.placeId, name: item.name };
    }
  }
  return out;
}

export const clockLabel = (value: number | null) => (value === null ? "--:--" : `${String(Math.floor(value / 60) % 24).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`);

/** Slot ids a suggestion may use for an itinerary of `dayCount` days with these visit counts. Same scheme as `buildDayTimeline`. */
export function timelineSlotIds(visitsPerDay: readonly number[]): Set<string> {
  const ids = new Set<string>();
  visitsPerDay.forEach((count, index) => {
    const day = index + 1;
    ids.add(`d${day}-lunch`);
    for (let visit = 1; visit <= count; visit++) ids.add(`d${day}-visit-${visit}`);
    if (day < visitsPerDay.length) ids.add(`d${day}-overnight`);
  });
  return ids;
}

const driveMinutes = (seconds: number | null | undefined) => (seconds == null ? null : Math.ceil(seconds / 60));

/** ADR-57 (D4): gentle advisory note when lunch falls outside the familiar 11:15–13:30 band. */
export function formatLunchAdvisoryNote(fromMinute: number): string | undefined {
  if (fromMinute < LUNCH.fromMinute) return "Nghỉ trưa sớm (trước điểm tham quan dài)";
  if (fromMinute > 810) return "Nghỉ trưa muộn hơn khung quen thuộc";
  return undefined;
}

/**
 * Mirrors the planner's flexible lunch rule (ADR-55 / ADR-57 D4):
 * checks validated gap between stops first (allowing pre-long-visit early or delayed lunch),
 * falling back to trailing lunch only when active sightseeing crosses all of 12:00–13:00 with no earlier lunch break.
 */
function lunchAfter(
  stops: readonly { arrivalMinute: number | null; departureMinute: number | null; visitDurationMinutes?: number; inbound?: { durationSeconds: number | null } | null }[],
  lunchMinutes: number = DEFAULT_LUNCH_MINUTES,
  requirement?: { transport: "MOTORCYCLE" | "CAR"; pace?: "RELAXED" | "MODERATE" | "PACKED" | null; hasJourney?: boolean },
): { afterIndex: number; fromMinute: number; toMinute: number; durationMinutes: number; note?: string } | null {
  for (let index = 0; index < stops.length - 1; index++) {
    const departure = stops[index]!.departureMinute;
    const next = stops[index + 1]!;
    const drive = driveMinutes(next.inbound?.durationSeconds);
    const scenic = requirement?.hasJourney && next.inbound?.durationSeconds != null ? scenicBufferMinutes(next.inbound.durationSeconds, { transport: requirement.transport, pace: requirement.pace ?? null }) : 0;
    const nextVisit = next.visitDurationMinutes ?? (next.arrivalMinute !== null && next.departureMinute !== null ? next.departureMinute - next.arrivalMinute : null);
    if (!takesLunchAfter(departure, drive, {
      nextVisitMinutes: nextVisit,
      nextScenicMinutes: scenic,
      isNextLastStop: index + 1 === stops.length - 1,
      allowLateExtended: true,
    })) continue;
    if (next.arrivalMinute !== null && next.arrivalMinute < departure! + lunchMinutes + (drive ?? 0)) continue;
    const fromMinute = departure!;
    return {
      afterIndex: index,
      fromMinute,
      toMinute: fromMinute + lunchMinutes,
      durationMinutes: lunchMinutes,
      ...(formatLunchAdvisoryNote(fromMinute) ? { note: formatLunchAdvisoryNote(fromMinute) } : {}),
    };
  }
  if (stops.length >= 2) {
    const firstArr = stops[0]!.arrivalMinute;
    const lastDep = stops.at(-1)!.departureMinute;
    if (firstArr !== null && lastDep !== null && firstArr < 750 && lastDep > 780) {
      return {
        afterIndex: stops.length - 1,
        fromMinute: lastDep,
        toMinute: Math.min(1080, lastDep + lunchMinutes),
        durationMinutes: Math.max(30, Math.min(lunchMinutes, 1080 - lastDep)),
        note: "Nghỉ trưa muộn (lịch liên tục qua trưa)",
      };
    }
  }
  return null;
}

export interface ResolvedDayLunch {
  afterStopIndex: number;
  fromMinute: number;
  toMinute: number;
  durationMinutes: number;
  note?: string;
}

/**
 * Resolves the validated lunch break for a day's chronologically ordered stops.
 * Prefers an explicit validated `LUNCH` item from `timelineDay` when present; otherwise derives
 * the break from the validated stop schedule (and optional `journeyPlan` transfer leg evidence).
 * Never fabricates a default 12:00 lunch or overlaps an adjacent stop.
 */
export function resolveDayLunchBreak(input: {
  stops: readonly { destinationId: string; arrivalMinute: number | null; departureMinute: number | null }[];
  timelineDay?: TimelinePart["days"][number] | null;
  lunchMinutes?: number | null;
  journeyPlan?: PlannerResult["journeyPlan"];
}): ResolvedDayLunch | null {
  const { stops, timelineDay, journeyPlan } = input;
  if (stops.length < 2) return null;
  const lunchMinutes = input.lunchMinutes && input.lunchMinutes > 0 ? input.lunchMinutes : DEFAULT_LUNCH_MINUTES;

  if (timelineDay) {
    const lunchItem = timelineDay.items.find(
      (item) => item.kind === "LUNCH" && item.startMinute !== null && item.endMinute !== null && item.endMinute > item.startMinute,
    );
    if (!lunchItem) return null;
    const fromMinute = lunchItem.startMinute!;
    const toMinute = lunchItem.endMinute!;
    const note = lunchItem.description ?? formatLunchAdvisoryNote(fromMinute);
    for (let i = stops.length - 1; i >= 0; i--) {
      const dep = stops[i]!.departureMinute;
      const nextArr = i + 1 < stops.length ? stops[i + 1]!.arrivalMinute : null;
      if (dep !== null && dep <= fromMinute && (nextArr === null || toMinute <= nextArr)) {
        return { afterStopIndex: i, fromMinute, toMinute, durationMinutes: toMinute - fromMinute, ...(note ? { note } : {}) };
      }
    }
    return null;
  }

  for (let i = 0; i < stops.length - 1; i++) {
    const dep = stops[i]!.departureMinute;
    const next = stops[i + 1]!;
    const nextArr = next.arrivalMinute;
    const nextVisit = nextArr !== null && next.departureMinute !== null ? next.departureMinute - nextArr : null;
    const leg = journeyPlan?.legs.find(
      (item) => item.kind === "TRANSFER" && item.to.kind === "ATTRACTION" && item.to.destinationId === next.destinationId,
    );
    if (!takesLunchAfter(dep, driveMinutes(leg?.route.durationSeconds), {
      nextVisitMinutes: nextVisit,
      isNextLastStop: i + 1 === stops.length - 1,
      allowLateExtended: true,
    }) && !(dep !== null && dep >= LUNCH.earlyFromMinute && leg && leg.endMinute != null && nextArr !== null && nextArr - leg.endMinute >= lunchMinutes)) continue;
    if (nextArr !== null && nextArr < dep! + lunchMinutes) continue;
    if (leg && leg.endMinute != null && nextArr !== null && nextArr - leg.endMinute < lunchMinutes) continue;
    const note = formatLunchAdvisoryNote(dep!);
    return { afterStopIndex: i, fromMinute: dep!, toMinute: dep! + lunchMinutes, durationMinutes: lunchMinutes, ...(note ? { note } : {}) };
  }
  const firstArr = stops[0]!.arrivalMinute;
  const lastDep = stops.at(-1)!.departureMinute;
  if (firstArr !== null && lastDep !== null && firstArr < 750 && lastDep > 780) {
    return {
      afterStopIndex: stops.length - 1,
      fromMinute: lastDep,
      toMinute: Math.min(1080, lastDep + lunchMinutes),
      durationMinutes: Math.max(30, Math.min(lunchMinutes, 1080 - lastDep)),
      note: "Nghỉ trưa muộn (lịch liên tục qua trưa)",
    };
  }
  return null;
}

/** Formats a concise 1-line catalog description for a VISIT slot; returns undefined if empty (never invents). */
export function formatVisitDescription(raw: string | null | undefined): string | undefined {
  const cleaned = cleanTravelerDisplay(raw);
  if (!cleaned) return undefined;
  if (cleaned.length <= 160) return cleaned;
  const firstSentence = cleaned.match(/^.+?[.!?](?=\s|$)/u)?.[0]?.trim();
  if (firstSentence && firstSentence.length >= 24 && firstSentence.length <= 180) return firstSentence;
  const cut = cleaned.slice(0, 159).replace(/\s+\S*$/u, "").trim();
  return `${cut || cleaned.slice(0, 159)}…`;
}

/** Formats overnight area without duplicating "khu vực" and avoiding generic "Hà Giang" or landmark names. */
export function formatOvernightLabel(
  area: string | null | undefined,
  lastStopName?: string | null | undefined,
  context?: OvernightAreaContext,
): string {
  const cleaned = resolveOvernightAreaLabel(area, lastStopName, context);
  return cleaned ? `Nghỉ đêm khu vực ${cleaned}` : "Nghỉ đêm";
}

function formatApproxDuration(seconds: number): string {
  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours === 0) return `~${mins} phút`;
  return mins === 0 ? `~${hours} giờ` : `~${hours} giờ ${mins} phút`;
}

/** Label for a day with no scheduled visits that carries an outbound or return travel leg. */
export function formatTravelOnlyDayLabel(
  day: PlannerResult["days"][number],
  journeyPlan?: PlannerResult["journeyPlan"],
): string | null {
  if (day.stops.length > 0) return null;
  const leg = journeyPlan?.legs.find(item => (item.kind === "OUTBOUND" || item.kind === "RETURN") && item.day === day.day);
  const isTravelOnly = day.journeyDayKind === "OUTBOUND_ONLY" || day.journeyDayKind === "RETURN_ONLY" || leg !== undefined;
  if (!isTravelOnly) return null;
  const meters = leg?.route.distanceMeters ?? day.distanceMeters ?? null;
  const seconds = leg?.route.durationSeconds ?? day.travelSeconds ?? null;
  const parts = ["Ngày di chuyển"];
  if (meters !== null && meters > 0) parts.push(`${Math.round(meters / 1000).toLocaleString("vi-VN")} km`);
  if (seconds !== null && seconds > 0) parts.push(formatApproxDuration(seconds));
  return parts.join(" · ");
}

export function buildDayTimeline(result: PlannerResult): TimelinePart {
  const lunchMinutes = result.requirement.dayRhythm?.lunchMinutes ?? DEFAULT_LUNCH_MINUTES;
  const originLabel = result.requirement.journey?.origin?.label ?? "điểm xuất phát";
  const legs = result.journeyPlan?.legs ?? [];
  const last = result.days.length;
  return {
    days: result.days.map(day => {
      const items: TimelineItem[] = [];
      const outbound = legs.find(leg => leg.kind === "OUTBOUND" && leg.day === day.day);
      const travelOnlyLabel = formatTravelOnlyDayLabel(day, result.journeyPlan);
      if (outbound) {
        items.push({ slotId: `d${day.day}-depart`, kind: "DEPART", startMinute: outbound.startMinute, endMinute: null, label: `Khởi hành từ ${originLabel}` });
        const driveBase = travelOnlyLabel ?? "Di chuyển";
        items.push({ slotId: `d${day.day}-drive-0`, kind: "DRIVE", startMinute: outbound.startMinute, endMinute: outbound.endMinute, label: outbound.restMinutes ? `${driveBase}, gồm ${outbound.restMinutes} phút nghỉ dọc đường` : driveBase });
      } else if (travelOnlyLabel && !legs.some(leg => leg.kind === "RETURN" && leg.day === day.day)) {
        items.push({ slotId: `d${day.day}-drive-0`, kind: "DRIVE", startMinute: null, endMinute: null, label: travelOnlyLabel });
      }
      const lunch = lunchAfter(day.stops, lunchMinutes, {
        transport: result.requirement.transport,
        pace: result.requirement.pace,
        hasJourney: Boolean(result.journeyPlan),
      });
      day.stops.forEach((stop, index) => {
        if (index > 0 || (day.day > 1 && stop.inbound)) {
          const prevStop = index > 0 ? day.stops[index - 1] : null;
          const leg = legs.find(
            item =>
              item.day === day.day &&
              item.kind === "TRANSFER" &&
              item.to.kind === "ATTRACTION" &&
              item.to.destinationId === stop.destination.id &&
              (!prevStop || item.from.kind !== "ATTRACTION" || item.from.destinationId === prevStop.destination.id),
          );
          const route = leg?.route ?? stop.inbound;
          const verified = route?.status === "VERIFIED" && route.distanceMeters != null && route.durationSeconds != null;
          if (verified && route) {
            const minutes = Math.max(1, Math.ceil(route.durationSeconds! / 60));
            const kmValue = Math.round((route.distanceMeters! / 1000) * 10) / 10;
            const kmLabel = `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(kmValue)} km`;
            const icon = result.requirement.transport === "CAR" ? "🚗" : "🛵";
            // ADR-55: the planner leaves roadside photo time on journey plans; say so instead of hiding it in the clock.
            const photo = result.journeyPlan ? scenicBufferMinutes(route.durationSeconds, result.requirement) : 0;
            const rest = leg?.restMinutes ?? 0;
            const hoursPart = minutes >= 60 ? `khoảng ${Math.floor(minutes / 60)} giờ${minutes % 60 ? ` ${minutes % 60} phút` : ""}` : `khoảng ${minutes} phút`;
            const parts = [`${icon} ${kmLabel}`, hoursPart];
            if (rest > 0) parts.push(`nghỉ ${rest} phút`);
            if (photo > 0) parts.push(`+${photo} phút chụp ảnh`);
            items.push({ slotId: `d${day.day}-drive-${index}`, kind: "DRIVE", startMinute: null, endMinute: stop.arrivalMinute, label: parts.join(" · ") });
          } else if (index > 0 || stop.inbound) {
            items.push({ slotId: `d${day.day}-drive-${index}`, kind: "DRIVE", startMinute: null, endMinute: stop.arrivalMinute, label: "Chưa có dữ liệu tuyến" });
          }
        }
        const description = formatVisitDescription(stop.destination.description);
        const externalPrefix = "ext:gplace:";
        const placeId = stop.destination.external && stop.destination.id.startsWith(externalPrefix)
          ? stop.destination.id.slice(externalPrefix.length)
          : undefined;
        const hasCoords =
          Number.isFinite(stop.destination.latitude) &&
          Number.isFinite(stop.destination.longitude) &&
          Math.abs(stop.destination.latitude) <= 90 &&
          Math.abs(stop.destination.longitude) <= 180;
        const cleanedAddress = cleanAreaDisplayLabel(stop.destination.address);
        const address = cleanedAddress ? cleanedAddress.slice(0, 300) : undefined;
        const googleMapsUrl = stop.destination.googleMapsUrl?.trim() || undefined;
        items.push({
          slotId: `d${day.day}-visit-${index + 1}`,
          kind: "VISIT",
          startMinute: stop.arrivalMinute,
          endMinute: stop.departureMinute,
          label: cleanPlaceDisplayName(stop.destination.name) || stop.destination.name,
          ...(description ? { description } : {}),
          ...(placeId ? { placeId } : {}),
          ...(hasCoords ? { latitude: stop.destination.latitude, longitude: stop.destination.longitude } : {}),
          ...(address ? { address } : {}),
          ...(googleMapsUrl ? { googleMapsUrl } : {}),
        });
        if (lunch !== null && index === lunch.afterIndex) {
          items.push({
            slotId: `d${day.day}-lunch`,
            kind: "LUNCH",
            startMinute: lunch.fromMinute,
            endMinute: lunch.toMinute,
            label: `Nghỉ trưa ${lunch.durationMinutes} phút`,
            ...(lunch.note ? { description: lunch.note } : {}),
          });
        }
      });
      const returning = legs.find(leg => leg.kind === "RETURN" && leg.day === day.day);
      if (returning) {
        const returnBase = travelOnlyLabel ?? "Chặng về";
        items.push({ slotId: `d${day.day}-drive-9`, kind: "DRIVE", startMinute: returning.startMinute, endMinute: returning.endMinute, label: returning.restMinutes ? `${returnBase}, gồm ${returning.restMinutes} phút nghỉ dọc đường` : returnBase });
        items.push({ slotId: `d${day.day}-home`, kind: "ARRIVE_HOME", startMinute: returning.endMinute, endMinute: null, label: `Về đến ${originLabel}` });
      }
      const lastStop = day.stops.at(-1);
      const overnightCtx: OvernightAreaContext | undefined = lastStop
        ? {
            address: lastStop.destination.address,
            latitude: lastStop.destination.latitude,
            longitude: lastStop.destination.longitude,
          }
        : undefined;
      if (day.day < last) {
        const lastActivityEnd = lastStop?.departureMinute ?? outbound?.endMinute ?? null;
        if (lastActivityEnd !== null && lastActivityEnd < EARLY_DAY_END_MINUTE) {
          items.push({ slotId: `d${day.day}-free`, kind: "FREE_TIME", startMinute: lastActivityEnd, endMinute: null, label: "Tự do buổi chiều" });
          items.push({ slotId: `d${day.day}-overnight`, kind: "OVERNIGHT", startMinute: null, endMinute: null, label: formatOvernightLabel(lastStop?.destination.area, lastStop?.destination.name, overnightCtx) });
        } else {
          items.push({ slotId: `d${day.day}-overnight`, kind: "OVERNIGHT", startMinute: lastActivityEnd, endMinute: null, label: formatOvernightLabel(lastStop?.destination.area, lastStop?.destination.name, overnightCtx) });
        }
      }
      return { day: day.day, date: day.date, items };
    }),
  };
}
