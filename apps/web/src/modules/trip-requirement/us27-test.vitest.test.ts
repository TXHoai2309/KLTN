import { describe, expect, it } from "vitest";

import type { AuthorizationDependencies } from "@/server/authorization/guard";
import {
  extractionResultSchema,
  modelOutputSchema,
  normalizePreferenceInput,
  type ExtractionResult,
  type ModelOutput,
} from "../preference-extraction/preference-extraction-contract";
import { tripRequirementInputSchema } from "./trip-requirement-contract";
import { extractPreferences } from "../preference-extraction/preference-extraction-service";
import {
  analyzePreferencesResponse,
  type PreferenceAnalyzeDependencies,
} from "../preference-extraction/preference-extraction-http";
import { preferenceUtterances, type PreferenceUtteranceFixture } from "../preference-extraction/__fixtures__/utterances";
import { applyExtractionToForm } from "../preference-extraction/apply-extraction";
import {
  clarificationRequestSchema,
  deriveClarificationsFromCheck,
  deriveClarificationsFromExtraction,
  downgradeContradictions,
} from "./trip-clarification-rules";
import { assertTripRequirementClear } from "./trip-clarification-server";
import { checkTripRequirementResponse } from "./trip-requirement-check-http";
import { checkTripRequirement } from "./trip-requirement-check";
import {
  canConfirm,
  mergeClarificationRequests,
} from "./trip-clarification-logic";
import {
  draftFromExtraction,
  draftFromFormFields,
} from "./trip-requirement-review";
import { assertStartDateForFinalConfirmation } from "./trip-requirement-readiness";
import type { TripRequirementFormFields } from "./trip-requirement-form-logic";
import { assertSupportedTransportValue } from "./trip-transport-policy";

const NOW = new Date("2026-10-12T03:00:00Z");
const ORIGIN = "http://localhost";

const emptyFields: TripRequirementFormFields = {
  startDate: "",
  durationDays: "",
  transport: "",
  companionType: "",
  companionGroupSize: "",
  interests: [],
  pace: "",
  mobilityFlags: [],
  mobilityNote: "",
};

const completeFields: TripRequirementFormFields = {
  ...emptyFields,
  startDate: "2026-10-20",
  durationDays: "3",
  transport: "CAR",
};

const preliminaryCandidate = tripRequirementInputSchema.parse({
  startDate: null,
  durationDays: 3,
  transport: "CAR",
  companions: null,
  interests: [],
  pace: null,
  mobilityConstraints: null,
});

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

function sourceFor(text: string): string {
  return [...normalizePreferenceInput(text)].slice(0, 180).join("");
}

function modelOutputFor(fixture: PreferenceUtteranceFixture): ModelOutput {
  const sourceText = sourceFor(fixture.text);
  const fields = {
    startDate: fieldOutput(fixture, "startDate", sourceText),
    durationDays: fieldOutput(fixture, "durationDays", sourceText),
    transport: fieldOutput(fixture, "transport", sourceText),
    companions: fieldOutput(fixture, "companions", sourceText),
    interests: fieldOutput(fixture, "interests", sourceText),
    pace: fieldOutput(fixture, "pace", sourceText),
    mobilityConstraints: fieldOutput(fixture, "mobilityConstraints", sourceText),
  };
  return modelOutputSchema.parse({ fields }) as ModelOutput;
}

function fieldOutput(
  fixture: PreferenceUtteranceFixture,
  field: keyof PreferenceUtteranceFixture["expected"],
  sourceText: string,
) {
  const expected = fixture.expected[field];
  return expected.status === "MISSING"
    ? missing()
    : expected.status === "EXTRACTED"
      ? extracted(expected.value, sourceText)
      : { status: expected.status, value: null, sourceText, note: null };
}

async function extractFixture(fixture: PreferenceUtteranceFixture): Promise<ExtractionResult> {
  return extractPreferences(fixture.text, {
    llm: {
      complete: async () => ({
        rawText: JSON.stringify(modelOutputFor(fixture)),
        model: "us27-fixture-model",
      }),
    },
    now: () => NOW,
    nowMs: () => 1_000,
  });
}

