import { afterEach, describe, expect, it, vi } from "vitest";

import {
  checkTripRequirement,
  decideTripRequirementCheckResponse,
  shouldApplyCheckResponse,
} from "./trip-requirement-check-client";

const candidate = {
  startDate: "2026-10-20",
  durationDays: 3,
  transport: "MOTORCYCLE" as const,
  companions: null,
  interests: ["FOOD" as const],
  pace: null,
  mobilityConstraints: null,
};

const checkedResult = {
  requirement: candidate,
  issues: [],
  confirmable: true,
  readiness: {
    preliminary: true,
    finalConfirmation: true,
    missing: [],
    startDateIssue: null,
    usesRelativeDays: false,
  },
  usesRelativeDays: false,
};

describe("trip-requirement-check-client", () => {
  afterEach(() => vi.restoreAllMocks());

  it("accepts only the strict checked response schema", () => {
    expect(decideTripRequirementCheckResponse({
      kind: "http",
      status: 200,
      body: { success: true, data: checkedResult },
    })).toMatchObject({ kind: "CHECKED", result: checkedResult });
    const legacyResponse = decideTripRequirementCheckResponse({
      kind: "http",
      status: 200,
      body: { success: true, data: checkedResult },
    });
    if (legacyResponse.kind === "CHECKED") expect(legacyResponse.result.clarificationRequests).toEqual([]);

    expect(decideTripRequirementCheckResponse({
      kind: "http",
      status: 200,
      body: { success: true, data: { ...checkedResult, untrusted: "ignored" } },
    })).toMatchObject({ kind: "FAILED", status: 502, code: "INVALID_RESPONSE" });
  });

  it.each([
    [400, "VALIDATION_ERROR"],
    [401, "UNAUTHENTICATED"],
    [403, "FORBIDDEN"],
    [503, "INTERNAL_SERVER_ERROR"],
  ])("maps safe failure state for %s", (status, code) => {
    const outcome = decideTripRequirementCheckResponse({
      kind: "http",
      status,
      body: { success: false, error: { code, message: "nội dung không dùng từ response" } },
    });
    expect(outcome).toMatchObject({ kind: "FAILED", status, code });
    if (outcome.kind === "FAILED") expect(outcome.message).not.toContain("nội dung không dùng");
  });

  it("keeps network failure separate from a checked result", () => {
    expect(decideTripRequirementCheckResponse({ kind: "network" })).toEqual({ kind: "NETWORK_ERROR" });
  });

  it("applies only the mounted latest request response", () => {
    expect(shouldApplyCheckResponse(2, 2, true)).toBe(true);
    expect(shouldApplyCheckResponse(1, 2, true)).toBe(false);
    expect(shouldApplyCheckResponse(2, 2, false)).toBe(false);
  });

  it("sends only the canonical candidate to the same-origin check endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: checkedResult }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkTripRequirement(candidate)).resolves.toMatchObject({ kind: "CHECKED" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trip-requirements/check",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify(candidate),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as Record<string, unknown>;
    expect(body).toEqual(candidate);
    expect(body).not.toHaveProperty("sourceText");
    expect(body).not.toHaveProperty("aiNote");
    expect(body).not.toHaveProperty("origin");
  });

  it("does not expose malformed response content", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("provider stack", { status: 200 })));
    const outcome = await checkTripRequirement(candidate);
    expect(outcome).toMatchObject({ kind: "FAILED", status: 502, code: "INVALID_RESPONSE" });
    if (outcome.kind === "FAILED") expect(outcome.message).not.toContain("provider stack");
  });
});

