import { describe, expect, it } from "vitest";

import {
  addVisitToEditSession,
  createEditSession,
  moveVisitDownInEditSession,
  moveVisitToDayInEditSession,
  moveVisitUpInEditSession,
  removeVisitFromEditSession,
  setVisitDurationInEditSession,
  setVisitTimeInEditSession,
} from "./edit-session";
import type { EditCandidate } from "./edit-candidate";

const savedCandidate: EditCandidate = {
  startDate: "2026-11-10",
  durationDays: 2,
  transport: "CAR",
  days: [
    {
      dayIndex: 1,
      visits: [
        { visitId: "visit-a", destinationId: "destination-a", startMinute: 480, plannedDurationMinutes: 60, order: 1 },
        { visitId: "visit-b", destinationId: "destination-b", startMinute: 600, plannedDurationMinutes: 90, order: 2 },
      ],
    },
    {
      dayIndex: 2,
      visits: [
        { visitId: "visit-c", destinationId: "destination-c", startMinute: 540, plannedDurationMinutes: 60, order: 1 },
      ],
    },
  ],
};

describe("edit session", () => {
  it("adds a visit through the candidate operation and preserves the source", () => {
    const before = structuredClone(savedCandidate);
    const session = createEditSession(savedCandidate);

    const next = addVisitToEditSession(session, 1, {
      visitId: "visit-new",
      destinationId: "destination-new",
      startMinute: 720,
      plannedDurationMinutes: 45,
    }, 2);

    expect(next.candidate.days[0]!.visits.map((visit) => [visit.visitId, visit.order])).toEqual([
      ["visit-a", 1],
      ["visit-new", 2],
      ["visit-b", 3],
    ]);
    expect(savedCandidate).toEqual(before);
    expect(session.candidate.days[0]!.visits).toHaveLength(2);
  });

  it("removes a visit and renumbers the remaining visits", () => {
    const session = createEditSession(savedCandidate);

    const next = removeVisitFromEditSession(session, "visit-a");

    expect(next.candidate.days[0]!.visits).toEqual([
      { visitId: "visit-b", destinationId: "destination-b", startMinute: 600, plannedDurationMinutes: 90, order: 1 },
    ]);
    expect(session.candidate.days[0]!.visits).toHaveLength(2);
  });

  it("allows removing every visit from a day without removing the day", () => {
    const session = createEditSession(savedCandidate);
    const afterFirst = removeVisitFromEditSession(session, "visit-a");
    const afterSecond = removeVisitFromEditSession(afterFirst, "visit-b");

    expect(afterSecond.candidate.days[0]).toEqual({ dayIndex: 1, visits: [] });
    expect(afterSecond.candidate.days).toHaveLength(2);
    expect(session.candidate.days[0]!.visits).toHaveLength(2);
  });

  it("allows a second visit to the same destination with a distinct visit ID", () => {
    const session = createEditSession(savedCandidate);

    const next = addVisitToEditSession(session, 2, {
      visitId: "visit-c-again",
      destinationId: "destination-c",
      startMinute: 660,
      plannedDurationMinutes: 45,
    });

    expect(next.candidate.days[1]!.visits.map((visit) => visit.destinationId)).toEqual([
      "destination-c",
      "destination-c",
    ]);
    expect(next.candidate.days[1]!.visits.map((visit) => visit.visitId)).toEqual([
      "visit-c",
      "visit-c-again",
    ]);
    expect(session.candidate.days[1]!.visits).toHaveLength(1);
  });

  it("moves visits up and down using the existing order operation", () => {
    const session = createEditSession(savedCandidate);

    const movedUp = moveVisitUpInEditSession(session, "visit-b");
    expect(movedUp.candidate.days[0]!.visits.map((visit) => [visit.visitId, visit.order])).toEqual([
      ["visit-b", 1],
      ["visit-a", 2],
    ]);

    const movedDown = moveVisitDownInEditSession(movedUp, "visit-b");
    expect(movedDown.candidate.days[0]!.visits.map((visit) => [visit.visitId, visit.order])).toEqual([
      ["visit-a", 1],
      ["visit-b", 2],
    ]);
    expect(session.candidate.days[0]!.visits.map((visit) => visit.visitId)).toEqual(["visit-a", "visit-b"]);
  });

  it("moves a visit to another day and recalculates order in both days", () => {
    const session = createEditSession(savedCandidate);

    const next = moveVisitToDayInEditSession(session, "visit-a", 2);

    expect(next.candidate.days[0]!.visits).toEqual([
      { visitId: "visit-b", destinationId: "destination-b", startMinute: 600, plannedDurationMinutes: 90, order: 1 },
    ]);
    expect(next.candidate.days[1]!.visits.map((visit) => [visit.visitId, visit.order])).toEqual([
      ["visit-c", 1],
      ["visit-a", 2],
    ]);
    expect(session.candidate.days[0]!.visits).toHaveLength(2);
  });

  it("updates the start time from a valid HH:mm value", () => {
    const session = createEditSession(savedCandidate);

    const next = setVisitTimeInEditSession(session, "visit-a", "10:35");

    expect(next.candidate.days[0]!.visits[0]!.startMinute).toBe(635);
    expect(session.candidate.days[0]!.visits[0]!.startMinute).toBe(480);
  });

  it("updates duration from a positive whole number of minutes", () => {
    const session = createEditSession(savedCandidate);

    const next = setVisitDurationInEditSession(session, "visit-a", "45");

    expect(next.candidate.days[0]!.visits[0]!.plannedDurationMinutes).toBe(45);
    expect(session.candidate.days[0]!.visits[0]!.plannedDurationMinutes).toBe(60);
  });

  it.each(["", "0", "-5", "30.5", "abc"]) (
    "rejects invalid duration input %j",
    (duration) => {
      const session = createEditSession(savedCandidate);
      expect(() => setVisitDurationInEditSession(session, "visit-a", duration))
        .toThrow("Thời lượng phải là số phút nguyên lớn hơn 0.");
      expect(session.candidate.days[0]!.visits[0]!.plannedDurationMinutes).toBe(60);
    },
  );

  it("rejects a time that is not a valid 24-hour HH:mm value", () => {
    const session = createEditSession(savedCandidate);

    expect(() => setVisitTimeInEditSession(session, "visit-a", "24:00"))
      .toThrow("Giờ bắt đầu phải theo định dạng HH:mm.");
    expect(session.candidate.days[0]!.visits[0]!.startMinute).toBe(480);
  });
});
