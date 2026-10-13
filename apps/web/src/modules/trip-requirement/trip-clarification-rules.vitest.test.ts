import { describe, expect, it } from "vitest";

import { AppError } from "@/server/http/app-error";
import {
  extractionResultSchema,
  type ExtractionResult,
  type ModelOutput,
} from "../preference-extraction/preference-extraction-contract";
import { extractPreferences } from "../preference-extraction/preference-extraction-service";
import {
  clarificationRequestSchema,
  deriveClarificationsFromCheck,
  deriveClarificationsFromExtraction,
  downgradeContradictions,
} from "./trip-clarification-rules";
import { assertTripRequirementClear } from "./trip-clarification-server";
import { checkTripRequirement } from "./trip-requirement-check";

const NOW = new Date("2026-10-12T03:00:00Z");

const baseValues = {
  startDate: "2026-10-20",
  durationDays: 3,
  transport: "CAR",
  companions: { type: "COUPLE", groupSize: 2 },
  interests: ["NATURE"],
  pace: "MODERATE",
  mobilityConstraints: { flags: [], note: null },
} as const;

function extracted<T>(value: T, sourceText: string) {
  return { status: "EXTRACTED" as const, value, sourceText, note: null };
}

function extractionWith(
  field: keyof typeof baseValues,
  status: "EXTRACTED" | "AMBIGUOUS" | "MISSING" | "UNSUPPORTED",
  reason?: "AMBIGUOUS_TRANSPORT" | "UNSUPPORTED_TRANSPORT" | "AMBIGUOUS_DATE" | "AMBIGUOUS_DURATION" | "OUT_OF_RANGE" | "CONFLICT" | "OTHER",
): ExtractionResult {
  const values = {
    startDate: extracted(baseValues.startDate, "ngày 20/10/2026"),
    durationDays: extracted(baseValues.durationDays, "3 ngày"),
    transport: extracted(baseValues.transport, "ô tô"),
    companions: extracted(baseValues.companions, "cặp đôi 2 người"),
    interests: extracted(baseValues.interests, "thiên nhiên"),
    pace: extracted(baseValues.pace, "vừa phải"),
    mobilityConstraints: extracted(baseValues.mobilityConstraints, "không có ràng buộc"),
  };
  const sourceByField = {
    startDate: "ngày mai",
    durationDays: "chưa rõ số ngày",
    transport: "xe đạp",
    companions: "cặp đôi 5 người",
    interests: "sở thích không rõ",
    pace: "đi thế nào cũng được",
    mobilityConstraints: "ràng buộc chưa rõ",
  } as const;

  if (status === "MISSING") {
    values[field] = { status, value: null, sourceText: null, note: null } as never;
  } else if (status !== "EXTRACTED") {
    values[field] = {
      status,
      value: null,
      sourceText: sourceByField[field],
      note: "Cần người dùng làm rõ.",
    } as never;
  }

  const missingRequired = (["durationDays", "transport"] as const).filter(
    (requiredField) => values[requiredField].status !== "EXTRACTED",
  );
  const clarifications = reason
    ? [{
        field,
        reason,
        message: "Thông tin cần được làm rõ.",
        sourceText: sourceByField[field],
      }]
    : [];

  return extractionResultSchema.parse({
    fields: values,
    clarifications,
    missingRequired,
    meta: { model: "rules-test", latencyMs: 0, inputLength: 20 },
  });
}

function fullExtraction(overrides: Partial<ExtractionResult["fields"]> = {}): ExtractionResult {
  return extractionResultSchema.parse({
    fields: {
      startDate: extracted(baseValues.startDate, "ngày 20/10/2026"),
      durationDays: extracted(baseValues.durationDays, "3 ngày"),
      transport: extracted(baseValues.transport, "ô tô"),
      companions: extracted(baseValues.companions, "cặp đôi 2 người"),
      interests: extracted(baseValues.interests, "thiên nhiên"),
      pace: extracted(baseValues.pace, "vừa phải"),
      mobilityConstraints: extracted(baseValues.mobilityConstraints, "không có ràng buộc"),
      ...overrides,
    },
    clarifications: [],
    missingRequired: [],
    meta: { model: "rules-test", latencyMs: 0, inputLength: 20 },
  });
}

function missingModelField() {
  return { status: "MISSING" as const, value: null, sourceText: null, note: null };
}

function extractedModelField<T>(value: T, sourceText: string) {
  return { status: "EXTRACTED" as const, value, sourceText, note: null };
}

