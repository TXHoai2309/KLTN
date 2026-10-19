import { describe, expect, test } from "vitest";

import { assertStrictModelJsonSchema } from "../preference-extraction/preference-extraction-contract";
import {
  createReplanModelOutputJsonSchema,
  MAX_REPLAN_OPERATIONS,
  modelOutputSchema,
  REPLAN_OPERATION_TYPES,
} from "./replan-contract";

const operation = {
  operationType: "MOVE_VISIT",
  targetVisitId: "visit-1",
  destinationId: null,
  params: {
    dayIndex: 2,
    position: 1,
    startTime: null,
    durationMinutes: null,
  },
} as const;

const validOutput = {
  operations: [operation],
  mandatoryEndpoint: null,
  needsClarification: false,
  clarificationReason: null,
};

describe("in-trip replan model contract", () => {
  test("accepts a complete strict output and the supported operation enum", () => {
    expect(modelOutputSchema.parse(validOutput)).toEqual(validOutput);
    expect(REPLAN_OPERATION_TYPES).toEqual([
      "ADD_VISIT",
      "REMOVE_VISIT",
      "MOVE_VISIT",
      "CHANGE_TIME",
      "CHANGE_DURATION",
      "REPLACE_VISIT",
    ]);
  });

  test.each([
    ["extra top-level property", { ...validOutput, extra: true }],
    ["missing required property", { operations: [operation], mandatoryEndpoint: null, needsClarification: false }],
    ["unsupported operation", { ...validOutput, operations: [{ ...operation, operationType: "WRITE_TRIP" }] }],
    ["invalid time", { ...validOutput, operations: [{ ...operation, params: { ...operation.params, startTime: "9:30" } }] }],
    ["zero duration", { ...validOutput, operations: [{ ...operation, params: { ...operation.params, durationMinutes: 0 } }] }],
    ["extra nested property", { ...validOutput, operations: [{ ...operation, params: { ...operation.params, extra: 1 } }] }],
  ])("rejects %s", (_label, value) => {
    expect(modelOutputSchema.safeParse(value).success).toBe(false);
  });

  test("caps operations at ten", () => {
    expect(MAX_REPLAN_OPERATIONS).toBe(10);
    expect(
      modelOutputSchema.safeParse({
        ...validOutput,
        operations: Array.from({ length: MAX_REPLAN_OPERATIONS + 1 }, () => operation),
      }).success,
    ).toBe(false);
  });

  test("generates a closed provider schema with required fields and only server IDs", () => {
    const schema = createReplanModelOutputJsonSchema({
      remainingVisitIds: ["remaining-a"],
      eligibleDestinationIds: ["destination-a"],
      dayIndexes: [1, 2],
    });
    expect(() => assertStrictModelJsonSchema(schema)).not.toThrow();

    const visitSchema = schema as {
      additionalProperties: false;
      required: string[];
      properties: {
        operations: { items: { properties: { targetVisitId: { anyOf: { enum?: string[] }[] } } } };
      };
    };
    expect(visitSchema.additionalProperties).toBe(false);
    expect(visitSchema.required).toEqual([
      "operations",
      "mandatoryEndpoint",
      "needsClarification",
      "clarificationReason",
    ]);
    expect(visitSchema.properties.operations.items.properties.targetVisitId.anyOf[0]?.enum).toEqual([
      "remaining-a",
    ]);
    expect(JSON.stringify(schema)).not.toContain("maxItems");
    expect(JSON.stringify(schema)).not.toContain("pattern");
  });

  test("restricts empty server ID sets to null rather than inventable identifiers", () => {
    const schema = createReplanModelOutputJsonSchema({
      remainingVisitIds: [],
      eligibleDestinationIds: [],
      dayIndexes: [],
    }) as {
      properties: {
        operations: { items: { properties: { targetVisitId: { type: string } } } };
      };
    };
    expect(schema.properties.operations.items.properties.targetVisitId).toEqual({ type: "null" });
    expect(() => assertStrictModelJsonSchema(schema)).not.toThrow();
  });
});
