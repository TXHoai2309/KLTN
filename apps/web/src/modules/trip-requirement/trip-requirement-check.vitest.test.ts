import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthorizationDependencies } from "@/server/authorization/guard";
import type { TripRequirementDependencies } from "./trip-requirement-server";
import { checkTripRequirementResponse, MAX_CHECK_BODY_BYTES } from "./trip-requirement-check-http";
import { checkTripRequirement } from "./trip-requirement-check";

const BEFORE_VIETNAM_MIDNIGHT = new Date("2026-10-09T16:59:59Z");
const AFTER_VIETNAM_MIDNIGHT = new Date("2026-10-09T17:00:00Z");

const completePayload = {
  startDate: " 2026-10-10 ",
  durationDays: 3,
  transport: "CAR",
  companions: { type: "FRIENDS", groupSize: 3 },
  interests: ["FOOD", "NATURE", "FOOD"],
  pace: "MODERATE",
  mobilityConstraints: {
    flags: ["SENIORS", "AVOID_LONG_WALKING", "SENIORS"],
    note: "  Nghỉ giữa chặng  ",
  },
};

const preliminaryPayload = {
  startDate: null,
  durationDays: 3,
  transport: "MOTORCYCLE",
};

function fakeDependencies(
  role: "TRAVELER" | "ADMIN" | null,
  now: Date = BEFORE_VIETNAM_MIDNIGHT,
  onBodyRead?: () => void,
): TripRequirementDependencies {
  const authorization: AuthorizationDependencies = {
    database: {
      user: {
        findUnique: async () => role === null ? null : { id: "traveler-a", role },
      },
    } as unknown as AuthorizationDependencies["database"],
    resolveSession: async () => role === null ? null : { user: { id: "traveler-a", role } },
  };
  return {
    authorization,
    now: () => now,
    ...(onBodyRead ? { onBodyRead } : {}),
  };
}

