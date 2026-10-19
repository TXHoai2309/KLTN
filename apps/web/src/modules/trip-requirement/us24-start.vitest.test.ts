import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthorizationDependencies } from "@/server/authorization/guard";
import type { TripRequirementDependencies } from "./trip-requirement-server";
import {
  tripRequirementInputSchema,
  type TripRequirementInput,
} from "./trip-requirement-contract";
import {
  assertStartDateForFinalConfirmation,
  evaluateTripRequirement,
} from "./trip-requirement-readiness";
import { describeReadiness } from "@/app/trips/new/trip-readiness-status";

const baseInput = {
  startDate: "2026-10-10",
  durationDays: 3,
  transport: "CAR" as const,
};

function requirement(overrides: Partial<TripRequirementInput> = {}): TripRequirementInput {
  return tripRequirementInputSchema.parse({ ...baseInput, ...overrides });
}

function malformedRequirement(overrides: Record<string, unknown>): TripRequirementInput {
  return { ...requirement(), ...overrides } as TripRequirementInput;
}

function request(body: unknown, headers?: HeadersInit): Request {
  return new Request("http://localhost/api/trip-requirements/evaluate", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function fakeDependencies(
  role: "TRAVELER" | "ADMIN" | null,
  now = new Date("2026-10-09T17:00:00Z"),
  onBodyRead?: () => void,
): TripRequirementDependencies {
  const authorization: AuthorizationDependencies = {
    database: {
      user: {
        findUnique: async () =>
          role === null ? null : { id: "traveler-a", role },
      },
    } as unknown as AuthorizationDependencies["database"],
    resolveSession: async () => {
      if (role === null) return null;
      return { user: { id: "traveler-a", role } };
    },
  };
  return {
    authorization,
    now: () => now,
    ...(onBodyRead ? { onBodyRead } : {}),
  };
}

describe("US24-START readiness and guard", () => {
  it("marks a complete current/future requirement ready for final confirmation", () => {
    const readiness = evaluateTripRequirement(
      requirement({ startDate: "2026-10-10" }),
      new Date("2026-10-09T17:00:00Z"),
    );
    expect(readiness).toEqual({
      preliminary: true,
      finalConfirmation: true,
      missing: [],
      startDateIssue: null,
      usesRelativeDays: false,
    });
  });

  it("allows a preliminary proposal without start date but not final confirmation", () => {
    const readiness = evaluateTripRequirement(
      requirement({ startDate: null }),
      new Date("2026-10-09T17:00:00Z"),
    );
    expect(readiness.preliminary).toBe(true);
    expect(readiness.finalConfirmation).toBe(false);
    expect(readiness.startDateIssue).toBe("MISSING");
    expect(readiness.usesRelativeDays).toBe(true);
    expect(readiness.missing).toEqual(["startDate"]);
  });

  it("rejects a past start date and accepts today's Vietnam date", () => {
    const now = new Date("2026-10-09T16:00:00Z");
    expect(evaluateTripRequirement(requirement({ startDate: "2026-10-08" }), now).startDateIssue).toBe("IN_PAST");
    expect(evaluateTripRequirement(requirement({ startDate: "2026-10-09" }), now).finalConfirmation).toBe(true);
  });

  it("uses the Asia/Ho_Chi_Minh date at the midnight boundary", () => {
    const beforeMidnight = new Date("2026-10-09T16:59:59Z");
    const afterMidnight = new Date("2026-10-09T17:00:00Z");
    expect(evaluateTripRequirement(requirement({ startDate: "2026-10-09" }), beforeMidnight).finalConfirmation).toBe(true);
    expect(evaluateTripRequirement(requirement({ startDate: "2026-10-09" }), afterMidnight).startDateIssue).toBe("IN_PAST");
  });

  it("reports malformed calendar dates and missing preliminary fields", () => {
    expect(evaluateTripRequirement(malformedRequirement({ startDate: "2026-02-30" }), new Date("2026-01-01T00:00:00Z")).startDateIssue).toBe("INVALID_FORMAT");
    const missing = evaluateTripRequirement(malformedRequirement({ durationDays: undefined, transport: undefined, startDate: null }), new Date("2026-01-01T00:00:00Z"));
    expect(missing.preliminary).toBe(false);
    expect(missing.missing).toEqual(["durationDays", "transport", "startDate"]);
  });

  it("throws the required server guard errors with HTTP 422", () => {
    expect(() => assertStartDateForFinalConfirmation(requirement({ startDate: null }), new Date("2026-10-09T17:00:00Z"))).toThrowError(expect.objectContaining({ code: "TRIP_START_DATE_REQUIRED", status: 422 }));
    expect(() => assertStartDateForFinalConfirmation(requirement({ startDate: "2026-10-08" }), new Date("2026-10-09T17:00:00Z"))).toThrowError(expect.objectContaining({ code: "TRIP_START_DATE_IN_PAST", status: 422 }));
  });
});

const dependencyHolder = vi.hoisted(() => ({
  current: null as TripRequirementDependencies | null,
}));

vi.mock("@/modules/trip-requirement/trip-requirement-server", () => ({
  get tripRequirementDependencies() {
    return dependencyHolder.current;
  },
}));

const { POST } = await import("@/app/api/trip-requirements/evaluate/route");

describe("POST /api/trip-requirements/evaluate", () => {
  beforeEach(() => {
    dependencyHolder.current = fakeDependencies("TRAVELER");
  });

  it("denies Guest before body parsing and accepts Admin", async () => {
    let guestBodyRead = false;
    dependencyHolder.current = fakeDependencies(null, undefined, () => { guestBodyRead = true; });
    const guest = await POST(request(requirement()));
    expect(guest.status).toBe(401);
    expect(guestBodyRead).toBe(false);

    let adminBodyRead = false;
    dependencyHolder.current = fakeDependencies("ADMIN", undefined, () => { adminBodyRead = true; });
    const admin = await POST(request(requirement()));
    expect(admin.status).toBe(200);
    expect(adminBodyRead).toBe(true);
  });

  it("returns preliminary and final readiness with private no-store cache", async () => {
    const preliminary = await POST(request({ ...baseInput, startDate: null }));
    expect(preliminary.status).toBe(200);
    expect(preliminary.headers.get("Cache-Control")).toBe("private, no-store");
    expect((await preliminary.json()).data.readiness.finalConfirmation).toBe(false);

    const complete = await POST(request(baseInput));
    expect(complete.status).toBe(200);
    expect((await complete.json()).data.readiness.finalConfirmation).toBe(true);
  });

  it("returns validation details for invalid JSON, invalid input and oversized body", async () => {
    const invalidJson = await POST(request("{bad-json"));
    expect(invalidJson.status).toBe(400);
    expect((await invalidJson.json()).error.code).toBe("VALIDATION_ERROR");

    const invalidInput = await POST(request({ ...baseInput, durationDays: 0 }));
    expect(invalidInput.status).toBe(400);
    const invalidBody = await invalidInput.json();
    expect(invalidBody.error.code).toBe("VALIDATION_ERROR");
    expect(invalidBody.error.details.fieldErrors.durationDays).toBeTruthy();

    const oversized = await POST(request("x".repeat(9 * 1024)));
    expect(oversized.status).toBe(400);
    expect((await oversized.json()).error.details.fieldErrors._form).toContain("8KB");
  });
});

describe("readiness status copy", () => {
  it("describes all three user-facing branches", () => {
    expect(describeReadiness({ preliminary: true, finalConfirmation: true, missing: [], startDateIssue: null, usesRelativeDays: false }).tone).toBe("success");
    expect(describeReadiness({ preliminary: true, finalConfirmation: false, missing: ["startDate"], startDateIssue: "MISSING", usesRelativeDays: true }).body).toContain("Ngày 1, Ngày 2");
    expect(describeReadiness({ preliminary: false, finalConfirmation: false, missing: ["durationDays", "transport"], startDateIssue: "MISSING", usesRelativeDays: true }).body).toContain("Số ngày chuyến đi");
  });
});
