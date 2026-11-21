import { createHash } from "node:crypto";

import { minuteToTimeString } from "../trip-origin/journey-time-utils";
import { EXTERNAL_PLACE_LABEL } from "../trip-planner/planner-contract";
import { isValidCalendarDate } from "../trip-requirement/trip-requirement-contract";
import { tripDayDate } from "../trip-validation/trip-proposal-contract";
import type { TripDetail } from "./trip-read-service";

type ReadVisit = TripDetail["days"][number]["visits"][number];
type CalendarVisit = Pick<ReadVisit, "order" | "destination"> & {
  startMinute?: number | null;
  plannedDurationMinutes?: number | null;
};
type CalendarTrip = Pick<TripDetail, "id" | "startDate" | "unchecked"> & {
  days: { dayIndex: number; visits: CalendarVisit[] }[];
};

const CRLF = "\r\n";
const MINUTES_PER_DAY = 1440;
const VIETNAM_UTC_OFFSET_MINUTES = 7 * 60;

function escapeText(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,");
}

function foldLine(line: string): string {
  let folded = "";
  let bytes = 0;
  for (const character of line) {
    const width = Buffer.byteLength(character, "utf8");
    if (bytes + width > 75) {
      folded += CRLF + " ";
      bytes = 1;
    }
    folded += character;
    bytes += width;
  }
  return folded;
}

function utcTimestamp(date: Date): string {
  return date.toISOString().slice(0, 19).replace(/[-:]/g, "") + "Z";
}

function visitTime(midnight: number, minute: number): string {
  // Saved clock times use Asia/Ho_Chi_Minh (UTC+07:00, no DST).
  return utcTimestamp(new Date(midnight + (minute - VIETNAM_UTC_OFFSET_MINUTES) * 60_000));
}

function eventUid(tripId: string, day: string, order: number): string {
  const key = createHash("sha256").update(JSON.stringify([tripId, day, order])).digest("hex");
  return key + "@calendar.kltn";
}

/** Serializes the caller's authorized saved-trip view. An empty ICS string means there are no timed stops. */
export function generateTripCalendar(trip: CalendarTrip, generatedAt: Date): { ics: string; skippedStops: number } {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//KLTN//Saved Itinerary//VI", "CALSCALE:GREGORIAN"];
  const stamp = utcTimestamp(generatedAt);
  const validStart = isValidCalendarDate(trip.startDate);
  let eventCount = 0;
  let skippedStops = 0;

  for (const day of trip.days) {
    const localDate = validStart ? tripDayDate(trip.startDate, day.dayIndex) : null;
    for (const visit of day.visits) {
      const { startMinute, plannedDurationMinutes, destination } = visit;
      if (!localDate || startMinute == null || plannedDurationMinutes == null ||
        !Number.isInteger(startMinute) || startMinute < 0 || startMinute >= MINUTES_PER_DAY ||
        !Number.isInteger(plannedDurationMinutes) || plannedDurationMinutes <= 0 ||
        startMinute + plannedDurationMinutes > MINUTES_PER_DAY) {
        skippedStops++;
        continue;
      }

      const midnight = Date.parse(localDate + "T00:00:00Z");
      const endMinute = startMinute + plannedDurationMinutes;
      const endLabel = endMinute === MINUTES_PER_DAY ? "00:00 (ngày hôm sau)" : minuteToTimeString(endMinute);
      const description = ["Giờ dự kiến (giờ Việt Nam): " + minuteToTimeString(startMinute) + " – " + endLabel + "."];
      if (destination.external) description.push("Địa điểm " + EXTERNAL_PLACE_LABEL + ".");
      if (trip.unchecked?.items.length) description.push("Chuyến đi có mục chưa kiểm.");
      const publicLocation = destination.visibility === "VISIBLE" && destination.availability === "AVAILABLE";
      const location = publicLocation
        ? [destination.name, destination.address].filter(Boolean).join(", ")
        : "Điểm đến không còn khả dụng công khai";

      lines.push(
        "BEGIN:VEVENT",
        "UID:" + eventUid(trip.id, localDate, visit.order),
        "DTSTAMP:" + stamp,
        "DTSTART:" + visitTime(midnight, startMinute),
        "DTEND:" + visitTime(midnight, endMinute),
        "SUMMARY:" + escapeText(destination.name),
        "LOCATION:" + escapeText(location),
        "DESCRIPTION:" + escapeText(description.join("\n")),
        "END:VEVENT",
      );
      eventCount++;
    }
  }

  if (!eventCount) return { ics: "", skippedStops };
  lines.push("END:VCALENDAR");
  return { ics: lines.map(foldLine).join(CRLF) + CRLF, skippedStops };
}
