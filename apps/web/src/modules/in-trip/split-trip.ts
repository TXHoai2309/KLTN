import { isValidCalendarDate } from "../trip-requirement/trip-requirement-contract";
import {
  VIETNAM_TIME_ZONE,
  vietnamDateOf,
} from "../trip-requirement/trip-requirement-readiness";

export type SplitTripVisitInput = {
  id: string;
  destinationId: string;
  startMinute: number;
  plannedDurationMinutes: number;
  order: number;
};

export type SplitTripDayInput = {
  dayIndex: number;
  localDate: string | Date;
  visits: readonly SplitTripVisitInput[];
};

export type SplitTripInput = {
  startDate: string | Date;
  durationDays: number;
  days: readonly SplitTripDayInput[];
};

export type SplitTripVisit = {
  visitId: string;
  destinationId: string;
  dayIndex: number;
  localDate: string;
  startMinute: number;
  plannedDurationMinutes: number;
  order: number;
};

export type SplitTripStatus = "HAS_REMAINING" | "ALL_COMPLETED";

export type SplitTripResult = {
  completed: SplitTripVisit[];
  remaining: SplitTripVisit[];
  status: SplitTripStatus;
  remainingMinutesToday: number | null;
};

type LocalClock = {
  secondsSinceMidnight: number;
  wholeMinutesUntilMidnight: number;
};

function dateOnly(value: string | Date, field: string): string {
  const date =
    value instanceof Date
      ? Number.isNaN(value.getTime())
        ? ""
        : value.toISOString().slice(0, 10)
      : value;
  if (!isValidCalendarDate(date)) {
    throw new RangeError(field + " must be a valid calendar date");
  }
  return date;
}

function endDateOfTrip(startDate: string, durationDays: number): string {
  if (!Number.isSafeInteger(durationDays) || durationDays < 1) {
    throw new RangeError("durationDays must be a positive integer");
  }

  const [year, month, day] = startDate.split("-").map(Number);
  const end = new Date(Date.UTC(year!, month! - 1, day! + durationDays - 1));
  const endDate = end.toISOString().slice(0, 10);
  if (!isValidCalendarDate(endDate)) {
    throw new RangeError("Trip end date is outside the supported calendar range");
  }
  return endDate;
}

function localClockOf(now: Date): LocalClock {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: VIETNAM_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const hour = Number(values.hour);
  const minute = Number(values.minute);
  const second = Number(values.second);
  const milliseconds = now.getUTCMilliseconds();
  const elapsedMilliseconds =
    ((hour * 60 + minute) * 60 + second) * 1000 + milliseconds;

  return {
    secondsSinceMidnight: elapsedMilliseconds / 1000,
    wholeMinutesUntilMidnight: Math.floor(
      (24 * 60 * 60 * 1000 - elapsedMilliseconds) / 60_000,
    ),
  };
}

function orderedVisits(trip: SplitTripInput): SplitTripVisit[] {
  return trip.days
    .map((day, dayPosition) => ({
      day,
      dayPosition,
      localDate: dateOnly(day.localDate, "day.localDate"),
    }))
    .sort(
      (left, right) =>
        left.day.dayIndex - right.day.dayIndex ||
        left.dayPosition - right.dayPosition,
    )
    .flatMap(({ day, localDate }) =>
      day.visits
        .map((visit, visitPosition) => ({ visit, visitPosition }))
        .sort(
          (left, right) =>
            left.visit.order - right.visit.order ||
            left.visitPosition - right.visitPosition,
        )
        .map(({ visit }) => ({
          visitId: visit.id,
          destinationId: visit.destinationId,
          dayIndex: day.dayIndex,
          localDate,
          startMinute: visit.startMinute,
          plannedDurationMinutes: visit.plannedDurationMinutes,
          order: visit.order,
        })),
    );
}

function hasEndedByNow(visit: SplitTripVisit, today: string, localSeconds: number): boolean {
  if (visit.localDate < today) return true;
  if (visit.localDate > today) return false;

  const { startMinute, plannedDurationMinutes } = visit;
  if (
    !Number.isSafeInteger(startMinute) ||
    !Number.isSafeInteger(plannedDurationMinutes) ||
    startMinute < 0 ||
    startMinute > 1439 ||
    plannedDurationMinutes < 1 ||
    plannedDurationMinutes > 1440 ||
    startMinute + plannedDurationMinutes > 1440
  ) {
    // Incomplete or invalid schedule data must not remove a visit from the remaining plan.
    return false;
  }

  const endSeconds = (startMinute + plannedDurationMinutes) * 60;
  return endSeconds <= localSeconds;
}

/**
 * Splits persisted itinerary visits using their scheduled end time in Vietnam.
 * A visit is complete at its exact scheduled end boundary; an in-progress visit
 * remains in the proposal scope until that boundary.
 */
export function splitCompletedRemaining(trip: SplitTripInput, now: Date): SplitTripResult {
  const today = vietnamDateOf(now);
  const startDate = dateOnly(trip.startDate, "trip.startDate");
  const tripEndDate = endDateOfTrip(startDate, trip.durationDays);
  const visits = orderedVisits(trip);
  const localClock = localClockOf(now);

  if (today < startDate) {
    return {
      completed: [],
      remaining: visits,
      status: visits.length === 0 ? "ALL_COMPLETED" : "HAS_REMAINING",
      remainingMinutesToday: null,
    };
  }

  if (today > tripEndDate) {
    return {
      completed: visits,
      remaining: [],
      status: "ALL_COMPLETED",
      remainingMinutesToday: null,
    };
  }

  const completed: SplitTripVisit[] = [];
  const remaining: SplitTripVisit[] = [];
  for (const visit of visits) {
    if (hasEndedByNow(visit, today, localClock.secondsSinceMidnight)) {
      completed.push(visit);
    } else {
      remaining.push(visit);
    }
  }

  const hasTodayInTrip = trip.days.some(
    (day) => dateOnly(day.localDate, "day.localDate") === today,
  );

  return {
    completed,
    remaining,
    status: remaining.length === 0 ? "ALL_COMPLETED" : "HAS_REMAINING",
    // This is calendar time until 00:00 HCMC, not a Validator or routing estimate.
    remainingMinutesToday: hasTodayInTrip
      ? localClock.wholeMinutesUntilMidnight
      : null,
  };
}
