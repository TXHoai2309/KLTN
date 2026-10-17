import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthorizationDependencies } from "@/server/authorization/guard";
import { PreferenceExtractionError } from "./preference-extraction-errors";
import {
  analyzePreferencesResponse,
  MAX_ANALYZE_BODY_BYTES,
  type PreferenceAnalyzeDependencies,
} from "./preference-extraction-http";
import {
  extractionResultSchema,
  type ModelOutput,
} from "./preference-extraction-contract";

const NOW = new Date("2026-10-11T00:00:00Z");
const ORIGIN = "http://localhost";

const extracted = <T>(value: T, sourceText: string) => ({
  status: "EXTRACTED" as const,
  value,
  sourceText,
  note: null,
});

const missing = () => ({
  status: "MISSING" as const,
  value: null,
  sourceText: null,
  note: null,
});

function fullModelOutput(): ModelOutput {
  return {
    fields: {
      startDate: extracted("2026-10-15", "15/10/2026"),
      durationDays: extracted(3, "3 ngày"),
      transport: extracted("MOTORCYCLE", "xe máy"),
      companions: extracted({ type: "SOLO", groupSize: 1 }, "một mình"),
      interests: extracted(["NATURE"], "thiên nhiên"),
      pace: extracted("RELAXED", "thong thả"),
      mobilityConstraints: extracted(
        { flags: ["AVOID_LONG_WALKING"], note: "đi bộ xa" },
        "đi bộ xa",
      ),
    },
  };
}

function allMissingModelOutput(): ModelOutput {
  return {
    fields: {
      startDate: missing(),
      durationDays: missing(),
      transport: missing(),
      companions: missing(),
      interests: missing(),
      pace: missing(),
      mobilityConstraints: missing(),
    },
  };
}

function fakeAuthorization(
  role: "TRAVELER" | "ADMIN" | null,
  onDatabaseRead: (
    ...args: never[]
  ) => Promise<{ id: string; role: "TRAVELER" | "ADMIN" }> = async () => ({
    id: "traveler-1",
    role: role ?? "TRAVELER",
  }),
): AuthorizationDependencies {
  return {
    database: { user: { findUnique: onDatabaseRead } } as never,
    resolveSession: vi.fn(async () =>
      role === null ? null : { user: { id: "traveler-1", role } },
    ),
  };
}

function fakeDependencies(
  role: "TRAVELER" | "ADMIN" | null = "TRAVELER",
  output: ModelOutput = fullModelOutput(),
): PreferenceAnalyzeDependencies {
  return {
    authorization: fakeAuthorization(role),
    llm: {
      complete: vi.fn(async () => ({
        rawText: JSON.stringify(output),
        model: "test-model",
      })),
    },
    now: () => NOW,
    nowMs: () => 1_000,
  };
}

