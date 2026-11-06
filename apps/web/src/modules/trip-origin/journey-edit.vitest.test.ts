import { describe, expect, it, vi } from "vitest";
import { assertJourneyBeforeDeparture } from "./journey-cutoff";
import { syntheticJourneyProposal } from "./journey-planning-fixtures";
import { COMPLETE_JOURNEY_FIXTURE } from "./trip-origin-fixtures";
import { journeyEditResponse } from "./journey-edit-http";
import type { JourneyEditDependencies } from "./journey-edit-service";

describe("journey cutoff/new edit HTTP", () => {
  const snapshot = { revision: "journey-save-v1", journey: COMPLETE_JOURNEY_FIXTURE, plan: syntheticJourneyProposal().journeyPlan };
  const trip = { startDate: new Date("2027-01-02T00:00:00Z"), manuallyCompletedAt: null, journeySnapshot: snapshot };
  it("allows before exact departure and rejects at/after, retaining Vietnam clock", () => {
    expect(() => assertJourneyBeforeDeparture(trip, new Date("2027-01-01T22:59:59Z"))).not.toThrow();
    for (const time of ["2027-01-01T23:00:00Z", "2027-01-02T00:00:00Z"]) expect(() => assertJourneyBeforeDeparture(trip, new Date(time))).toThrowError(expect.objectContaining({ code: "JOURNEY_CHANGE_CLOSED" }));
  });
  it("uses 00:00 Vietnam for legacy and blocks manual completion even before departure", () => {
    expect(() => assertJourneyBeforeDeparture({ ...trip, journeySnapshot: null }, new Date("2027-01-01T16:59:59Z"))).not.toThrow();
    expect(() => assertJourneyBeforeDeparture({ ...trip, journeySnapshot: null }, new Date("2027-01-01T17:00:00Z"))).toThrow();
    expect(() => assertJourneyBeforeDeparture({ ...trip, manuallyCompletedAt: new Date() }, new Date("2027-01-01T00:00:00Z"))).toThrow();
  });
  it("does not treat malformed persisted origin evidence as legacy", () => {
    expect(() => assertJourneyBeforeDeparture({ ...trip, journeySnapshot: {} }, new Date("2027-01-01"))).toThrowError(expect.objectContaining({ code: "TRIP_JOURNEY_DATA_UNAVAILABLE" }));
  });
  it.each(["PREVIEW", "APPLY"] as const)("authenticates before parsing malformed %s body", async mode => {
    const request = new Request("https://example.test/api/trips/id/journey/preview", { method: "POST", body: "{malformed" });
    const deps = { resolveSession: async () => null } as unknown as JourneyEditDependencies;
    const result = await journeyEditResponse(request, "id", mode, deps);
    expect(result.status).toBe(401); expect(request.bodyUsed).toBe(false); expect(result.headers.get("cache-control")).toBe("private, no-store");
  });
});