describe("US27 clarification rules", () => {
  it("covers all seven fields across extracted, missing, ambiguous and unsupported states", () => {
    const fields = ["startDate", "durationDays", "companions", "interests", "pace", "transport", "mobilityConstraints"] as const;
    for (const field of fields) {
      expect(deriveClarificationsFromExtraction(extractionWith(field, "EXTRACTED"))).toEqual([]);
      expect(deriveClarificationsFromExtraction(extractionWith(field, "MISSING"))).toEqual(
        field === "durationDays" || field === "transport"
          ? [expect.objectContaining({ field, kind: "MISSING", severity: "BLOCKING" })]
          : [],
      );

      const ambiguous = deriveClarificationsFromExtraction(
        extractionWith(field, "AMBIGUOUS", field === "transport" ? "AMBIGUOUS_TRANSPORT" : field === "durationDays" ? "AMBIGUOUS_DURATION" : "OTHER"),
      );
      expect(ambiguous).toHaveLength(1);
      expect(ambiguous[0]).toMatchObject({ field, kind: "AMBIGUOUS" });
      expect(ambiguous[0]?.severity).toBe(field === "durationDays" || field === "transport" ? "BLOCKING" : "ADVISORY");

      const unsupported = deriveClarificationsFromExtraction(
        extractionWith(field, "UNSUPPORTED", field === "transport" ? "UNSUPPORTED_TRANSPORT" : field === "durationDays" ? "OUT_OF_RANGE" : "OTHER"),
      );
      expect(unsupported).toHaveLength(1);
      expect(unsupported[0]).toMatchObject({ field, kind: field === "durationDays" ? "OUT_OF_RANGE" : "UNSUPPORTED" });
      expect(unsupported[0]?.severity).toBe(field === "durationDays" || field === "transport" ? "BLOCKING" : "ADVISORY");
    }
  });

  it("derives blocking required and advisory optional requests from extraction status", () => {
    const requiredMissing = deriveClarificationsFromExtraction(extractionWith("durationDays", "MISSING"));
    expect(requiredMissing).toMatchObject([
      { id: "durationDays:MISSING", field: "durationDays", severity: "BLOCKING", resolution: { type: "ENTER_VALUE" } },
    ]);

    const transportUnsupported = deriveClarificationsFromExtraction(
      extractionWith("transport", "UNSUPPORTED", "UNSUPPORTED_TRANSPORT"),
    );
    expect(transportUnsupported).toMatchObject([
      {
        id: "transport:UNSUPPORTED",
        severity: "BLOCKING",
        resolution: {
          type: "CHOOSE_ONE",
          options: [{ value: "MOTORCYCLE", label: "Xe máy" }, { value: "CAR", label: "Ô tô" }],
        },
      },
    ]);
    expect(transportUnsupported[0]?.resolution).not.toHaveProperty("selected");
    expect(transportUnsupported[0]?.resolution).not.toHaveProperty("default");

    const optionalMissing = deriveClarificationsFromExtraction(extractionWith("pace", "MISSING"));
    expect(optionalMissing).toEqual([]);
    const optionalAmbiguous = deriveClarificationsFromExtraction(extractionWith("pace", "AMBIGUOUS", "OTHER"));
    expect(optionalAmbiguous).toMatchObject([{ id: "pace:AMBIGUOUS", severity: "ADVISORY" }]);
    const optionalUnsupported = deriveClarificationsFromExtraction(extractionWith("interests", "UNSUPPORTED", "OTHER"));
    expect(optionalUnsupported).toMatchObject([{ id: "interests:UNSUPPORTED", severity: "ADVISORY", resolution: { type: "SKIP_ALLOWED" } }]);
  });

  it.each([
    ["durationDays", "AMBIGUOUS", "AMBIGUOUS_DURATION", "AMBIGUOUS"],
    ["durationDays", "UNSUPPORTED", "OUT_OF_RANGE", "OUT_OF_RANGE"],
    ["transport", "AMBIGUOUS", "AMBIGUOUS_TRANSPORT", "AMBIGUOUS"],
    ["transport", "UNSUPPORTED", "UNSUPPORTED_TRANSPORT", "UNSUPPORTED"],
    ["companions", "AMBIGUOUS", "CONFLICT", "CONFLICT"],
  ] as const)("uses the single extraction reason mapping for %s/%s", (field, status, reason, expectedKind) => {
    const request = deriveClarificationsFromExtraction(
      extractionWith(field as keyof typeof baseValues, status, reason),
    )[0];
    expect(request).toMatchObject({ kind: expectedKind });
  });

  it("sorts blocking before advisory and removes duplicate ids", () => {
    const extraction = extractionWith("durationDays", "MISSING");
    const withDuplicates = {
      ...extraction,
      fields: {
        ...extraction.fields,
        pace: { status: "AMBIGUOUS" as const, value: null, sourceText: "nhịp độ chưa rõ", note: null },
      },
      clarifications: [
        { field: "durationDays" as const, reason: "AMBIGUOUS_DURATION" as const, message: "x", sourceText: "3 hoặc 4 ngày" },
        { field: "durationDays" as const, reason: "AMBIGUOUS_DURATION" as const, message: "y", sourceText: "3 hoặc 4 ngày" },
        { field: "pace" as const, reason: "OTHER" as const, message: "x", sourceText: "nhịp độ chưa rõ" },
      ],
    };
    const requests = deriveClarificationsFromExtraction(withDuplicates);
    expect(requests.map((request) => request.id)).toEqual(["durationDays:MISSING", "pace:AMBIGUOUS"]);
  });

  it("creates a blocking companion conflict but keeps optional missing fields quiet", () => {
    const result = deriveClarificationsFromExtraction(extractionWith("companions", "AMBIGUOUS", "CONFLICT"));
    expect(result).toMatchObject([{ id: "companions:CONFLICT", severity: "BLOCKING", resolution: { type: "ENTER_VALUE" } }]);
    expect(deriveClarificationsFromExtraction(extractionWith("startDate", "MISSING"))).toEqual([]);
  });

  it.each([
    ["MISSING_REQUIRED", "durationDays", "MISSING", "BLOCKING"],
    ["INVALID_VALUE", "durationDays", "OUT_OF_RANGE", "BLOCKING"],
    ["TRANSPORT_UNSUPPORTED", "transport", "UNSUPPORTED", "BLOCKING"],
    ["START_DATE_INVALID", "startDate", "INVALID", "BLOCKING"],
    ["START_DATE_IN_PAST", "startDate", "INVALID", "BLOCKING"],
    ["COMPANIONS_CONFLICT_CHILDREN", "companions", "CONFLICT", "BLOCKING"],
    ["PACE_MOBILITY_MISMATCH", "pace", "CONFLICT", "ADVISORY"],
  ] as const)("maps check issue %s", (code, field, kind, severity) => {
    const check = checkTripRequirement(
      code === "MISSING_REQUIRED"
        ? { startDate: null, transport: "CAR" }
        : code === "INVALID_VALUE" && field === "durationDays"
          ? { startDate: null, durationDays: 99, transport: "CAR" }
        : code === "TRANSPORT_UNSUPPORTED"
            ? { startDate: null, durationDays: 3, transport: "BICYCLE" }
            : code === "START_DATE_INVALID"
              ? { startDate: "2026-02-30", durationDays: 3, transport: "CAR" }
              : code === "START_DATE_IN_PAST"
                ? { startDate: "2026-10-08", durationDays: 3, transport: "CAR" }
                : code === "COMPANIONS_CONFLICT_CHILDREN"
                  ? { startDate: null, durationDays: 3, transport: "CAR", companions: { type: "SOLO", groupSize: 1 }, mobilityConstraints: { flags: ["YOUNG_CHILDREN"], note: null } }
                  : { startDate: null, durationDays: 3, transport: "CAR", pace: "PACKED", mobilityConstraints: { flags: ["AVOID_LONG_WALKING"], note: null } },
      NOW,
    );
    const request = deriveClarificationsFromCheck(check).find((item) => item.field === field);
    expect(request).toMatchObject({ kind, severity });
  });

  it("downgrades contradictory duration/date source text without false positives or mutation", () => {
    const contradictory = fullExtraction({
      durationDays: extracted(2, "2-3 ngày"),
      startDate: extracted("2026-10-20", "20/10/2026 hoặc 22/10/2026"),
    });
    const before = structuredClone(contradictory);
    const downgraded = downgradeContradictions(contradictory);
    expect(contradictory).toEqual(before);
    expect(downgraded.fields.durationDays).toMatchObject({ status: "AMBIGUOUS", value: null, sourceText: "2-3 ngày" });
    expect(downgraded.fields.startDate).toMatchObject({ status: "AMBIGUOUS", value: null, sourceText: "20/10/2026 hoặc 22/10/2026" });
    expect(downgraded.clarifications.map((item) => `${item.field}:${item.reason}`)).toEqual([
      "durationDays:AMBIGUOUS_DURATION",
      "startDate:CONFLICT",
    ]);

    for (const sourceText of ["ba ngày", "3 ngày 2 đêm", "một tuần"]) {
      const result = downgradeContradictions(fullExtraction({ durationDays: extracted(3, sourceText) }));
      expect(result.fields.durationDays.status).toBe("EXTRACTED");
    }
    const sameDateDifferentFormat = downgradeContradictions(fullExtraction({
      startDate: extracted("2026-10-20", "20/10/2026 hay 2026-10-20"),
    }));
    expect(sameDateDifferentFormat.fields.startDate.status).toBe("EXTRACTED");
  });

  it("runs downgrade in the US-25 extraction service seam", async () => {
    const model: ModelOutput = {
      fields: {
        startDate: missingModelField(),
        durationDays: extractedModelField(2, "2-3 ngày"),
        transport: missingModelField(),
        companions: missingModelField(),
        interests: missingModelField(),
        pace: missingModelField(),
        mobilityConstraints: missingModelField(),
      },
    };
    const result = await extractPreferences("2-3 ngày", {
      llm: { complete: async () => ({ rawText: JSON.stringify(model), model: "rules-test" }) },
      now: () => NOW,
      nowMs: () => 0,
    });
    expect(result.fields.durationDays).toMatchObject({ status: "AMBIGUOUS", value: null });
    expect(result.missingRequired).toEqual(["durationDays", "transport"]);
    expect(result.clarifications).toContainEqual(expect.objectContaining({ field: "durationDays", reason: "AMBIGUOUS_DURATION" }));
  });

  it("validates the public request shape and keeps sensitive source text out of gate blockers", () => {
    const check = checkTripRequirement({ startDate: null, durationDays: 3, transport: "CAR" }, NOW);
    const request = deriveClarificationsFromCheck(check)[0];
    expect(request).toBeUndefined();
    expect(clarificationRequestSchema.safeParse({
      id: "transport:UNSUPPORTED",
      field: "transport",
      kind: "UNSUPPORTED",
      severity: "BLOCKING",
      question: "Bạn muốn đi bằng xe máy hay ô tô?",
      sourceText: "xe đạp",
      resolution: { type: "CHOOSE_ONE", options: [{ value: "MOTORCYCLE", label: "Xe máy" }, { value: "CAR", label: "Ô tô" }] },
    }).success).toBe(true);

    const sensitive = "GHI_CHU_SUC_KHOE_KHONG_DUOC_DUA_VAO_BLOCKER";
    try {
      assertTripRequirementClear({
        startDate: null,
        transport: "CAR",
        mobilityConstraints: { flags: [], note: sensitive },
      }, NOW);
      throw new Error("expected gate to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({ code: "TRIP_REQUIREMENT_UNCLEAR", status: 422 });
      expect(JSON.stringify((error as AppError).details)).not.toContain(sensitive);
    }
  });

  it("rejects malformed candidates safely and does not invent transport options", () => {
    for (const candidate of [null, [], JSON.parse('{"__proto__":"polluted"}')]) {
      expect(() => assertTripRequirementClear(candidate, NOW)).toThrowError(
        expect.objectContaining({ code: "TRIP_REQUIREMENT_UNCLEAR", status: 422 }),
      );
    }
    const unsupported = deriveClarificationsFromExtraction(extractionWith("transport", "UNSUPPORTED", "UNSUPPORTED_TRANSPORT"))[0];
    expect(unsupported?.resolution).toEqual({
      type: "CHOOSE_ONE",
      options: [
        { value: "MOTORCYCLE", label: "Xe máy" },
        { value: "CAR", label: "Ô tô" },
      ],
    });
  });

  it("opens the gate only for clear data, allows relative days and warnings, and blocks errors", () => {
    expect(assertTripRequirementClear({ startDate: null, durationDays: 3, transport: "CAR" }, NOW)).toMatchObject({
      startDate: null,
      durationDays: 3,
      transport: "CAR",
    });
    expect(assertTripRequirementClear({ startDate: null, durationDays: 3, transport: "CAR", pace: "PACKED", mobilityConstraints: { flags: ["AVOID_LONG_WALKING"], note: null } }, NOW)).toMatchObject({ durationDays: 3 });
    for (const candidate of [
      { startDate: null, transport: "CAR" },
      { startDate: null, durationDays: 3 },
      { startDate: "2026-10-08", durationDays: 3, transport: "CAR" },
      { startDate: null, durationDays: 3, transport: "CAR", companions: { type: "SOLO", groupSize: 1 }, mobilityConstraints: { flags: ["YOUNG_CHILDREN"], note: null } },
    ]) {
      expect(() => assertTripRequirementClear(candidate, NOW)).toThrowError(
        expect.objectContaining({ code: "TRIP_REQUIREMENT_UNCLEAR", status: 422 }),
      );
    }
    try {
      assertTripRequirementClear({ startDate: null }, NOW);
      throw new Error("expected missing blockers");
    } catch (error) {
      expect((error as AppError).details).toMatchObject({ blockers: [
        { id: "durationDays:MISSING", field: "durationDays", kind: "MISSING" },
        { id: "transport:MISSING", field: "transport", kind: "MISSING" },
      ] });
    }
  });
});
