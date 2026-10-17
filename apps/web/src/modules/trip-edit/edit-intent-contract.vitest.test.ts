import { describe, expect, it } from "vitest";

import { assertStrictModelJsonSchema } from "../preference-extraction/preference-extraction-contract";
import {
  EDIT_INTENT_CLARIFICATION_REASON_VALUES,
  EDIT_INTENT_TYPE_VALUES,
  MAX_EDIT_INTENT_AFFECTED_DAYS,
  MAX_EDIT_INTENT_AFFECTED_VISITS,
  MAX_EDIT_INTENT_TARGETS,
  createModelOutputJsonSchema,
  modelOutputSchema,
  type EditIntentModelOutput,
} from "./edit-intent-contract";

function validModelOutput(): EditIntentModelOutput {
  return {
    intentType: "CHANGE_TIME",
    targetVisitIds: ["visit-1"],
    destinationId: null,
    params: {
      dayIndex: null,
      position: null,
      startTime: "09:30",
      durationMinutes: null,
    },
    affected: {
      visitIds: ["visit-1"],
      dayIndexes: [1],
    },
    needsClarification: false,
    clarificationReason: null,
  };
}

function schemaObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected a JSON Schema object.");
  }
  return value as Record<string, unknown>;
}

function containsNullSchema(value: unknown): boolean {
  const schema = schemaObject(value);
  const branches = schema.anyOf;
  return (
    Array.isArray(branches) &&
    branches.some((branch) => schemaObject(branch).type === "null")
  );
}

describe("edit-intent-contract", () => {
  it("defines a closed, fully required Structured Outputs schema with nullable values", () => {
    const modelOutputJsonSchema = createModelOutputJsonSchema({
      serverVisitIds: ["visit-1", "visit-2"],
      serverDestinationIds: ["destination-1"],
    });
    expect(() => assertStrictModelJsonSchema(modelOutputJsonSchema)).not.toThrow();

    const root = schemaObject(modelOutputJsonSchema);
    const rootProperties = schemaObject(root.properties);
    expect([...(root.required as string[])].sort()).toEqual(Object.keys(rootProperties).sort());
    expect(root).not.toHaveProperty("$schema");

    const params = schemaObject(rootProperties.params);
    const paramsProperties = schemaObject(params.properties);
    expect([...(params.required as string[])].sort()).toEqual(
      Object.keys(paramsProperties).sort(),
    );
    expect(containsNullSchema(paramsProperties.dayIndex)).toBe(true);
    expect(containsNullSchema(paramsProperties.position)).toBe(true);
    expect(containsNullSchema(paramsProperties.startTime)).toBe(true);
    expect(containsNullSchema(paramsProperties.durationMinutes)).toBe(true);
    expect(containsNullSchema(rootProperties.destinationId)).toBe(true);
    expect(containsNullSchema(rootProperties.clarificationReason)).toBe(true);

    const intentType = schemaObject(rootProperties.intentType);
    expect(intentType.enum).toEqual([...EDIT_INTENT_TYPE_VALUES]);

    const targetItems = schemaObject(schemaObject(rootProperties.targetVisitIds).items);
    expect(targetItems.enum).toEqual(["visit-1", "visit-2"]);
    const affected = schemaObject(rootProperties.affected);
    const affectedProperties = schemaObject(affected.properties);
    const affectedVisitItems = schemaObject(
      schemaObject(affectedProperties.visitIds).items,
    );
    expect(affectedVisitItems.enum).toEqual(["visit-1", "visit-2"]);

    const destinationBranches = schemaObject(rootProperties.destinationId).anyOf as unknown[];
    expect(destinationBranches.map((branch) => schemaObject(branch).enum).filter(Boolean)).toEqual([
      ["destination-1"],
    ]);
  });

  it("allows no invented IDs when the server supplies empty ID sets", () => {
    const schema = createModelOutputJsonSchema({
      serverVisitIds: [],
      serverDestinationIds: [],
    });
    const properties = schemaObject(schema.properties);
    const targetItems = schemaObject(schemaObject(properties.targetVisitIds).items);

    expect(() => assertStrictModelJsonSchema(schema)).not.toThrow();
    expect(targetItems.type).toBe("null");
    expect(properties.destinationId).toEqual({ type: "null" });
  });

  it("accepts a complete output with null for values that do not apply", () => {
    expect(modelOutputSchema.parse(validModelOutput())).toEqual(validModelOutput());
  });

  it("rejects extra or missing fields at every object level", () => {
    const valid = validModelOutput();

    expect(
      modelOutputSchema.safeParse({ ...valid, userText: "add a stop" }).success,
    ).toBe(false);
    expect(
      modelOutputSchema.safeParse({
        ...valid,
        params: { ...valid.params, debug: true },
      }).success,
    ).toBe(false);

    const missingRootField = { ...valid } as Record<string, unknown>;
    delete missingRootField.intentType;
    expect(modelOutputSchema.safeParse(missingRootField).success).toBe(false);

    const missingParam = { ...valid, params: { ...valid.params } };
    delete (missingParam.params as Partial<typeof valid.params>).startTime;
    expect(modelOutputSchema.safeParse(missingParam).success).toBe(false);
  });

  it("rejects values outside the intent and clarification enums", () => {
    expect(
      modelOutputSchema.safeParse({ ...validModelOutput(), intentType: "REPLAN" }).success,
    ).toBe(false);
    expect(
      modelOutputSchema.safeParse({
        ...validModelOutput(),
        clarificationReason: "MODEL_WRITTEN_TEXT",
      }).success,
    ).toBe(false);
    expect(EDIT_INTENT_CLARIFICATION_REASON_VALUES).toEqual([
      "MISSING_TARGET",
      "MISSING_TIME",
      "MISSING_DAY",
      "AMBIGUOUS_TARGET",
      "AMBIGUOUS_DESTINATION",
      "OUT_OF_SCOPE",
    ]);
  });

  it.each(["9:30", "24:00", "12:60", "09:3a", "09:30:00"])(
    "rejects a start time outside HH:mm (%s)",
    (startTime) => {
      expect(
        modelOutputSchema.safeParse({
          ...validModelOutput(),
          params: { ...validModelOutput().params, startTime },
        }).success,
      ).toBe(false);
    },
  );

  it.each([0, -1])("rejects a non-positive duration (%s minutes)", (durationMinutes) => {
    expect(
      modelOutputSchema.safeParse({
        ...validModelOutput(),
        params: { ...validModelOutput().params, durationMinutes },
      }).success,
    ).toBe(false);
  });

  it("rejects arrays beyond the server itinerary bounds", () => {
    const valid = validModelOutput();

    expect(
      modelOutputSchema.safeParse({
        ...valid,
        targetVisitIds: Array.from({ length: MAX_EDIT_INTENT_TARGETS + 1 }, (_, i) => `visit-${i}`),
      }).success,
    ).toBe(false);
    expect(
      modelOutputSchema.safeParse({
        ...valid,
        affected: {
          ...valid.affected,
          visitIds: Array.from(
            { length: MAX_EDIT_INTENT_AFFECTED_VISITS + 1 },
            (_, i) => `visit-${i}`,
          ),
        },
      }).success,
    ).toBe(false);
    expect(
      modelOutputSchema.safeParse({
        ...valid,
        affected: {
          ...valid.affected,
          dayIndexes: Array.from(
            { length: MAX_EDIT_INTENT_AFFECTED_DAYS + 1 },
            (_, i) => (i % MAX_EDIT_INTENT_AFFECTED_DAYS) + 1,
          ),
        },
      }).success,
    ).toBe(false);
  });
});
