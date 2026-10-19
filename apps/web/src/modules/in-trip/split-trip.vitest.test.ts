import { describe, expect, it } from "vitest";

import {
  splitCompletedRemaining,
  type SplitTripDayInput,
  type SplitTripInput,
  type SplitTripVisitInput,
} from "./split-trip";

function visit(
  id: string,
  startMinute: number,
  plannedDurationMinutes: number,
  order = 1,
): SplitTripVisitInput {
  return {
    id,
    destinationId: "destination-" + id,
    startMinute,
    plannedDurationMinutes,
    order,
  };
}

function day(
  dayIndex: number,
  localDate: string,
  visits: readonly SplitTripVisitInput[],
): SplitTripDayInput {
  return { dayIndex, localDate, visits };
}

function trip(
  startDate: string,
  durationDays: number,
  days: readonly SplitTripDayInput[],
): SplitTripInput {
  return { startDate, durationDays, days };
}

describe("US36 Task286 completion split", () => {
  it("keeps every visit remaining before the trip start date", () => {
    const input = trip("2026-10-20", 1, [
      day(1, "2026-10-20", [visit("first", 480, 60)]),
    ]);

    const result = splitCompletedRemaining(input, new Date("2026-10-19T16:59:59.999Z"));

    expect(result).toMatchObject({
      completed: [],
      remaining: [{ visitId: "first", dayIndex: 1, order: 1 }],
      status: "HAS_REMAINING",
      remainingMinutesToday: null,
    });
  });

  it("marks every visit complete after the trip end date and returns ALL_COMPLETED", () => {
    const input = trip("2026-10-20", 1, [
      day(1, "2026-10-20", [visit("last", 1380, 60)]),
    ]);

    const result = splitCompletedRemaining(input, new Date("2026-10-21T00:00:00.000Z"));

    expect(result).toMatchObject({
      completed: [{ visitId: "last", dayIndex: 1, order: 1 }],
      remaining: [],
      status: "ALL_COMPLETED",
      remainingMinutesToday: null,
    });
  });

  it("uses the inclusive scheduled-end boundary and leaves an in-progress visit remaining", () => {
    const input = trip("2026-10-20", 1, [
      day(1, "2026-10-20", [
        visit("ended-at-boundary", 600, 90, 1),
        visit("still-running", 660, 60, 2),
      ]),
    ]);

    const atBoundary = splitCompletedRemaining(input, new Date("2026-10-20T04:30:00.000Z"));
    const justBefore = splitCompletedRemaining(input, new Date("2026-10-20T04:29:59.999Z"));

    expect(atBoundary.completed.map(item => item.visitId)).toEqual(["ended-at-boundary"]);
    expect(atBoundary.remaining.map(item => item.visitId)).toEqual(["still-running"]);
    expect(justBefore.completed).toEqual([]);
    expect(justBefore.remaining.map(item => item.visitId)).toEqual([
      "ended-at-boundary",
      "still-running",
    ]);
  });

  it("uses each actual itinerary day in a multi-day trip and preserves day/order identity", () => {
    const input = trip("2026-10-20", 3, [
      day(3, "2026-10-22", [visit("day-3-b", 600, 30, 2), visit("day-3-a", 480, 30, 1)]),
      day(1, "2026-10-20", [visit("day-1", 1200, 30)]),
      day(2, "2026-10-21", [
        visit("day-2-later", 720, 30, 2),
        visit("day-2-earlier", 480, 30, 1),
      ]),
    ]);

    const result = splitCompletedRemaining(input, new Date("2026-10-21T04:00:00.000Z"));

    expect(result.completed.map(item => [item.visitId, item.dayIndex, item.order])).toEqual([
      ["day-1", 1, 1],
      ["day-2-earlier", 2, 1],
    ]);
    expect(result.remaining.map(item => [item.visitId, item.dayIndex, item.order])).toEqual([
      ["day-2-later", 2, 2],
      ["day-3-a", 3, 1],
      ["day-3-b", 3, 2],
    ]);
    expect(result.status).toBe("HAS_REMAINING");
  });

  it("splits a one-day itinerary by visit end times", () => {
    const input = trip("2026-10-20", 1, [
      day(1, "2026-10-20", [visit("morning", 480, 60), visit("afternoon", 900, 60, 2)]),
    ]);

    const result = splitCompletedRemaining(input, new Date("2026-10-20T06:00:00.000Z"));

    expect(result.completed.map(item => item.visitId)).toEqual(["morning"]);
    expect(result.remaining.map(item => item.visitId)).toEqual(["afternoon"]);
  });

  it("compares UTC instants using the HCMC date when UTC is near midnight", () => {
    const input = trip("2026-10-20", 2, [
      day(1, "2026-10-20", [visit("yesterday", 1410, 30)]),
      day(2, "2026-10-21", [visit("after-midnight", 0, 30)]),
    ]);

    // 17:00 UTC on Oct 20 is 00:00 in Ho Chi Minh City on Oct 21.
    const result = splitCompletedRemaining(input, new Date("2026-10-20T17:00:00.000Z"));

    expect(result.completed.map(item => item.visitId)).toEqual(["yesterday"]);
    expect(result.remaining.map(item => item.visitId)).toEqual(["after-midnight"]);
    expect(result.remainingMinutesToday).toBe(1440);
  });

  it("handles visits in the same hour on opposite sides of now", () => {
    const input = trip("2026-10-20", 1, [
      day(1, "2026-10-20", [
        visit("earlier-in-hour", 720, 30, 1),
        visit("later-in-hour", 750, 30, 2),
      ]),
    ]);

    const result = splitCompletedRemaining(input, new Date("2026-10-20T05:45:00.000Z"));

    expect(result.completed.map(item => item.visitId)).toEqual(["earlier-in-hour"]);
    expect(result.remaining.map(item => item.visitId)).toEqual(["later-in-hour"]);
    expect(result.remainingMinutesToday).toBe(675);
  });

  it("returns null for remaining minutes when the current local date has no itinerary day", () => {
    const input = trip("2026-10-20", 2, [
      day(1, "2026-10-20", [visit("past", 480, 60)]),
      day(2, "2026-10-22", [visit("date-gap", 480, 60)]),
    ]);

    const result = splitCompletedRemaining(input, new Date("2026-10-21T04:00:00.000Z"));

    expect(result.remainingMinutesToday).toBeNull();
  });

  it("does not mutate the Trip or reorder its stored day and visit arrays", () => {
    const input = trip("2026-10-20", 2, [
      day(2, "2026-10-21", [visit("second", 720, 30, 2), visit("first", 480, 30, 1)]),
      day(1, "2026-10-20", [visit("prior", 480, 30)]),
    ]);
    const original = structuredClone(input);
    Object.freeze(input.days);
    input.days.forEach(item => {
      Object.freeze(item);
      Object.freeze(item.visits);
      item.visits.forEach(visit => Object.freeze(visit));
    });

    splitCompletedRemaining(input, new Date("2026-10-20T09:00:00.000Z"));

    expect(input).toEqual(original);
    expect(input.days.map(item => item.dayIndex)).toEqual([2, 1]);
    expect(input.days[0]!.visits.map(item => item.id)).toEqual(["second", "first"]);
  });

  it("returns ALL_COMPLETED when every scheduled visit has ended during the trip", () => {
    const input = trip("2026-10-20", 2, [
      day(1, "2026-10-20", [visit("done", 480, 30)]),
      day(2, "2026-10-21", []),
    ]);

    const result = splitCompletedRemaining(input, new Date("2026-10-20T02:00:00.000Z"));

    expect(result.completed.map(item => item.visitId)).toEqual(["done"]);
    expect(result.remaining).toEqual([]);
    expect(result.status).toBe("ALL_COMPLETED");
  });
});
