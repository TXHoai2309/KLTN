import { weekdays } from "../destination/destination-contract";
import { isValidCalendarDate } from "../trip-requirement/trip-requirement-contract";

type Weekday = (typeof weekdays)[number];
export type VisitCheckStatus = "PASS" | "VIOLATION" | "INSUFFICIENT_DATA";
export type VisitCheckReason =
  | "WITHIN_OPENING_HOURS" | "OUTSIDE_OPENING_HOURS" | "CLOSED_ALL_DAY"
  | "OPENING_HOURS_MISSING" | "VISIT_TIME_INVALID"
  | "MINIMUM_DURATION_MET" | "BELOW_MINIMUM_DURATION"
  | "MINIMUM_DURATION_MISSING" | "VISIT_DURATION_INVALID";
export type VisitCheckResult = {
  status: VisitCheckStatus;
  affectedVisitId: string;
  reason: VisitCheckReason;
};

type OpeningInterval = { opensAtMinute: number; closesAtMinute: number };
type OpeningDay = {
  dayOfWeek: Weekday;
  status: "OPEN" | "CLOSED" | "UNKNOWN";
  intervals: readonly OpeningInterval[];
};
type TimedVisit = { visitId: string; localDate: string; startMinute: number; endMinute: number };
type DurationVisit = { visitId: string; plannedDurationMinutes: number };

function result(status: VisitCheckStatus, affectedVisitId: string, reason: VisitCheckReason): VisitCheckResult {
  return { status, affectedVisitId, reason };
}

const validInterval = ({ opensAtMinute, closesAtMinute }: OpeningInterval) =>
  Number.isSafeInteger(opensAtMinute) && Number.isSafeInteger(closesAtMinute)
  && opensAtMinute >= 0 && opensAtMinute < closesAtMinute && closesAtMinute <= 1440;

/** localDate is an Asia/Ho_Chi_Minh calendar date; minutes are from that local midnight. */
export function checkOpeningHours(visit: TimedVisit, openingDays: readonly OpeningDay[] | null | undefined): VisitCheckResult {
  const { visitId, localDate, startMinute, endMinute } = visit;
  if (!isValidCalendarDate(localDate) || !validInterval({ opensAtMinute: startMinute, closesAtMinute: endMinute })) {
    return result("INSUFFICIENT_DATA", visitId, "VISIT_TIME_INVALID");
  }

  // UTC is used only for the weekday of a local calendar date; no clock or timezone conversion is involved.
  const weekday = weekdays[(new Date(`${localDate}T00:00:00Z`).getUTCDay() + 6) % 7];
  const day = openingDays?.find(item => item.dayOfWeek === weekday);
  if (!day || day.status === "UNKNOWN" || (day.status === "OPEN" && (!day.intervals.length || !day.intervals.every(validInterval)))) {
    return result("INSUFFICIENT_DATA", visitId, "OPENING_HOURS_MISSING");
  }
  if (day.status === "CLOSED") return result("VIOLATION", visitId, "CLOSED_ALL_DAY");
  return day.intervals.some(interval => startMinute >= interval.opensAtMinute && endMinute <= interval.closesAtMinute)
    ? result("PASS", visitId, "WITHIN_OPENING_HOURS")
    : result("VIOLATION", visitId, "OUTSIDE_OPENING_HOURS");
}

export function checkMinimumVisitDuration(
  visit: DurationVisit,
  destination: { minimumDurationMinutes: number | null | undefined },
): VisitCheckResult {
  const { visitId, plannedDurationMinutes } = visit;
  if (!Number.isSafeInteger(plannedDurationMinutes) || plannedDurationMinutes < 1) {
    return result("INSUFFICIENT_DATA", visitId, "VISIT_DURATION_INVALID");
  }
  const minimum = destination.minimumDurationMinutes;
  if (minimum == null || !Number.isSafeInteger(minimum) || minimum < 1) {
    return result("INSUFFICIENT_DATA", visitId, "MINIMUM_DURATION_MISSING");
  }
  return plannedDurationMinutes >= minimum
    ? result("PASS", visitId, "MINIMUM_DURATION_MET")
    : result("VIOLATION", visitId, "BELOW_MINIMUM_DURATION");
}
