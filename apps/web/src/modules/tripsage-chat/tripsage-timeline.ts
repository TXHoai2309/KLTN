import { z } from "zod";
import type { PlannerResult } from "../trip-planner/planner-contract";

/**
 * Client-safe day timeline (ADR-42 §2). Built by the server from a scheduled itinerary; every clock time comes from
 * the planner. Suggestions attach to `slotId`s and never change a time or become a visit.
 */
export const LUNCH_WINDOW = { fromMinute: 690, toMinute: 840 } as const;
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
    }).strict()).max(20),
  }).strict()).min(1).max(14),
}).strict();
export type TimelinePart = z.infer<typeof timelinePartSchema>;
export type TimelineItem = TimelinePart["days"][number]["items"][number];

export const SUGGESTION_KINDS = ["MEAL", "EVENING", "LODGING", "TIP"] as const;
export const suggestionSchema = z.object({
  slotId: z.string().regex(/^d\d{1,2}-[a-z]+(-\d{1,2})?$/),
  kind: z.enum(SUGGESTION_KINDS),
  title: z.string().trim().min(1).max(80),
  detail: z.string().trim().max(300).optional(),
  /** Set only for a Google Places result of this turn; shown as "chưa kiểm tra". */
  place: z.object({ name: z.string().min(1).max(80), distanceKm: z.number().min(0).max(50) }).strict().optional(),
}).strict();
export const suggestionsPartSchema = z.object({ suggestions: z.array(suggestionSchema).min(1).max(16) }).strict();
export type TimelineSuggestion = z.infer<typeof suggestionSchema>;

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

/** Mirrors the planner's lunch rule: the first visit ending 11:30–14:00 with a later visit that day is followed by lunch. */
function lunchAfter(stops: PlannerResult["days"][number]["stops"]): number | null {
  for (let index = 0; index < stops.length - 1; index++) {
    const departure = stops[index]!.departureMinute;
    if (departure !== null && departure >= LUNCH_WINDOW.fromMinute && departure <= LUNCH_WINDOW.toMinute) return departure;
  }
  return null;
}

/** Formats overnight area without duplicating "khu vực" (e.g. "khu vực Hà Giang" → "Nghỉ đêm khu vực Hà Giang"). */
export function formatOvernightLabel(area: string | null | undefined): string {
  const cleaned = (area ?? "").trim().replace(/^(?:khu\s+vực\s+)+/iu, "").trim();
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
      const lunch = lunchAfter(day.stops);
      day.stops.forEach((stop, index) => {
        if (index > 0 && stop.inbound) {
          const minutes = stop.inbound.durationSeconds === null ? null : Math.ceil(stop.inbound.durationSeconds / 60);
          items.push({ slotId: `d${day.day}-drive-${index}`, kind: "DRIVE", startMinute: null, endMinute: stop.arrivalMinute, label: minutes === null ? "Di chuyển (chưa có dữ liệu tuyến)" : `Di chuyển khoảng ${minutes} phút` });
        }
        items.push({ slotId: `d${day.day}-visit-${index + 1}`, kind: "VISIT", startMinute: stop.arrivalMinute, endMinute: stop.departureMinute, label: stop.destination.name });
        if (lunch !== null && stop.departureMinute === lunch && index < day.stops.length - 1) {
          items.push({ slotId: `d${day.day}-lunch`, kind: "LUNCH", startMinute: lunch, endMinute: lunch + lunchMinutes, label: `Nghỉ trưa ${lunchMinutes} phút` });
        }
      });
      const returning = legs.find(leg => leg.kind === "RETURN" && leg.day === day.day);
      if (returning) {
        const returnBase = travelOnlyLabel ?? "Chặng về";
        items.push({ slotId: `d${day.day}-drive-9`, kind: "DRIVE", startMinute: returning.startMinute, endMinute: returning.endMinute, label: returning.restMinutes ? `${returnBase}, gồm ${returning.restMinutes} phút nghỉ dọc đường` : returnBase });
        items.push({ slotId: `d${day.day}-home`, kind: "ARRIVE_HOME", startMinute: returning.endMinute, endMinute: null, label: `Về đến ${originLabel}` });
      }
      const lastStop = day.stops.at(-1);
      if (day.day < last) {
        const lastActivityEnd = lastStop?.departureMinute ?? outbound?.endMinute ?? null;
        if (lastActivityEnd !== null && lastActivityEnd < EARLY_DAY_END_MINUTE) {
          items.push({ slotId: `d${day.day}-free`, kind: "FREE_TIME", startMinute: lastActivityEnd, endMinute: null, label: "Tự do buổi chiều" });
          items.push({ slotId: `d${day.day}-overnight`, kind: "OVERNIGHT", startMinute: null, endMinute: null, label: formatOvernightLabel(lastStop?.destination.area) });
        } else {
          items.push({ slotId: `d${day.day}-overnight`, kind: "OVERNIGHT", startMinute: lastActivityEnd, endMinute: null, label: formatOvernightLabel(lastStop?.destination.area) });
        }
      }
      return { day: day.day, date: day.date, items };
    }),
  };
}