function request(body: string, headers: HeadersInit = {}): Request {
  return new Request("http://localhost/api/trip-requirements/check", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

async function responseBody(response: Response): Promise<any> {
  return response.json();
}

describe("US26-BE-CHECK domain", () => {
  it("normalizes a complete candidate and confirms it", () => {
    const before = structuredClone(completePayload);
    const result = checkTripRequirement(completePayload, BEFORE_VIETNAM_MIDNIGHT);

    expect(result).toMatchObject({ confirmable: true, usesRelativeDays: false });
    expect(result.issues).toEqual([]);
    expect(result.requirement).toEqual({
      startDate: "2026-10-10",
      durationDays: 3,
      transport: "CAR",
      companions: { type: "FRIENDS", groupSize: 3 },
      interests: ["NATURE", "FOOD"],
      pace: "MODERATE",
      mobilityConstraints: {
        flags: ["AVOID_LONG_WALKING", "SENIORS"],
        note: "Nghỉ giữa chặng",
      },
    });
    expect(completePayload).toEqual(before);
    expect(result.readiness?.finalConfirmation).toBe(true);
  });

  it("accepts a preliminary requirement without startDate and uses relative days", () => {
    const result = checkTripRequirement(preliminaryPayload, BEFORE_VIETNAM_MIDNIGHT);
    expect(result.requirement?.startDate).toBeNull();
    expect(result.issues).toEqual([]);
    expect(result.confirmable).toBe(true);
    expect(result.usesRelativeDays).toBe(true);
    expect(result.readiness).toMatchObject({ preliminary: true, finalConfirmation: false, usesRelativeDays: true });
  });

  it("returns both missing required issues in stable order", () => {
    const result = checkTripRequirement({ startDate: null }, BEFORE_VIETNAM_MIDNIGHT);
    expect(result.requirement).toBeNull();
    expect(result.issues.map((issue) => [issue.field, issue.code])).toEqual([
      ["durationDays", "MISSING_REQUIRED"],
      ["transport", "MISSING_REQUIRED"],
    ]);
    expect(result.confirmable).toBe(false);
  });

  it.each([
    ["duration string", { ...preliminaryPayload, durationDays: "3" }, "durationDays", "INVALID_VALUE"],
    ["duration below range", { ...preliminaryPayload, durationDays: 0 }, "durationDays", "INVALID_VALUE"],
    ["duration above range", { ...preliminaryPayload, durationDays: 15 }, "durationDays", "INVALID_VALUE"],
    ["duration fraction", { ...preliminaryPayload, durationDays: 2.5 }, "durationDays", "INVALID_VALUE"],
    ["transport bicycle", { ...preliminaryPayload, transport: "BICYCLE" }, "transport", "TRANSPORT_UNSUPPORTED"],
    ["transport lowercase", { ...preliminaryPayload, transport: "car" }, "transport", "TRANSPORT_UNSUPPORTED"],
    ["group size zero", { ...completePayload, companions: { type: "FRIENDS", groupSize: 0 } }, "companions", "INVALID_VALUE"],
    ["group size too large", { ...completePayload, companions: { type: "FRIENDS", groupSize: 21 } }, "companions", "INVALID_VALUE"],
    ["solo group mismatch", { ...completePayload, companions: { type: "SOLO", groupSize: 3 } }, "companions", "INVALID_VALUE"],
    ["unknown interest", { ...completePayload, interests: ["UNKNOWN"] }, "interests", "INVALID_VALUE"],
    ["interest list beyond contract", { ...completePayload, interests: ["NATURE", "CULTURE_HISTORY", "ETHNIC_VILLAGES", "PHOTOGRAPHY", "FOOD", "ADVENTURE", "RELAXATION", "UNKNOWN"] }, "interests", "INVALID_VALUE"],
    ["unknown mobility flag", { ...completePayload, mobilityConstraints: { flags: ["UNKNOWN"], note: null } }, "mobilityConstraints", "INVALID_VALUE"],
    ["mobility list beyond contract", { ...completePayload, mobilityConstraints: { flags: ["AVOID_LONG_WALKING", "NO_STEEP_TERRAIN", "WHEELCHAIR_OR_MOBILITY_AID", "YOUNG_CHILDREN", "SENIORS", "MOTION_SICKNESS", "UNKNOWN"], note: null } }, "mobilityConstraints", "INVALID_VALUE"],
    ["long note", { ...completePayload, mobilityConstraints: { flags: [], note: "x".repeat(501) } }, "mobilityConstraints", "INVALID_VALUE"],
  ] as const)("returns the expected issue for %s", (_name, payload, field, expectedCode) => {
    const result = checkTripRequirement(payload, BEFORE_VIETNAM_MIDNIGHT);
    expect(result.issues.some((issue) => issue.field === field && issue.code === expectedCode)).toBe(true);
    expect(result.confirmable).toBe(false);
  });

  it("distinguishes a missing null transport from an invalid transport", () => {
    const missing = checkTripRequirement({ ...preliminaryPayload, transport: null }, BEFORE_VIETNAM_MIDNIGHT);
    expect(missing.issues.find((issue) => issue.field === "transport")?.code).toBe("MISSING_REQUIRED");
    const invalid = checkTripRequirement({ ...preliminaryPayload, transport: "" }, BEFORE_VIETNAM_MIDNIGHT);
    expect(invalid.issues.find((issue) => issue.field === "transport")?.code).toBe("TRANSPORT_UNSUPPORTED");
  });

  it("uses the contract's canonicalize-before-limit behavior for duplicate enum values", () => {
    const result = checkTripRequirement({
      ...preliminaryPayload,
      interests: ["NATURE", "NATURE", "FOOD", "FOOD", "NATURE"],
      mobilityConstraints: {
        flags: ["SENIORS", "SENIORS", "AVOID_LONG_WALKING", "SENIORS"],
        note: null,
      },
    }, BEFORE_VIETNAM_MIDNIGHT);
    expect(result.issues).toEqual([]);
    expect(result.requirement?.interests).toEqual(["NATURE", "FOOD"]);
    expect(result.requirement?.mobilityConstraints?.flags).toEqual(["AVOID_LONG_WALKING", "SENIORS"]);
  });

  it("reports invalid, past and boundary start dates without rewriting the readiness helper", () => {
    for (const value of ["2026-02-30", "10/10/2026", "2026-13-01"]) {
      const result = checkTripRequirement({ ...preliminaryPayload, startDate: value }, BEFORE_VIETNAM_MIDNIGHT);
      expect(result.issues.find((issue) => issue.field === "startDate")?.code).toBe("START_DATE_INVALID");
    }

    const before = checkTripRequirement({ ...preliminaryPayload, startDate: "2026-10-09" }, BEFORE_VIETNAM_MIDNIGHT);
    expect(before.confirmable).toBe(true);
    const after = checkTripRequirement({ ...preliminaryPayload, startDate: "2026-10-09" }, AFTER_VIETNAM_MIDNIGHT);
    expect(after.issues).toContainEqual(expect.objectContaining({ code: "START_DATE_IN_PAST", field: "startDate" }));
    expect(after.requirement?.startDate).toBe("2026-10-09");

    expect(checkTripRequirement({ ...preliminaryPayload, startDate: "2028-02-29" }, new Date("2027-01-01T00:00:00Z")).issues).toEqual([]);
    expect(checkTripRequirement({ ...preliminaryPayload, startDate: "2027-02-29" }, new Date("2026-01-01T00:00:00Z")).issues[0]?.code).toBe("START_DATE_INVALID");
  });

  it("reports contract cross-field errors and proposed warnings", () => {
    const conflict = checkTripRequirement({
      ...preliminaryPayload,
      companions: { type: "SOLO", groupSize: 1 },
      mobilityConstraints: { flags: ["YOUNG_CHILDREN"], note: null },
    }, BEFORE_VIETNAM_MIDNIGHT);
    expect(conflict.issues).toContainEqual(expect.objectContaining({ code: "COMPANIONS_CONFLICT_CHILDREN", severity: "ERROR" }));
    expect(conflict.confirmable).toBe(false);

    const warning = checkTripRequirement({
      ...preliminaryPayload,
      pace: "PACKED",
      mobilityConstraints: { flags: ["AVOID_LONG_WALKING"], note: null },
    }, BEFORE_VIETNAM_MIDNIGHT);
    expect(warning.issues).toContainEqual(expect.objectContaining({ code: "PACE_MOBILITY_MISMATCH", severity: "WARNING" }));
    expect(warning.confirmable).toBe(true);

    const wheelchairWarning = checkTripRequirement({
      ...preliminaryPayload,
      pace: "PACKED",
      mobilityConstraints: { flags: ["WHEELCHAIR_OR_MOBILITY_AID"], note: null },
    }, BEFORE_VIETNAM_MIDNIGHT);
    expect(wheelchairWarning.confirmable).toBe(true);
    expect(checkTripRequirement({
      ...preliminaryPayload,
      pace: "MODERATE",
      mobilityConstraints: { flags: ["AVOID_LONG_WALKING"], note: null },
    }, BEFORE_VIETNAM_MIDNIGHT).issues).toEqual([]);
  });

  it("fails closed for unknown keys and hostile/non-object input without throwing", () => {
    const hostile = JSON.parse('{"startDate":null,"durationDays":3,"transport":"MOTORCYCLE","__proto__":"polluted"}');
    const result = checkTripRequirement(hostile, BEFORE_VIETNAM_MIDNIGHT);
    expect(result.requirement).toBeNull();
    expect(result.issues.some((issue) => issue.code === "INVALID_BODY")).toBe(true);
    for (const input of [null, [], "text", 42]) {
      expect(() => checkTripRequirement(input, BEFORE_VIETNAM_MIDNIGHT)).not.toThrow();
      expect(checkTripRequirement(input, BEFORE_VIETNAM_MIDNIGHT).issues[0]?.code).toBe("INVALID_BODY");
    }
  });
});

describe("US26-BE-CHECK HTTP boundary", () => {
  let bodyReadCount: number;

  beforeEach(() => {
    bodyReadCount = 0;
  });

  it("rejects Guest before body parsing and checks Admin requirements", async () => {
    for (const role of [null, "ADMIN"] as const) {
      const response = await checkTripRequirementResponse(
        request(JSON.stringify(completePayload)),
        fakeDependencies(role, BEFORE_VIETNAM_MIDNIGHT, () => { bodyReadCount += 1; }),
      );
      expect(response.status).toBe(role === null ? 401 : 200);
      expect(bodyReadCount).toBe(role === null ? 0 : 1);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    }
  });

  it("returns 200 for valid, error-bearing and warning-bearing checks", async () => {
    const valid = await checkTripRequirementResponse(
      request(JSON.stringify(preliminaryPayload)),
      fakeDependencies("TRAVELER", BEFORE_VIETNAM_MIDNIGHT),
    );
    expect(valid.status).toBe(200);
    expect((await responseBody(valid)).data).toMatchObject({ confirmable: true, clarificationRequests: [] });

    const withErrors = await checkTripRequirementResponse(
      request(JSON.stringify({ ...preliminaryPayload, durationDays: 99 })),
      fakeDependencies("TRAVELER", BEFORE_VIETNAM_MIDNIGHT),
    );
    expect(withErrors.status).toBe(200);
    expect((await responseBody(withErrors)).data).toMatchObject({
      issues: [{ code: "INVALID_VALUE" }],
      clarificationRequests: [{ id: "durationDays:OUT_OF_RANGE", severity: "BLOCKING" }],
    });

    const withWarning = await checkTripRequirementResponse(
      request(JSON.stringify({ ...preliminaryPayload, pace: "PACKED", mobilityConstraints: { flags: ["AVOID_LONG_WALKING"], note: null } })),
      fakeDependencies("TRAVELER", BEFORE_VIETNAM_MIDNIGHT),
    );
    expect(withWarning.status).toBe(200);
    expect((await responseBody(withWarning)).data).toMatchObject({
      issues: [{ severity: "WARNING" }],
      clarificationRequests: [{ id: "pace:CONFLICT", severity: "ADVISORY" }],
    });
  });

  it.each([
    ["malformed JSON", "{", { "content-type": "application/json" }],
    ["wrong content type", JSON.stringify(completePayload), { "content-type": "text/plain" }],
    ["array body", JSON.stringify([]), { "content-type": "application/json" }],
    ["oversized body", JSON.stringify({ note: "x".repeat(MAX_CHECK_BODY_BYTES) }), { "content-type": "application/json" }],
  ] as const)("returns 400 for %s", async (_name, body, headers) => {
    const response = await checkTripRequirementResponse(
      request(body, headers),
      fakeDependencies("TRAVELER", BEFORE_VIETNAM_MIDNIGHT),
    );
    expect(response.status).toBe(400);
    expect((await responseBody(response)).error.code).toBe("VALIDATION_ERROR");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("does not log body content or touch persistence outside authorization", async () => {
    const errorText = "GHI_CHU_NHAY_CAM_KHONG_DUOC_LOG";
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await checkTripRequirementResponse(
      request(JSON.stringify({ ...preliminaryPayload, mobilityConstraints: { flags: [], note: errorText } })),
      fakeDependencies("TRAVELER", BEFORE_VIETNAM_MIDNIGHT),
    );
    expect(response.status).toBe(200);
    expect(consoleSpy.mock.calls.flat().join(" ")).not.toContain(errorText);
    consoleSpy.mockRestore();
  });
});
