import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthorizationDependencies } from "@/server/authorization/guard";
import { claimSubmission, releaseSubmission } from "@/lib/auth-submission-guard";
import {
  MAX_INTERESTS,
  MAX_MOBILITY_FLAGS,
  INTEREST_VALUES,
  MOBILITY_CONSTRAINT_VALUES,
  tripRequirementFieldErrors,
  tripRequirementInputSchema,
  type TripRequirementInput,
} from "./trip-requirement-contract";
import { describeReadiness } from "@/app/trips/new/trip-readiness-status";
import {
  buildPayload,
  shouldApplyRequestResponse,
  validateRequiredFields,
  type TripRequirementFormFields,
} from "./trip-requirement-form-logic";
import type { TripRequirementDependencies } from "./trip-requirement-server";
import { evaluateTripRequirementResponse } from "./trip-requirement-http";

const dependencyHolder = {
  current: null as TripRequirementDependencies | null,
};

function POST(request: Request): Promise<Response> {
  if (!dependencyHolder.current) throw new Error("Test dependencies were not initialized");
  return evaluateTripRequirementResponse(request, dependencyHolder.current);
}

const NOW = new Date("2026-10-09T17:00:00Z");

const fullPayload = {
  startDate: " 2026-10-10 ",
  durationDays: 3,
  transport: "CAR" as const,
  companions: { type: "FRIENDS" as const, groupSize: 3 },
  interests: ["FOOD", "NATURE", "FOOD"] as const,
  pace: "MODERATE" as const,
  mobilityConstraints: {
    flags: ["SENIORS", "AVOID_LONG_WALKING", "SENIORS"] as const,
    note: "  Nghỉ giữa chặng  ",
  },
};

const basePayload = {
  startDate: null,
  durationDays: 3,
  transport: "CAR" as const,
};

