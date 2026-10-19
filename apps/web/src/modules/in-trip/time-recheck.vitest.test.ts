import { describe, expect, it } from "vitest";

import type { EditCandidate, SavedTripForEdit } from "../trip-edit/edit-candidate";
import { validateItinerary, type TripValidation } from "../trip-validation/trip-validation";
import { recheckInTripTime, type TimeRecheckTrip } from "./time-recheck";

const trip: TimeRecheckTrip = {
  startDate: "2026-10-20",
  durationDays: 1,
  transport: "CAR",
  days: [{
    dayIndex: 1,
    localDate: "2026-10-20",
    visits: [{ id: "visit-1", destinationId: "destination-1", startMinute: 480, plannedDurationMinutes: 60, order: 1 }],
  }],
};
const candidate: EditCandidate = {
  startDate: "2026-10-20",
  durationDays: 1,
  transport: "CAR",
  days: [{
    dayIndex: 1,
    visits: [{ visitId: "visit-1", destinationId: "destination-1", startMinute: 480, plannedDurationMinutes: 60, order: 1 }],
  }],
};
const validation = (canConfirm = true): TripValidation => {
  const result = validateItinerary([], [], new Date("2026-10-20T00:00:00.000Z"));
  if (!canConfirm) {
    result.groups.travelTime.status = "INSUFFICIENT_DATA";
    result.groups.travelTime.findings = [{
      group: "travelTime", status: "INSUFFICIENT_DATA", reasonCode: "ROUTE_UNAVAILABLE", message: "Route unavailable.",
    }];
    result.canConfirm = false;
  }
  return result;
};

describe("US-37 Task 294 time recheck", () => {
  it("accepts a fresh all-PASS result and reports the server-derived completion set", () => {
    const result = recheckInTripTime({
      trip, candidate, now: new Date("2026-10-20T00:00:00.000Z"), validation: validation(),
    });
    expect(result).toMatchObject({ status: "READY", completedVisitIds: [], checkedAt: "2026-10-20T00:00:00.000Z" });
  });

  it("rejects a visit that became scheduled-complete after its prior preview and was edited", () => {
    const edited = structuredClone(candidate);
    edited.days[0]!.visits[0]!.startMinute = 500;
    const result = recheckInTripTime({
      trip, candidate: edited, now: new Date("2026-10-20T02:00:00.000Z"), validation: validation(),
    });
    expect(result).toMatchObject({ status: "REJECTED", code: "COMPLETED_VISIT_CHANGED", completedVisitIds: ["visit-1"] });
  });

  it("rejects ALL_COMPLETED and never treats validator timeout as confirmation", () => {
    const ended = recheckInTripTime({
      trip, candidate, now: new Date("2026-10-21T00:00:00.000Z"), validation: validation(),
    });
    expect(ended).toMatchObject({ status: "REJECTED", code: "ALL_COMPLETED" });

    const insufficient = recheckInTripTime({
      trip, candidate, now: new Date("2026-10-20T00:00:00.000Z"), validation: validation(false),
    });
    expect(insufficient).toMatchObject({ status: "REJECTED", code: "IN_TRIP_VALIDATION_CHANGED" });
    expect(insufficient.validation.canConfirm).toBe(false);
  });

  it("does not mutate the saved trip or candidate", () => {
    const originalTrip: SavedTripForEdit = structuredClone(trip);
    const originalCandidate = structuredClone(candidate);
    recheckInTripTime({
      trip, candidate, now: new Date("2026-10-20T00:00:00.000Z"), validation: validation(),
    });
    expect(trip).toEqual(originalTrip);
    expect(candidate).toEqual(originalCandidate);
  });
});