function request(
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request("http://localhost/api/trip-requirements/analyze", {
    method: "POST",
    headers: {
      Origin: ORIGIN,
      "Sec-Fetch-Site": "same-origin",
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function rawRequest(
  body: string,
  headers: Record<string, string> = {},
): Request {
  return new Request("http://localhost/api/trip-requirements/analyze", {
    method: "POST",
    headers: {
      Origin: ORIGIN,
      "Sec-Fetch-Site": "same-origin",
      "Content-Type": "application/json",
      ...headers,
    },
    body,
  });
}

async function json(response: Response): Promise<Record<string, any>> {
  return (await response.json()) as Record<string, any>;
}

describe("US25-API preference extraction HTTP boundary", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects Guest before reading the body or calling the LLM", async () => {
    const dependencies = fakeDependencies(null);
    const onBodyRead = vi.fn();
    dependencies.onBodyRead = onBodyRead;
    const response = await analyzePreferencesResponse(
      request({ text: "Tôi đi xe máy 3 ngày" }),
      dependencies,
    );

    expect(response.status).toBe(401);
    expect((await json(response)).error.code).toBe("UNAUTHENTICATED");
    expect(onBodyRead).not.toHaveBeenCalled();
    expect(dependencies.llm.complete).not.toHaveBeenCalled();
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("accepts Admin through the same verified extraction pipeline", async () => {
    const dependencies = fakeDependencies("ADMIN");
    const onBodyRead = vi.fn();
    dependencies.onBodyRead = onBodyRead;
    const response = await analyzePreferencesResponse(
      request({ text: "Tôi đi xe máy 3 ngày" }),
      dependencies,
    );

    expect(response.status).toBe(200);
    expect((await json(response)).success).toBe(true);
    expect(onBodyRead).toHaveBeenCalledOnce();
    expect(dependencies.llm.complete).toHaveBeenCalledOnce();
  });

  it("returns a complete verified result and only the public contract", async () => {
    const response = await analyzePreferencesResponse(
      request({
        text: "Ngày 15/10/2026, đi xe máy 3 ngày, một mình, thích thiên nhiên, thong thả, đi bộ xa",
      }),
      fakeDependencies(),
    );
    const body = await json(response);

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Object.keys(body.data).sort()).toEqual(["clarificationRequests", "result"]);
    expect(extractionResultSchema.safeParse(body.data.result).success).toBe(true);
    expect(Array.isArray(body.data.clarificationRequests)).toBe(true);
    expect(body.data.result.missingRequired).toEqual([]);
    expect(Object.keys(body.data.result.meta).sort()).toEqual([
      "inputLength",
      "latencyMs",
      "model",
    ]);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("returns 200 with missingRequired when the model cannot identify required fields", async () => {
    const response = await analyzePreferencesResponse(
      request({ text: "Tôi muốn có một chuyến đi thật nhẹ nhàng" }),
      fakeDependencies("TRAVELER", allMissingModelOutput()),
    );
    const body = await json(response);

    expect(response.status).toBe(200);
    expect(body.data.result.missingRequired).toEqual([
      "durationDays",
      "transport",
    ]);
    expect(Object.values(body.data.result.fields).every((field: any) => field.status === "MISSING")).toBe(true);
    expect(body.data.clarificationRequests).toMatchObject([
      { id: "durationDays:MISSING", severity: "BLOCKING" },
      { id: "transport:MISSING", severity: "BLOCKING" },
    ]);
  });

  it.each([
    ["", "Nhu cầu chuyến đi phải có ít nhất 5 ký tự."],
    ["abcd", "Nhu cầu chuyến đi phải có ít nhất 5 ký tự."],
    ["😀😀😀😀", "Nhu cầu chuyến đi phải có ít nhất 5 ký tự."],
    ["a".normalize("NFD") + "́bcd", "Nhu cầu chuyến đi phải có ít nhất 5 ký tự."],
    ["a".repeat(1001), "Nhu cầu chuyến đi không được quá 1000 ký tự."],
    ["😀".repeat(1001), "Nhu cầu chuyến đi không được quá 1000 ký tự."],
  ])("rejects text outside the code-point contract (case %#)", async (text, message) => {
    const dependencies = fakeDependencies();
    const response = await analyzePreferencesResponse(
      request({ text }),
      dependencies,
    );
    const body = await json(response);

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details.fieldErrors.text).toBe(message);
    expect(dependencies.llm.complete).not.toHaveBeenCalled();
  });

  it("rejects non-object, extra-key, malformed JSON and wrong content type", async () => {
    const cases: Array<[Request, string]> = [
      [request({ text: "đi xe máy 3 ngày", extra: true }), "_form"],
      [request(null), "_form"],
      [rawRequest("{bad"), "_form"],
      [
        request({ text: "đi xe máy 3 ngày" }, { "Content-Type": "text/plain" }),
        "_form",
      ],
    ];

    for (const [input, field] of cases) {
      const dependencies = fakeDependencies();
      const response = await analyzePreferencesResponse(input, dependencies);
      const body = await json(response);
      expect(response.status).toBe(400);
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.details.fieldErrors[field]).toBeTypeOf("string");
      expect(dependencies.llm.complete).not.toHaveBeenCalled();
    }
  });

  it("rejects a streamed body beyond 8KB before invoking the LLM", async () => {
    const dependencies = fakeDependencies();
    const bodyRead = vi.fn();
    dependencies.onBodyRead = bodyRead;
    const oversized = JSON.stringify({ text: "x".repeat(MAX_ANALYZE_BODY_BYTES) });
    const response = await analyzePreferencesResponse(rawRequest(oversized), dependencies);
    const body = await json(response);

    expect(response.status).toBe(400);
    expect(body.error.details.fieldErrors._form).toContain("8KB");
    expect(bodyRead).toHaveBeenCalledOnce();
    expect(dependencies.llm.complete).not.toHaveBeenCalled();
  });

  it("rejects an advertised oversized body without consuming it", async () => {
    const dependencies = fakeDependencies();
    const bodyRead = vi.fn();
    dependencies.onBodyRead = bodyRead;
    const response = await analyzePreferencesResponse(
      rawRequest(JSON.stringify({ text: "đi xe máy 3 ngày" }), {
        "Content-Length": String(MAX_ANALYZE_BODY_BYTES + 1),
      }),
      dependencies,
    );

    expect(response.status).toBe(400);
    expect(bodyRead).toHaveBeenCalledOnce();
    expect(dependencies.llm.complete).not.toHaveBeenCalled();
  });

  it.each([
    [new PreferenceExtractionError("PROVIDER_TIMEOUT"), 503, "AI_UNAVAILABLE"],
    [new PreferenceExtractionError("PROVIDER_RATE_LIMITED"), 503, "AI_UNAVAILABLE"],
    [new PreferenceExtractionError("INVALID_PROVIDER_RESPONSE"), 502, "AI_INVALID_RESPONSE"],
    [new PreferenceExtractionError("PROVIDER_REFUSAL"), 502, "AI_INVALID_RESPONSE"],
  ])("maps provider failure safely: %s", async (providerError, status, code) => {
    const dependencies = fakeDependencies();
    dependencies.llm.complete = vi.fn(async () => {
      throw providerError;
    });
    const sensitive = "Nội dung bí mật không được ghi log";
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await analyzePreferencesResponse(
      request({ text: `${sensitive} đi xe máy 3 ngày` }),
      dependencies,
    );
    const body = await json(response);

    expect(response.status).toBe(status);
    expect(body.error.code).toBe(code);
    expect(body.error.message).not.toContain("PROVIDER_");
    expect(body.error.message).not.toContain(sensitive);
    expect(JSON.stringify(log.mock.calls)).not.toContain(sensitive);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("logs only safe metadata and never calls a database outside authorization", async () => {
    const databaseRead = vi.fn(
      async (): Promise<{ id: string; role: "TRAVELER" | "ADMIN" }> => ({
        id: "traveler-1",
        role: "TRAVELER",
      }),
    );
    const dependencies = fakeDependencies();
    dependencies.authorization = fakeAuthorization("TRAVELER", databaseRead);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    dependencies.llm.complete = vi.fn(async () => {
      throw new PreferenceExtractionError("PROVIDER_TIMEOUT");
    });
    const secretText = "đừng ghi văn bản riêng tư này";
    await analyzePreferencesResponse(
      request({ text: `${secretText} đi xe máy 3 ngày` }),
      dependencies,
    );

    expect(databaseRead).toHaveBeenCalledOnce();
    expect(JSON.stringify(log.mock.calls)).not.toContain(secretText);
    expect(log.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        code: "AI_UNAVAILABLE",
        latencyMs: 0,
        inputLength: expect.any(Number),
      }),
    );
  });

  it.each([
    ["https://evil.invalid", "INVALID_ORIGIN"],
    [ORIGIN, "INVALID_ORIGIN"],
  ])("rejects unsafe POST origin/fetch-site: %s", async (origin, code) => {
    const dependencies = fakeDependencies();
    const bodyRead = vi.fn();
    dependencies.onBodyRead = bodyRead;
    const headers: Record<string, string> =
      origin === ORIGIN
        ? { "Sec-Fetch-Site": "cross-site" }
        : { Origin: origin };
    const response = await analyzePreferencesResponse(
      request({ text: "đi xe máy 3 ngày" }, headers),
      dependencies,
    );
    const body = await json(response);

    expect(response.status).toBe(403);
    expect(body.error.code).toBe(code);
    expect(bodyRead).not.toHaveBeenCalled();
    expect(dependencies.llm.complete).not.toHaveBeenCalled();
  });
});
