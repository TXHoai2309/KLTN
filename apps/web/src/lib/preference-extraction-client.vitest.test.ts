import { afterEach, describe, expect, it, vi } from "vitest";

import {
  analyzeTripNeeds,
  decideAnalyzeTripNeedsResponse,
} from "./preference-extraction-client";

const validResult = {
  fields: {
    startDate: { status: "EXTRACTED", value: "2026-10-20", sourceText: "ngày 20/10", note: null },
    durationDays: { status: "EXTRACTED", value: 3, sourceText: "3 ngày", note: null },
    transport: { status: "EXTRACTED", value: "MOTORCYCLE", sourceText: "xe máy", note: null },
    companions: { status: "MISSING", value: null, sourceText: null, note: null },
    interests: { status: "EXTRACTED", value: ["FOOD"], sourceText: "ăn uống", note: null },
    pace: { status: "MISSING", value: null, sourceText: null, note: null },
    mobilityConstraints: { status: "MISSING", value: null, sourceText: null, note: null },
  },
  clarifications: [],
  missingRequired: [],
  meta: { model: "test-model", latencyMs: 4, inputLength: 30 },
};

describe("preference-extraction-client", () => {
  afterEach(() => vi.restoreAllMocks());

  it("accepts only a schema-valid success envelope", () => {
    const decision = decideAnalyzeTripNeedsResponse({
      kind: "http",
      status: 200,
      body: { success: true, data: { result: validResult } },
    });
    expect(decision.kind).toBe("SUCCESS");
    if (decision.kind === "SUCCESS") expect(decision.result.meta.model).toBe("test-model");

    const invalid = decideAnalyzeTripNeedsResponse({
      kind: "http",
      status: 200,
      body: { success: true, data: { result: { nope: true } } },
    });
    expect(invalid).toMatchObject({ kind: "FAILED", status: 502, code: "AI_INVALID_RESPONSE" });
  });

  it.each([
    [400, "VALIDATION_ERROR"],
    [401, "UNAUTHENTICATED"],
    [403, "FORBIDDEN"],
    [502, "AI_INVALID_RESPONSE"],
    [503, "AI_UNAVAILABLE"],
  ])("preserves safe API error metadata for %s", (status, code) => {
    const decision = decideAnalyzeTripNeedsResponse({
      kind: "http",
      status,
      body: {
        success: false,
        error: {
          code,
          message: "Thông báo an toàn",
          details: { fieldErrors: { text: "Văn bản chưa hợp lệ." } },
        },
      },
    });
    expect(decision).toMatchObject({ kind: "FAILED", status, code, message: "Thông báo an toàn" });
    if (decision.kind === "FAILED") expect(decision.fieldErrors?.text).toBe("Văn bản chưa hợp lệ.");
  });

  it("returns a network outcome without retrying", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(analyzeTripNeeds("đi xe máy 3 ngày")).resolves.toEqual({ kind: "NETWORK_ERROR" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses same-origin JSON and parses the server result", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { result: validResult } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const outcome = await analyzeTripNeeds("đi xe máy 3 ngày");
    expect(outcome.kind).toBe("SUCCESS");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trip-requirements/analyze",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify({ text: "đi xe máy 3 ngày" }),
      }),
    );
  });

  it("keeps malformed server JSON as a safe failed outcome", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not-json", { status: 503 })));
    const outcome = await analyzeTripNeeds("đi xe máy 3 ngày");
    expect(outcome).toMatchObject({ kind: "FAILED", status: 503, code: "AI_UNAVAILABLE" });
    if (outcome.kind === "FAILED") expect(outcome.message).not.toContain("not-json");
  });
});