function fakeDependencies(
  role: "TRAVELER" | "ADMIN" | null,
  now: Date = NOW,
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

function request(body: unknown, headers: HeadersInit = {}): Request {
  return new Request("http://localhost/api/trip-requirements/evaluate", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function rawRequest(body: string, headers: HeadersInit = {}): Request {
  return new Request("http://localhost/api/trip-requirements/evaluate", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

function formFields(overrides: Partial<TripRequirementFormFields> = {}): TripRequirementFormFields {
  return {
    startDate: "2026-10-10",
    durationDays: "3",
    transport: "CAR",
    companionType: "FRIENDS",
    companionGroupSize: "3",
    interests: ["NATURE", "FOOD"],
    pace: "MODERATE",
    mobilityFlags: ["SENIORS"],
    mobilityNote: "Nghỉ giữa chặng",
    ...overrides,
  };
}

describe("US24-TEST contract, evaluate API and form-logic matrix", () => {
  beforeEach(() => {
    dependencyHolder.current = fakeDependencies("TRAVELER");
  });

  it("accepts and normalizes a complete seven-group payload at contract, API and form levels", async () => {
    const contract = tripRequirementInputSchema.safeParse(fullPayload);
    expect(contract.success).toBe(true);
    if (contract.success) {
      expect(contract.data).toEqual({
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
    }

    const apiResponse = await POST(request(fullPayload));
    expect(apiResponse.status).toBe(200);
    const apiBody = await apiResponse.json();
    expect(apiBody.data.requirement).toEqual(tripRequirementInputSchema.parse(fullPayload));
    expect(apiBody.data.readiness).toMatchObject({
      preliminary: true,
      finalConfirmation: true,
      missing: [],
      startDateIssue: null,
      usesRelativeDays: false,
    });

    expect(buildPayload(formFields({
      interests: ["FOOD", "NATURE", "FOOD"],
      mobilityFlags: ["SENIORS", "AVOID_LONG_WALKING", "SENIORS"],
      mobilityNote: "  Nghỉ giữa chặng  ",
    }))).toEqual({
      startDate: "2026-10-10",
      durationDays: 3,
      transport: "CAR",
      companions: { type: "FRIENDS", groupSize: 3 },
      interests: ["FOOD", "NATURE", "FOOD"],
      pace: "MODERATE",
      mobilityConstraints: {
        flags: ["SENIORS", "AVOID_LONG_WALKING", "SENIORS"],
        note: "Nghỉ giữa chặng",
      },
    });
    expect(describeReadiness(apiBody.data.readiness).tone).toBe("success");
  });

  it("keeps a duration-plus-transport payload preliminary and relative-day based", async () => {
    const response = await POST(request(basePayload));
    expect(response.status).toBe(200);
    expect((await response.json()).data.readiness).toEqual({
      preliminary: true,
      finalConfirmation: false,
      missing: ["startDate"],
      startDateIssue: "MISSING",
      usesRelativeDays: true,
    });
  });

  it.each([
    [{ startDate: null, transport: "CAR" }, "durationDays"],
    [{ startDate: null, durationDays: 3 }, "transport"],
    [{ startDate: null, durationDays: undefined, transport: undefined }, "both"],
  ])("returns fieldErrors for missing required payload fields: %j", async (payload, expected) => {
    const response = await POST(request(payload));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    if (expected === "both") {
      expect(Object.keys(body.error.details.fieldErrors)).toEqual(["durationDays", "transport"]);
    } else {
      expect(body.error.details.fieldErrors[expected]).toBeTruthy();
    }
  });

  it.each([{}, null, [], "text"])("rejects empty/non-object JSON body %j", async (body) => {
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it.each([
    0,
    -1,
    15,
    2.5,
    "3",
    "NaN",
  ])("rejects invalid duration at the contract and API boundaries: %j", async (durationDays) => {
    const payload = { ...basePayload, durationDays };
    expect(tripRequirementInputSchema.safeParse(payload).success).toBe(false);
    const response = await POST(request(payload));
    expect(response.status).toBe(400);
    expect((await response.json()).error.details.fieldErrors.durationDays).toBeTruthy();
  });

  it.each(["BICYCLE", "car", "", null, 123])(
    "rejects invalid transport at the contract and API boundaries: %j",
    async (transport) => {
      const payload = { ...basePayload, transport };
      expect(tripRequirementInputSchema.safeParse(payload).success).toBe(false);
      const response = await POST(request(payload));
      expect(response.status).toBe(400);
      expect((await response.json()).error.details.fieldErrors.transport).toBeTruthy();
    },
  );

  it("keeps empty startDate nullable but rejects malformed dates and treats past dates as non-final", async () => {
    expect(tripRequirementInputSchema.parse({ ...basePayload, startDate: "" }).startDate).toBeNull();
    for (const startDate of ["2026-02-30", "10/10/2026", "2026-13-01"]) {
      const payload = { ...basePayload, startDate };
      expect(tripRequirementInputSchema.safeParse(payload).success).toBe(false);
      const response = await POST(request(payload));
      expect(response.status).toBe(400);
    }

    const past = await POST(request({ ...basePayload, startDate: "2026-10-08" }));
    expect(past.status).toBe(200);
    expect((await past.json()).data.readiness).toMatchObject({
      finalConfirmation: false,
      startDateIssue: "IN_PAST",
    });
  });

  it("covers invalid optional values, strict keys and prototype-pollution-shaped keys", async () => {
    expect(
      tripRequirementInputSchema.parse({
        ...basePayload,
        interests: ["NATURE", "NATURE"],
        mobilityConstraints: { flags: ["SENIORS", "SENIORS"] },
      }),
    ).toMatchObject({ interests: ["NATURE"], mobilityConstraints: { flags: ["SENIORS"] } });

    const optionalCases: Array<Record<string, unknown>> = [
      { companions: { type: "SOLO", groupSize: 3 } },
      { companions: { type: "FRIENDS", groupSize: 0 } },
      { companions: { type: "FRIENDS", groupSize: 21 } },
      { interests: ["UNKNOWN"] },
      { interests: Array.from({ length: MAX_INTERESTS + 1 }, (_, index) => INTEREST_VALUES[index] ?? `UNKNOWN_${index}`) },
      { pace: "FAST" },
      { mobilityConstraints: { flags: ["UNKNOWN"] } },
      { mobilityConstraints: { flags: Array.from({ length: MAX_MOBILITY_FLAGS + 1 }, (_, index) => MOBILITY_CONSTRAINT_VALUES[index] ?? `UNKNOWN_${index}`) } },
      { mobilityConstraints: { flags: [], note: "x".repeat(501) } },
      { unexpected: true },
      { constructor: "unexpected" },
      JSON.parse('{"__proto__":{"polluted":true}}') as Record<string, unknown>,
    ];

    for (const extra of optionalCases) {
      const payload = { ...basePayload, ...extra };
      const contract = tripRequirementInputSchema.safeParse(payload);
      expect(contract.success, JSON.stringify(extra)).toBe(false);
      const response = await POST(request(payload));
      expect(response.status, JSON.stringify(extra)).toBe(400);
      expect(Object.prototype).not.toHaveProperty("polluted");
    }
  });

  it("rejects malformed JSON and oversized bodies with the shared validation envelope", async () => {
    const malformed = await POST(rawRequest("{not-json"));
    expect(malformed.status).toBe(400);
    expect((await malformed.json()).error.details.fieldErrors._form).toBeTruthy();

    const oversized = await POST(rawRequest("x".repeat(9 * 1024)));
    expect(oversized.status).toBe(400);
    expect((await oversized.json()).error.details.fieldErrors._form).toContain("8KB");
  });

  it("keeps authorization ahead of body reading and applies private no-store cache", async () => {
    let guestRead = false;
    dependencyHolder.current = fakeDependencies(null, NOW, () => { guestRead = true; });
    const guest = await POST(request(fullPayload));
    expect(guest.status).toBe(401);
    expect(guest.headers.get("Cache-Control")).toBe("private, no-store");
    expect(guestRead).toBe(false);

    let adminRead = false;
    dependencyHolder.current = fakeDependencies("ADMIN", NOW, () => { adminRead = true; });
    const admin = await POST(request(fullPayload));
    expect(admin.status).toBe(403);
    expect(admin.headers.get("Cache-Control")).toBe("private, no-store");
    expect(adminRead).toBe(false);
  });

  it("does not log mobility note content when an unexpected API error occurs", async () => {
    const sensitiveNote = "SENSITIVE-MOBILITY-NOTE-DO-NOT-LOG";
    const dependencies = fakeDependencies("TRAVELER");
    dependencies.now = () => {
      throw new Error("simulated database outage");
    };
    dependencyHolder.current = dependencies;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const response = await POST(request({ ...fullPayload, mobilityConstraints: { flags: [], note: sensitiveNote } }));
      expect(response.status).toBe(500);
      expect(errorSpy.mock.calls.flat().map(String).join(" ")).not.toContain(sensitiveNote);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("covers Vietnam midnight boundaries and leap-year calendar validation", async () => {
    const beforeMidnight = fakeDependencies("TRAVELER", new Date("2026-10-09T16:59:59Z"));
    dependencyHolder.current = beforeMidnight;
    const before = await POST(request({ ...basePayload, startDate: "2026-10-09" }));
    expect((await before.json()).data.readiness.finalConfirmation).toBe(true);

    dependencyHolder.current = fakeDependencies("TRAVELER", new Date("2026-10-09T17:00:00Z"));
    const after = await POST(request({ ...basePayload, startDate: "2026-10-09" }));
    expect((await after.json()).data.readiness.startDateIssue).toBe("IN_PAST");

    expect(tripRequirementInputSchema.safeParse({ ...basePayload, startDate: "2028-02-29" }).success).toBe(true);
    expect(tripRequirementInputSchema.safeParse({ ...basePayload, startDate: "2027-02-29" }).success).toBe(false);
  });
});

describe("US24-TEST form logic and source contracts", () => {
  it("keeps required-field errors/messages and form values deterministic", () => {
    const errors = validateRequiredFields({ ...formFields(), durationDays: null, transport: null });
    expect(Object.keys(errors)).toEqual(["durationDays", "transport"]);
    expect(errors.durationDays).toBe("Vui lòng nhập thời lượng chuyến đi (số ngày).");
    expect(errors.transport).toBe("Vui lòng chọn phương tiện: xe máy hoặc ô tô.");

    const data = formFields({ mobilityNote: "Giữ nguyên dữ liệu" });
    const networkDecision = { action: "NETWORK_ERROR", message: "Lỗi mạng" };
    const failedDecision = { action: "TECHNICAL_ERROR", message: "Lỗi server" };
    expect(data.mobilityNote).toBe("Giữ nguyên dữ liệu");
    expect(networkDecision.action).toBe("NETWORK_ERROR");
    expect(failedDecision.action).toBe("TECHNICAL_ERROR");
  });

  it("blocks duplicate submission and ignores stale/unmounted responses by sequence", () => {
    const lock = { current: false };
    expect(claimSubmission(lock)).toBe(true);
    expect(claimSubmission(lock)).toBe(false);
    releaseSubmission(lock);
    expect(claimSubmission(lock)).toBe(true);
    releaseSubmission(lock);

    expect(shouldApplyRequestResponse(1, 1, true)).toBe(true);
    expect(shouldApplyRequestResponse(1, 2, true)).toBe(false);
    expect(shouldApplyRequestResponse(1, 1, false)).toBe(false);
  });

  it("keeps source-level authorization, field and no-storage contracts", () => {
    const sourceRoot = dirname(fileURLToPath(import.meta.url));
    const page = readFileSync(resolve(sourceRoot, "../../app/trips/new/page.tsx"), "utf8");
    const form = readFileSync(resolve(sourceRoot, "../../app/trips/new/trip-requirement-form.tsx"), "utf8");
    const logic = readFileSync(resolve(sourceRoot, "./trip-requirement-form-logic.ts"), "utf8");

    expect(page).toContain('requireActor(await headers(), authorizationDependencies, "traveler")');
    expect(page).toContain('buildAuthLoginHref("/trips/new")');
    expect(page).toContain("<AccessDenied />");
    for (const id of [
      "trip-start-date",
      "trip-duration",
      "trip-transport",
      "trip-companion-type",
      "trip-interest-first",
      "trip-pace",
      "trip-mobility-first",
    ]) expect(form).toContain(`id=\"${id}\"`);
    for (const label of [
      "Ngày bắt đầu",
      "Thời lượng chuyến đi",
      "Phương tiện di chuyển",
      "Người đồng hành",
      "Sở thích chuyến đi",
      "Nhịp độ chuyến đi",
      "Ràng buộc di chuyển",
    ]) expect(form).toContain(label);
    expect(form).toContain("aria-invalid");
    expect(form).toContain("aria-describedby");
    expect(form).not.toMatch(/<Button[^>]*>\s*(?:Lưu|Xác nhận|Tạo hành trình)/);
    expect(form).not.toContain("localStorage");
    expect(form).not.toContain("sessionStorage");
    expect(logic).not.toContain("localStorage");
    expect(logic).not.toContain("sessionStorage");
  });
});
