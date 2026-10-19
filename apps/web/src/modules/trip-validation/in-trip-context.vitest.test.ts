import { describe, expect, it } from "vitest";

import { validateInTripContext, validateItinerary, type InTripValidationContext } from "./trip-validation";

const now = new Date("2026-10-18T03:00:00.000Z"); // 10:00 in Vietnam
const base = () => validateItinerary([], [], now);
const context = (override: Partial<InTripValidationContext> = {}): InTripValidationContext => ({
  now,
  originLeg: {
    toVisitId: "remaining-1",
    localDate: "2026-10-18",
    startMinute: 660,
    route: { kind: "ok", durationSeconds: 1_800 },
  },
  mandatoryEndpoint: null,
  ...override,
});

describe("US-37 Task 293 in-trip Validator extension", () => {
  it("retains the four shared groups and leaves ordinary validation unchanged", () => {
    const ordinary = base();
    const result = validateInTripContext(ordinary, context());
    expect(Object.keys(result.groups)).toEqual([
      "openingHours", "minimumDuration", "travelTime", "scheduleConflict",
    ]);
    expect(result.canConfirm).toBe(true);
    expect(ordinary).toEqual(base());
  });

  it("rejects an origin leg that cannot arrive at the first remaining visit", () => {
    const result = validateInTripContext(base(), context({
      originLeg: {
        toVisitId: "remaining-1", localDate: "2026-10-18", startMinute: 660,
        route: { kind: "ok", durationSeconds: 3_601 },
      },
    }));
    expect(result.groups.travelTime.status).toBe("VIOLATION");
    expect(result.groups.travelTime.findings).toContainEqual(expect.objectContaining({
      reasonCode: "ORIGIN_TRAVEL_TIME_SHORT", affectedVisitId: "remaining-1",
    }));
    expect(result.canConfirm).toBe(false);
  });

  it("keeps an unavailable origin route as INSUFFICIENT_DATA", () => {
    const result = validateInTripContext(base(), context({
      originLeg: {
        toVisitId: "remaining-1", localDate: "2026-10-18", startMinute: 660,
        route: { kind: "unavailable" },
      },
    }));
    expect(result.groups.travelTime.status).toBe("INSUFFICIENT_DATA");
    expect(result.groups.travelTime.findings[0]?.reasonCode).toBe("ORIGIN_ROUTE_UNAVAILABLE");
    expect(result.canConfirm).toBe(false);
  });

  it("checks the mandatory endpoint against today's server time and deadline", () => {
    const endpoint = { visitId: "last", localDate: "2026-10-18", startMinute: 690, deadline: "12:00" };
    expect(validateInTripContext(base(), context({ mandatoryEndpoint: endpoint })).canConfirm).toBe(true);

    const late = validateInTripContext(base(), context({
      mandatoryEndpoint: { ...endpoint, startMinute: 721 },
    }));
    expect(late.groups.travelTime.findings.at(-1)?.reasonCode).toBe("ENDPOINT_DEADLINE_MISSED");
    expect(late.canConfirm).toBe(false);

    const expired = validateInTripContext(base(), context({
      now: new Date("2026-10-18T05:00:00.000Z"), mandatoryEndpoint: endpoint,
    }));
    expect(expired.groups.travelTime.status).toBe("VIOLATION");
    expect(expired.canConfirm).toBe(false);
  });

  it("does not clear a failure already found by the shared Validator", () => {
    const ordinary = base();
    ordinary.groups.minimumDuration = {
      status: "INSUFFICIENT_DATA",
      findings: [{
        group: "minimumDuration", status: "INSUFFICIENT_DATA",
        reasonCode: "MINIMUM_DURATION_MISSING", message: "Thiếu dữ liệu.",
      }],
    };
    ordinary.canConfirm = false;
    const result = validateInTripContext(ordinary, context());
    expect(result.groups.minimumDuration.status).toBe("INSUFFICIENT_DATA");
    expect(result.canConfirm).toBe(false);

    const opaqueFailure = base();
    opaqueFailure.canConfirm = false;
    expect(validateInTripContext(opaqueFailure, context()).canConfirm).toBe(false);
  });
});
