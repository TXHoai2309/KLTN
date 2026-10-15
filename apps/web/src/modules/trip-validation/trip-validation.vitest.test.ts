import { describe, expect, it } from "vitest";

import { tripProposalSchema } from "./trip-proposal-contract";
import { aggregateStatus, validateItinerary, type ValidationVisit } from "./trip-validation";

const reference = new Date("2026-10-15T00:00:00.000Z");
const openingDays = [{ dayOfWeek: "TUESDAY" as const, status: "OPEN" as const, intervals: [{ opensAtMinute: 0, closesAtMinute: 1440 }] }];
const visit = (id: string, startMinute: number, order: number): ValidationVisit => ({
  visitId: id, dayIndex: 1, order, localDate: "2026-10-20", startMinute,
  plannedDurationMinutes: 60, minimumDurationMinutes: 30, openingDays,
});
const route = (seconds: number) => [{ fromVisitId: "a", toVisitId: "b", route: { kind: "ok" as const, durationSeconds: seconds } }];

describe("US-29C structural boundary", () => {
  const proposal = { startDate: "2026-10-20", durationDays: 1, transport: "CAR", days: [{ dayIndex: 1, visits: [{ destinationId: "a", startMinute: 480, plannedDurationMinutes: 60, order: 1 }] }] };
  it.each([
    { ...proposal, days: [{ dayIndex: 1, visits: [{ destinationId: "a", plannedDurationMinutes: 60, order: 1 }] }] },
    { ...proposal, days: [{ dayIndex: 1, visits: [{ destinationId: "a", startMinute: 480, order: 1 }] }] },
    { ...proposal, days: [{ dayIndex: 1, visits: [{ startMinute: 480, plannedDurationMinutes: 60, order: 1 }] }] },
    { ...proposal, days: [{ dayIndex: 1, visits: [{ destinationId: "a", startMinute: 480, plannedDurationMinutes: 60 }] }] },
    { ...proposal, days: [{ dayIndex: 2, visits: proposal.days[0].visits }] },
  ])("rejects a missing/invalid required visit field before aggregation", input => {
    expect(tripProposalSchema.safeParse(input).success).toBe(false);
  });
  it("bounds total visits before route requests can fan out", () => {
    const day = (dayIndex: number, count: number) => ({ dayIndex, visits: Array.from({ length: count }, (_, index) => ({ destinationId: "a", startMinute: 0, plannedDurationMinutes: 1, order: index + 1 })) });
    expect(tripProposalSchema.safeParse({ ...proposal, durationDays: 2, days: [day(1, 26), day(2, 25)] }).success).toBe(false);
  });
});

describe("US-29C exactly four deterministic groups", () => {
  it("marks overlapping half-open visits as a conflict with both IDs", () => {
    const result = validateItinerary([visit("b", 539, 2), visit("a", 480, 1)], route(0), reference);
    expect(result.groups.scheduleConflict.status).toBe("VIOLATION");
    expect(result.groups.scheduleConflict.findings[0]).toMatchObject({ reasonCode: "VISITS_OVERLAP", visitIds: ["a", "b"] });
  });
  it("does not call a touching boundary a conflict, while travel remains independent", () => {
    const result = validateItinerary([visit("a", 480, 1), visit("b", 540, 2)], route(60), reference);
    expect(result.groups.scheduleConflict.status).toBe("SATISFIED");
    expect(result.groups.travelTime.status).toBe("VIOLATION");
    expect(result.groups.travelTime.findings[0]).toMatchObject({ fromVisitId: "a", toVisitId: "b", reasonCode: "TRAVEL_TIME_SHORT" });
  });
  it("treats a group with no visits as satisfied", () => {
    expect(validateItinerary([], [], reference).groups.scheduleConflict.status).toBe("SATISFIED");
  });
  it("uses violation before insufficient, then satisfied", () => {
    expect(aggregateStatus(["PASS", "INSUFFICIENT_DATA", "VIOLATION"])).toBe("VIOLATION");
    expect(aggregateStatus(["PASS", "INSUFFICIENT_DATA"])).toBe("INSUFFICIENT_DATA");
    expect(aggregateStatus(["PASS", "PASS"])).toBe("SATISFIED");
    expect(aggregateStatus([])).toBe("SATISFIED");
  });
  it("allows confirmation only when all four groups satisfy", () => {
    const result = validateItinerary([visit("a", 480, 1)], [], reference);
    expect(Object.keys(result.groups)).toEqual(["openingHours", "minimumDuration", "travelTime", "scheduleConflict"]);
    expect(Object.values(result.groups).map(group => group.status)).toEqual(["SATISFIED", "SATISFIED", "SATISFIED", "SATISFIED"]);
    expect(result.canConfirm).toBe(true);
  });
  it("blocks confirmation on one violation", () => {
    const result = validateItinerary([{ ...visit("a", 480, 1), minimumDurationMinutes: 90 }], [], reference);
    expect(result.groups.minimumDuration.status).toBe("VIOLATION");
    expect(result.groups.minimumDuration.findings[0].affectedVisitId).toBe("a");
    expect(result.canConfirm).toBe(false);
  });
  it("blocks confirmation on one missing business datum", () => {
    const result = validateItinerary([{ ...visit("a", 480, 1), openingDays: null }], [], reference);
    expect(result.groups.openingHours.status).toBe("INSUFFICIENT_DATA");
    expect(result.groups.openingHours.findings[0].reasonCode).toBe("OPENING_HOURS_MISSING");
    expect(result.canConfirm).toBe(false);
  });
  it("reports an unavailable route as insufficient without exposing provider errors", () => {
    const result = validateItinerary([visit("a", 480, 1), visit("b", 600, 2)], [], reference);
    expect(result.groups.travelTime.status).toBe("INSUFFICIENT_DATA");
    expect(result.groups.travelTime.findings[0]).toMatchObject({ fromVisitId: "a", toVisitId: "b", reasonCode: "ROUTE_UNAVAILABLE" });
    expect(result.canConfirm).toBe(false);
  });
  it("produces deep-equal output from the same input, data, route and reference time", () => {
    const visits = [visit("b", 600, 2), visit("a", 480, 1)];
    expect(validateItinerary(visits, route(900), reference)).toEqual(validateItinerary(visits, route(900), reference));
  });
});
