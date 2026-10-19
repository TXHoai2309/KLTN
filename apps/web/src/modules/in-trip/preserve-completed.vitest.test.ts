import { describe, expect, it } from "vitest";

import {
  createEditCandidate,
  moveVisit,
  removeVisit,
  replaceVisit,
  setVisitDuration,
  setVisitTime,
  type SavedTripForEdit,
} from "../trip-edit/edit-candidate";
import { preserveCompleted, ReplanCompletedVisitError } from "./preserve-completed";

const originalTrip: SavedTripForEdit = {
  startDate: "2026-10-17",
  durationDays: 2,
  transport: "CAR",
  days: [
    {
      dayIndex: 1,
      visits: [
        {
          id: "completed-1",
          destinationId: "destination-a",
          startMinute: 480,
          plannedDurationMinutes: 60,
          order: 1,
        },
        {
          id: "remaining-1",
          destinationId: "destination-b",
          startMinute: 900,
          plannedDurationMinutes: 60,
          order: 2,
        },
      ],
    },
    {
      dayIndex: 2,
      visits: [
        {
          id: "remaining-2",
          destinationId: "destination-c",
          startMinute: 600,
          plannedDurationMinutes: 90,
          order: 1,
        },
      ],
    },
  ],
};

function candidate() {
  return createEditCandidate(originalTrip);
}

describe("US36 Task289 preserve completed", () => {
  it("accepts changes limited to remaining visits and leaves the original trip untouched", () => {
    const originalSnapshot = structuredClone(originalTrip);
    const changedRemaining = setVisitTime(candidate(), "remaining-1", 960);

    expect(preserveCompleted(originalTrip, changedRemaining, ["completed-1"])).toBe(
      changedRemaining,
    );
    expect(originalTrip).toEqual(originalSnapshot);
  });

  it.each([
    ["time", () => setVisitTime(candidate(), "completed-1", 540)],
    ["duration", () => setVisitDuration(candidate(), "completed-1", 90)],
    ["destination", () => replaceVisit(candidate(), "completed-1", {
      destinationId: "destination-z",
      startMinute: 480,
      plannedDurationMinutes: 60,
    })],
    ["deletion", () => removeVisit(candidate(), "completed-1")],
    ["move to another day", () => moveVisit(candidate(), "completed-1", 2)],
    ["order shifted by insertion", () => moveVisit(candidate(), "remaining-1", 1, 1)],
  ])("rejects a completed visit whose %s changes", (_change, makeCandidate) => {
    expect(() => preserveCompleted(originalTrip, makeCandidate(), ["completed-1"])).toThrow(
      ReplanCompletedVisitError,
    );
    expect(() => preserveCompleted(originalTrip, makeCandidate(), ["completed-1"])).toThrow(
      expect.objectContaining({ code: "REPLAN_TOUCHED_COMPLETED" }),
    );
  });

  it("rejects completed IDs that are duplicated or do not belong to the original Trip", () => {
    expect(() =>
      preserveCompleted(originalTrip, candidate(), ["completed-1", "completed-1"]),
    ).toThrow(ReplanCompletedVisitError);
    expect(() => preserveCompleted(originalTrip, candidate(), ["forged-id"])).toThrow(
      ReplanCompletedVisitError,
    );
  });
});
