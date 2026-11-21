import { z } from "zod";
import type { PlannerResult } from "../trip-planner/planner-contract";

/**
 * Client-safe day timeline (ADR-42 §2). Built by the server from a scheduled itinerary; every clock time comes from
 * the planner. Suggestions attach to `slotId`s and never change a time or become a visit.
 */
export const LUNCH_WINDOW = { fromMinute: 690, toMinute: 840 } as const;
export const DEFAULT_LUNCH_MINUTES = 60;
const minute = z.number().int().min(0).max(2880).nullable();
export const TIMELINE_KINDS = ["DEPART", "DRIVE", "VISIT", "LUNCH", "OVERNIGHT", "ARRIVE_HOME"] as const;
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

export function buildDayTimeline(result: PlannerResult): TimelinePart {
  const lunchMinutes = result.requirement.dayRhythm?.lunchMinutes ?? DEFAULT_LUNCH_MINUTES;
  const originLabel = result.requirement.journey?.origin?.label ?? "điểm xuất phát";
  const legs = result.journeyPlan?.legs ?? [];
  const last = result.days.length;
  return {
    days: result.days.map(day => {
      const items: TimelineItem[] = [];
      const outbound = legs.find(leg => leg.kind === "OUTBOUND" && leg.day === day.day);
      if (outbound) {
        items.push({ slotId: `d${day.day}-depart`, kind: "DEPART", startMinute: outbound.startMinute, endMinute: null, label: `Khởi hành từ ${originLabel}` });
        items.push({ slotId: `d${day.day}-drive-0`, kind: "DRIVE", startMinute: outbound.startMinute, endMinute: outbound.endMinute, label: outbound.restMinutes ? `Di chuyển, gồm ${outbound.restMinutes} phút nghỉ dọc đường` : "Di chuyển" });
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
        items.push({ slotId: `d${day.day}-drive-9`, kind: "DRIVE", startMinute: returning.startMinute, endMinute: returning.endMinute, label: returning.restMinutes ? `Chặng về, gồm ${returning.restMinutes} phút nghỉ dọc đường` : "Chặng về" });
        items.push({ slotId: `d${day.day}-home`, kind: "ARRIVE_HOME", startMinute: returning.endMinute, endMinute: null, label: `Về đến ${originLabel}` });
      }
      const lastStop = day.stops.at(-1);
      if (day.day < last) {
        items.push({ slotId: `d${day.day}-overnight`, kind: "OVERNIGHT", startMinute: lastStop?.departureMinute ?? null, endMinute: null, label: lastStop?.destination.area ? `Nghỉ đêm khu vực ${lastStop.destination.area}` : "Nghỉ đêm" });
      }
      return { day: day.day, date: day.date, items };
    }),
  };
}
