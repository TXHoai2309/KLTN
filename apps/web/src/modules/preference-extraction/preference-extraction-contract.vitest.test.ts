import { describe, expect, it } from "vitest";

import {
  MAX_PREFERENCE_INPUT_LENGTH,
  MAX_SOURCE_TEXT_LENGTH,
  MIN_PREFERENCE_INPUT_LENGTH,
  assertStrictModelJsonSchema,
  extractionResultSchema,
  modelOutputJsonSchema,
  modelOutputSchema,
  preferenceInputSchema,
  verifyModelOutput,
} from "./preference-extraction-contract";

const extracted = <T>(value: T, sourceText = "người dùng nói rõ") => ({
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

const validModelOutput = () => ({
  fields: {
    startDate: extracted("2026-12-24", "24/12/2026"),
    durationDays: extracted(3, "3 ngày 2 đêm"),
    transport: extracted("MOTORCYCLE", "xe máy"),
    companions: extracted({ type: "FAMILY", groupSize: 4 }, "gia đình 4 người"),
    interests: extracted(["NATURE", "FOOD", "NATURE"], "thiên nhiên và ẩm thực"),
    pace: extracted("RELAXED", "thong thả"),
    mobilityConstraints: extracted(
      { flags: ["YOUNG_CHILDREN"], note: "có em bé" },
      "có em bé",
    ),
  },
});

describe("preference-extraction-contract", () => {
  it("generates a strict Structured Outputs schema", () => {
    expect(() => assertStrictModelJsonSchema(modelOutputJsonSchema)).not.toThrow();
    expect(modelOutputJsonSchema).not.toHaveProperty("$schema");
    expect(modelOutputJsonSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["fields"],
    });
  });

  it("rejects extra keys and invalid status/value/sourceText combinations", () => {
    expect(() =>
      modelOutputSchema.parse({
        ...validModelOutput(),
        extra: true,
      }),
    ).toThrow();
    expect(() =>
      modelOutputSchema.parse({
        fields: {
          ...validModelOutput().fields,
          transport: {
            status: "UNKNOWN",
            value: null,
            sourceText: "xe",
            note: null,
          },
        },
      }),
    ).toThrow();
    expect(() =>
      modelOutputSchema.parse({
        fields: {
          ...validModelOutput().fields,
          durationDays: {
            status: "EXTRACTED",
            value: null,
            sourceText: "ba ngày",
            note: null,
          },
        },
      }),
    ).toThrow();
  });

  it("verifies a valid raw model result through the US-24 values", () => {
    const result = verifyModelOutput(validModelOutput(), {
      model: "pending-owner-model",
      latencyMs: 42,
      inputLength: 87,
    });

    expect(result.fields.durationDays).toMatchObject({ status: "EXTRACTED", value: 3 });
    expect(result.fields.interests).toMatchObject({
      status: "EXTRACTED",
      value: ["NATURE", "FOOD"],
    });
    expect(result.missingRequired).toEqual([]);
    expect(result.clarifications).toEqual([]);
    expect(result.meta).toEqual({
      model: "pending-owner-model",
      latencyMs: 42,
      inputLength: 87,
    });
  });

  it("converts invalid model values to a non-success status instead of inventing enums", () => {
    const result = verifyModelOutput(
      {
        fields: {
          ...validModelOutput().fields,
          transport: extracted("BICYCLE", "đi xe đạp"),
          durationDays: extracted("2-3", "2-3 ngày"),
          companions: extracted({ type: "COUPLE", groupSize: 5 }, "cặp đôi 5 người"),
        },
      },
      { model: "pending-owner-model", latencyMs: 1, inputLength: 20 },
    );

    expect(result.fields.transport.status).toBe("UNSUPPORTED");
    expect(result.fields.durationDays.status).toBe("AMBIGUOUS");
    expect(result.fields.companions.status).toBe("AMBIGUOUS");
    expect(result.missingRequired).toEqual(["durationDays", "transport"]);
    expect(result.clarifications.map((item) => item.reason)).toEqual([
      "AMBIGUOUS_DURATION",
      "UNSUPPORTED_TRANSPORT",
      "CONFLICT",
    ]);
  });

  it("enforces result-field status invariants", () => {
    const result = verifyModelOutput(
      {
        fields: {
          ...validModelOutput().fields,
          startDate: missing(),
        },
      },
      { model: "pending-owner-model", latencyMs: 1, inputLength: 20 },
    );
    expect(result.fields.startDate).toEqual(missing());
    expect(() =>
      extractionResultSchema.parse({
        ...result,
        fields: {
          ...result.fields,
          startDate: {
            status: "EXTRACTED",
            value: null,
            sourceText: "ngày nào đó",
            note: null,
          },
        },
      }),
    ).toThrow();
  });

  it("normalizes the proposed input boundary without persisting raw text", () => {
    expect(preferenceInputSchema.parse("  Đi Ha\u0300 Giang  ")).toBe("Đi Hà Giang");
    expect(preferenceInputSchema.safeParse("1234").success).toBe(false);
    expect(preferenceInputSchema.safeParse("a".repeat(MAX_PREFERENCE_INPUT_LENGTH + 1)).success).toBe(
      false,
    );
    expect(MIN_PREFERENCE_INPUT_LENGTH).toBe(5);
    expect(MAX_PREFERENCE_INPUT_LENGTH).toBe(1000);
    expect(MAX_SOURCE_TEXT_LENGTH).toBe(200);
  });
});