function authorization(role: "TRAVELER" | "ADMIN" | null): AuthorizationDependencies {
  return {
    database: {
      user: {
        findUnique: async () => role === null ? null : { id: "traveler-us27", role },
      },
    } as never,
    resolveSession: async () => role === null ? null : { user: { id: "traveler-us27", role } },
  };
}

function analyzeDependencies(fixture: PreferenceUtteranceFixture): PreferenceAnalyzeDependencies {
  return {
    authorization: authorization("TRAVELER"),
    llm: {
      complete: async () => ({ rawText: JSON.stringify(modelOutputFor(fixture)), model: "us27-fixture-model" }),
    },
    now: () => NOW,
    nowMs: () => 1_000,
  };
}

function analyzeRequest(text: string): Request {
  return new Request(`${ORIGIN}/api/trip-requirements/analyze`, {
    method: "POST",
    headers: {
      Origin: ORIGIN,
      "Sec-Fetch-Site": "same-origin",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });
}

function checkRequest(payload: unknown): Request {
  return new Request(`${ORIGIN}/api/trip-requirements/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function verifiedExtraction(overrides: Partial<ExtractionResult["fields"]> = {}): ExtractionResult {
  return extractionResultSchema.parse({
    fields: {
      startDate: extracted("2026-10-20", "20/10/2026"),
      durationDays: extracted(3, "3 ngày"),
      transport: extracted("CAR", "ô tô"),
      companions: extracted({ type: "COUPLE", groupSize: 2 }, "cặp đôi 2 người"),
      interests: extracted(["NATURE"], "thiên nhiên"),
      pace: extracted("MODERATE", "vừa phải"),
      mobilityConstraints: extracted({ flags: [], note: null }, "không có ràng buộc"),
      ...overrides,
    },
    clarifications: [],
    missingRequired: [],
    meta: { model: "us27-test", latencyMs: 0, inputLength: 20 },
  });
}

function contradictoryModelOutput(): ModelOutput {
  return {
    fields: {
      startDate: extracted("2026-10-20", "20/10/2026"),
      durationDays: extracted(3, "2-3 ngày"),
      transport: extracted("CAR", "xe máy hoặc ô tô"),
      companions: missing(),
      interests: missing(),
      pace: missing(),
      mobilityConstraints: missing(),
    },
  };
}

async function responseJson(response: Response): Promise<Record<string, any>> {
  return response.json() as Promise<Record<string, any>>;
}

describe("US27-TEST missing required fields across engine/API/gate/FE", () => {
  it("keeps missing duration blocking from US25 extraction through /analyze and the FE gate", async () => {
    const fixture = preferenceUtterances.find((item) => item.id === "missing-02")!;
    const extraction = await extractFixture(fixture);
    expect(extraction.fields.durationDays).toMatchObject({ status: "MISSING", value: null });
    const extractionRequest = deriveClarificationsFromExtraction(extraction).find((item) => item.field === "durationDays");
    expect(extractionRequest).toMatchObject({
      id: "durationDays:MISSING",
      severity: "BLOCKING",
      question: "Bạn muốn chuyến đi kéo dài bao nhiêu ngày?",
      hint: "Nhập số nguyên từ 1 đến 14 ngày.",
    });

    const analyze = await analyzePreferencesResponse(analyzeRequest(fixture.text), analyzeDependencies(fixture));
    const analyzeBody = await responseJson(analyze);
    expect(analyze.status).toBe(200);
    expect(analyzeBody.data.clarificationRequests).toContainEqual(expect.objectContaining({ id: "durationDays:MISSING", severity: "BLOCKING" }));

    const missingTransport = preferenceUtterances.find((item) => item.id === "missing-01")!;
    const analyzeTransport = await analyzePreferencesResponse(analyzeRequest(missingTransport.text), analyzeDependencies(missingTransport));
    const analyzeTransportBody = await responseJson(analyzeTransport);
    expect(analyzeTransportBody.data.clarificationRequests).toContainEqual(expect.objectContaining({ id: "transport:MISSING", severity: "BLOCKING" }));

    const check = checkTripRequirement({ startDate: null, transport: "CAR" }, NOW);
    expect(check.issues).toContainEqual(expect.objectContaining({ field: "durationDays", code: "MISSING_REQUIRED" }));
    expect(deriveClarificationsFromCheck(check)).toContainEqual(expect.objectContaining({ id: "durationDays:MISSING", severity: "BLOCKING" }));
    expect(() => assertTripRequirementClear({ startDate: null, transport: "CAR" }, NOW)).toThrowError(
      expect.objectContaining({ code: "TRIP_REQUIREMENT_UNCLEAR", status: 422 }),
    );

    const blockedDraft = draftFromFormFields({ ...completeFields, durationDays: "" });
    const blocking = deriveClarificationsFromCheck(check);
    expect(mergeClarificationRequests(blocking, [], { draft: blockedDraft }, NOW)).toHaveLength(1);
    const resolvedDraft = draftFromFormFields(completeFields);
    expect(mergeClarificationRequests(blocking, [], { draft: resolvedDraft }, NOW)).toEqual([]);
    expect(canConfirm([], { acknowledged: true, editingKey: null, isChecking: false })).toBe(true);
  });

  it("keeps missing transport blocking, ordered after duration, until the user explicitly chooses", async () => {
    const fixture = preferenceUtterances.find((item) => item.id === "missing-01")!;
    const extraction = await extractFixture(fixture);
    expect(extraction.fields.transport).toMatchObject({ status: "MISSING", value: null, sourceText: null });
    const request = deriveClarificationsFromExtraction(extraction).find((item) => item.field === "transport");
    expect(request).toMatchObject({
      id: "transport:MISSING",
      severity: "BLOCKING",
      resolution: {
        type: "CHOOSE_ONE",
        options: [{ value: "MOTORCYCLE", label: "Xe máy" }, { value: "CAR", label: "Ô tô" }],
      },
    });
    expect(request?.resolution).not.toHaveProperty("selected");
    expect(request?.resolution).not.toHaveProperty("default");

    const bothMissing = checkTripRequirement({ startDate: null }, NOW);
    expect(bothMissing.issues.map((issue) => issue.field)).toEqual(["durationDays", "transport"]);
    expect(deriveClarificationsFromCheck(bothMissing).map((item) => item.id)).toEqual([
      "durationDays:MISSING",
      "transport:MISSING",
    ]);
    expect(() => assertTripRequirementClear({ startDate: null }, NOW)).toThrowError(
      expect.objectContaining({ code: "TRIP_REQUIREMENT_UNCLEAR", status: 422 }),
    );

    const transportBlocking = deriveClarificationsFromCheck(bothMissing).filter((item) => item.field === "transport");
    const unresolved = draftFromFormFields({ ...completeFields, durationDays: "", transport: "" });
    expect(mergeClarificationRequests(transportBlocking, [], { draft: unresolved }, NOW)).toHaveLength(1);
    const chosen = draftFromFormFields({ ...completeFields, durationDays: "3", transport: "MOTORCYCLE" });
    expect(mergeClarificationRequests(transportBlocking, [], { draft: chosen }, NOW)).toEqual([]);
    expect(applyExtractionToForm(emptyFields, extraction).fields.transport).toBe("");
  });

  it.each(["0", "15", "2.5", "abc"])("does not let invalid duration %s pass the check", (durationDays) => {
    const result = checkTripRequirement({ startDate: null, durationDays, transport: "CAR" }, NOW);
    expect(result.confirmable).toBe(false);
    expect(result.issues.find((issue) => issue.field === "durationDays")?.code).toBe("INVALID_VALUE");
  });
});

describe("US27-TEST unsupported and ambiguous transport", () => {
  it("covers the US25 fixture corpus without producing a canonical transport", async () => {
    const unsupportedIds = ["unsupported-01", "unsupported-02", "unsupported-03", "unsupported-04"];
    const ambiguousIds = ["ambiguous-01", "ambiguous-02"];
    for (const id of [...unsupportedIds, ...ambiguousIds]) {
      const fixture = preferenceUtterances.find((item) => item.id === id)!;
      const extraction = await extractFixture(fixture);
      expect(extraction.fields.transport.value, id).toBeNull();
      expect(extraction.fields.transport.sourceText, id).toContain(sourceFor(fixture.text).slice(0, 20));
      expect(extraction.fields.transport.status, id).toBe(unsupportedIds.includes(id) ? "UNSUPPORTED" : "AMBIGUOUS");
      expect(deriveClarificationsFromExtraction(extraction), id).toContainEqual(expect.objectContaining({
        field: "transport",
        severity: "BLOCKING",
      }));
      expect(draftFromExtraction(extraction).fields.transport.value, id).toBeNull();
      expect(applyExtractionToForm(emptyFields, extraction).fields.transport, id).toBe("");
    }

    const fixture = preferenceUtterances.find((item) => item.id === "unsupported-01")!;
    const analyze = await analyzePreferencesResponse(analyzeRequest(fixture.text), analyzeDependencies(fixture));
    const body = await responseJson(analyze);
    expect(body.data.result.fields.transport).toMatchObject({ status: "UNSUPPORTED", value: null });
    expect(body.data.clarificationRequests).toContainEqual(expect.objectContaining({ id: "transport:UNSUPPORTED", severity: "BLOCKING" }));
  });

  it("downgrades model/source mismatches and rejects invalid model values", () => {
    const bicycle = downgradeContradictions(verifiedExtraction({
      transport: extracted("CAR", "xe đạp"),
    }));
    expect(bicycle.fields.transport).toMatchObject({ status: "UNSUPPORTED", value: null, sourceText: "xe đạp" });
    expect(bicycle.clarifications).toContainEqual(expect.objectContaining({ field: "transport", reason: "UNSUPPORTED_TRANSPORT" }));

    const ambiguous = downgradeContradictions(verifiedExtraction({
      transport: extracted("MOTORCYCLE", "đi xe"),
    }));
    expect(ambiguous.fields.transport).toMatchObject({ status: "AMBIGUOUS", value: null, sourceText: "đi xe" });
    expect(ambiguous.clarifications).toContainEqual(expect.objectContaining({ field: "transport", reason: "AMBIGUOUS_TRANSPORT" }));

    for (const value of ["AIRPLANE", "BICYCLE", "car", 123]) {
      expect(() => assertSupportedTransportValue(value)).toThrowError(
        expect.objectContaining({ code: "TRANSPORT_UNSUPPORTED", status: 422 }),
      );
    }
  });

  it("blocks unsupported transport at /check and at the planner gate", async () => {
    const check = checkTripRequirement({ startDate: null, durationDays: 3, transport: "BICYCLE" }, NOW);
    expect(check.confirmable).toBe(false);
    expect(check.issues).toContainEqual(expect.objectContaining({ field: "transport", code: "TRANSPORT_UNSUPPORTED" }));
    expect(deriveClarificationsFromCheck(check)).toContainEqual(expect.objectContaining({
      id: "transport:UNSUPPORTED",
      severity: "BLOCKING",
    }));
    expect(() => assertTripRequirementClear({ startDate: null, durationDays: 3, transport: "BICYCLE" }, NOW)).toThrowError(
      expect.objectContaining({ code: "TRIP_REQUIREMENT_UNCLEAR", status: 422 }),
    );

    const response = await checkTripRequirementResponse(
      checkRequest({ startDate: null, durationDays: 3, transport: "BICYCLE" }),
      {
        authorization: authorization("TRAVELER"),
        now: () => NOW,
      },
    );
    const body = await responseJson(response);
    expect(response.status).toBe(200);
    expect(body.data.confirmable).toBe(false);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});

describe("US27-TEST contradiction and confirmation safety", () => {
  it("blocks contradictory duration and transport while preserving safe optional date conflict", () => {
    const extraction = downgradeContradictions(verifiedExtraction({
      durationDays: extracted(3, "2-3 ngày"),
      startDate: extracted("2026-10-20", "20/10/2026 hoặc 22/10/2026"),
      transport: extracted("CAR", "xe máy hoặc ô tô"),
    }));
    expect(extraction.fields.durationDays.value).toBeNull();
    expect(extraction.fields.transport.value).toBeNull();
    expect(extraction.fields.startDate.value).toBeNull();
    expect(extraction.clarifications.map((item) => `${item.field}:${item.reason}`)).toEqual([
      "durationDays:AMBIGUOUS_DURATION",
      "startDate:CONFLICT",
      "transport:CONFLICT",
    ]);

    const requests = deriveClarificationsFromExtraction(extraction);
    expect(requests.find((item) => item.field === "durationDays")?.severity).toBe("BLOCKING");
    expect(requests.find((item) => item.field === "transport")?.severity).toBe("BLOCKING");
    expect(requests.find((item) => item.field === "startDate")?.severity).toBe("ADVISORY");
    expect(requests.every((item) => clarificationRequestSchema.safeParse(item).success)).toBe(true);
    expect(canConfirm(requests, { acknowledged: true, editingKey: null, isChecking: false })).toBe(false);
  });

  it("returns contradictory extraction requests through the analyze API", async () => {
    const response = await analyzePreferencesResponse(
      analyzeRequest("2-3 ngày đi xe máy hoặc ô tô"),
      {
        authorization: authorization("TRAVELER"),
        llm: { complete: async () => ({ rawText: JSON.stringify(contradictoryModelOutput()), model: "us27-conflict" }) },
        now: () => NOW,
        nowMs: () => 1_000,
      },
    );
    const body = await responseJson(response);
    expect(response.status).toBe(200);
    expect(body.data.result.fields.durationDays).toMatchObject({ status: "AMBIGUOUS", value: null });
    expect(body.data.result.fields.transport).toMatchObject({ status: "AMBIGUOUS", value: null });
    expect(body.data.clarificationRequests).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "durationDays:AMBIGUOUS", severity: "BLOCKING" }),
      expect.objectContaining({ id: "transport:CONFLICT", severity: "BLOCKING" }),
    ]));
  });

  it("keeps the gate closed for errors, open for advisory-only warnings, and preserves the start-date guard", () => {
    const conflict = checkTripRequirement({
      startDate: null,
      durationDays: 3,
      transport: "CAR",
      companions: { type: "SOLO", groupSize: 1 },
      mobilityConstraints: { flags: ["YOUNG_CHILDREN"], note: null },
    }, NOW);
    expect(conflict.confirmable).toBe(false);
    expect(canConfirm(deriveClarificationsFromCheck(conflict), { acknowledged: true, editingKey: null, isChecking: false })).toBe(false);

    const warning = checkTripRequirement({
      startDate: null,
      durationDays: 3,
      transport: "CAR",
      pace: "PACKED",
      mobilityConstraints: { flags: ["AVOID_LONG_WALKING"], note: null },
    }, NOW);
    expect(warning.confirmable).toBe(true);
    expect(deriveClarificationsFromCheck(warning)).toMatchObject([{ severity: "ADVISORY", id: "pace:CONFLICT" }]);
    expect(canConfirm(deriveClarificationsFromCheck(warning), { acknowledged: true, editingKey: null, isChecking: false })).toBe(true);

    expect(() => assertStartDateForFinalConfirmation(preliminaryCandidate, NOW)).toThrowError(
      expect.objectContaining({ code: "TRIP_START_DATE_REQUIRED", status: 422 }),
    );
    expect(() => assertStartDateForFinalConfirmation({ ...preliminaryCandidate, startDate: "2026-10-08" }, NOW)).toThrowError(
      expect.objectContaining({ code: "TRIP_START_DATE_IN_PAST", status: 422 }),
    );
  });

  it("keeps a source/model transport mismatch out of a review draft until user choice", () => {
    const extraction = downgradeContradictions(verifiedExtraction({ transport: extracted("CAR", "xe đạp") }));
    const draft = draftFromExtraction(extraction);
    expect(draft.fields.transport).toMatchObject({ value: null, aiValue: null, aiStatus: "UNSUPPORTED", sourceText: "xe đạp" });
    expect(draftFromFormFields({ ...completeFields, transport: "MOTORCYCLE" }).fields.transport.value).toBe("MOTORCYCLE");
  });
});

