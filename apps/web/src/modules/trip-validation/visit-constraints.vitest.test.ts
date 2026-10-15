import { describe, expect, it } from "vitest";

import { checkMinimumVisitDuration, checkOpeningHours } from "./visit-constraints";

const visit = { visitId: "visit-1", localDate: "2026-10-14", startMinute: 540, endMinute: 600 };
const open = (intervals: { opensAtMinute: number; closesAtMinute: number }[]) => [
  { dayOfWeek: "WEDNESDAY" as const, status: "OPEN" as const, intervals },
];
const window = { opensAtMinute: 480, closesAtMinute: 720 };

describe("US-29A opening hours", () => {
  it("passes a visit wholly inside one window and returns the affected visit", () => {
    expect(checkOpeningHours(visit, open([window]))).toEqual({
      status: "PASS", affectedVisitId: "visit-1", reason: "WITHIN_OPENING_HOURS",
    });
  });
  it("passes when the visit starts exactly at opening", () => {
    expect(checkOpeningHours({ ...visit, startMinute: 480 }, open([window])).status).toBe("PASS");
  });
  it("passes when the visit ends exactly at closing", () => {
    expect(checkOpeningHours({ ...visit, endMinute: 720 }, open([window])).status).toBe("PASS");
  });
  it("passes the full window and supports the existing 24:00 closing convention", () => {
    expect(checkOpeningHours({ ...visit, startMinute: 480, endMinute: 720 }, open([window])).status).toBe("PASS");
    expect(checkOpeningHours({ ...visit, startMinute: 1380, endMinute: 1440 }, open([
      { opensAtMinute: 1380, closesAtMinute: 1440 },
    ])).status).toBe("PASS");
  });
  it("violates when the visit starts before opening", () => {
    expect(checkOpeningHours({ ...visit, startMinute: 479 }, open([window])).status).toBe("VIOLATION");
  });
  it("violates when the visit ends after closing", () => {
    expect(checkOpeningHours({ ...visit, endMinute: 721 }, open([window])).status).toBe("VIOLATION");
  });
  it("passes in the second of multiple windows", () => {
    expect(checkOpeningHours({ ...visit, startMinute: 840, endMinute: 900 }, open([
      { opensAtMinute: 480, closesAtMinute: 690 }, { opensAtMinute: 810, closesAtMinute: 1020 },
    ])).status).toBe("PASS");
  });
  it("does not merge windows across a closed midday gap", () => {
    expect(checkOpeningHours({ ...visit, startMinute: 690, endMinute: 840 }, open([
      { opensAtMinute: 480, closesAtMinute: 720 }, { opensAtMinute: 810, closesAtMinute: 1020 },
    ]))).toEqual({ status: "VIOLATION", affectedVisitId: "visit-1", reason: "OUTSIDE_OPENING_HOURS" });
  });
  it("treats explicit CLOSED as a violation, not missing data", () => {
    expect(checkOpeningHours(visit, [{ dayOfWeek: "WEDNESDAY", status: "CLOSED", intervals: [] }])).toEqual({
      status: "VIOLATION", affectedVisitId: "visit-1", reason: "CLOSED_ALL_DAY",
    });
  });
  it("treats absent and UNKNOWN hours as insufficient data", () => {
    for (const days of [null, [], [{ dayOfWeek: "WEDNESDAY" as const, status: "UNKNOWN" as const, intervals: [] }]]) {
      expect(checkOpeningHours(visit, days).status).toBe("INSUFFICIENT_DATA");
    }
  });
  it("uses the Vietnam-local calendar day instead of a machine-timezone weekday", () => {
    const thursday = { ...visit, localDate: "2026-10-15" };
    const days = [{ dayOfWeek: "THURSDAY" as const, status: "OPEN" as const, intervals: [window] }];
    expect(checkOpeningHours(thursday, days).status).toBe("PASS");
    expect(checkOpeningHours(thursday, open([window])).status).toBe("INSUFFICIENT_DATA");
  });
  it("never passes invalid or unavailable visit/open interval data", () => {
    expect(checkOpeningHours({ ...visit, localDate: "2026-02-30" }, open([window])).status).toBe("INSUFFICIENT_DATA");
    expect(checkOpeningHours({ ...visit, endMinute: 540 }, open([window])).status).toBe("INSUFFICIENT_DATA");
    expect(checkOpeningHours(visit, open([])).status).toBe("INSUFFICIENT_DATA");
    expect(checkOpeningHours(visit, open([{ opensAtMinute: 600, closesAtMinute: 480 }])).status).toBe("INSUFFICIENT_DATA");
  });
});

describe("US-29A minimum visit duration", () => {
  const planned = { visitId: "visit-1", plannedDurationMinutes: 90 };
  it("passes when planned duration exceeds the minimum", () => {
    expect(checkMinimumVisitDuration(planned, { minimumDurationMinutes: 60 })).toEqual({
      status: "PASS", affectedVisitId: "visit-1", reason: "MINIMUM_DURATION_MET",
    });
  });
  it("passes when planned duration equals the minimum", () => {
    expect(checkMinimumVisitDuration(planned, { minimumDurationMinutes: 90 }).status).toBe("PASS");
  });
  it("violates when planned duration is shorter than the minimum", () => {
    expect(checkMinimumVisitDuration(planned, { minimumDurationMinutes: 91 })).toEqual({
      status: "VIOLATION", affectedVisitId: "visit-1", reason: "BELOW_MINIMUM_DURATION",
    });
  });
  it("returns insufficient data when the minimum is missing", () => {
    expect(checkMinimumVisitDuration(planned, { minimumDurationMinutes: null }).status).toBe("INSUFFICIENT_DATA");
  });
  it("never substitutes suggested duration for missing minimum", () => {
    const destination = { minimumDurationMinutes: null, suggestedDurationMinutes: 120 };
    expect(checkMinimumVisitDuration({ ...planned, plannedDurationMinutes: 120 }, destination)).toEqual({
      status: "INSUFFICIENT_DATA", affectedVisitId: "visit-1", reason: "MINIMUM_DURATION_MISSING",
    });
  });
  it("never passes a missing or invalid planned duration", () => {
    expect(checkMinimumVisitDuration({ ...planned, plannedDurationMinutes: 0 }, { minimumDurationMinutes: 30 }).status).toBe("INSUFFICIENT_DATA");
    expect(checkMinimumVisitDuration({ ...planned, plannedDurationMinutes: Number.NaN }, { minimumDurationMinutes: 30 }).status).toBe("INSUFFICIENT_DATA");
  });
});
