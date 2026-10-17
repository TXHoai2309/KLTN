import { z } from "zod";

import {
  MAX_EDIT_VISITS,
  MAX_EDIT_VISITS_PER_DAY,
} from "./edit-candidate";
import { MAX_DURATION_DAYS } from "../trip-requirement/trip-requirement-contract";

export const EDIT_INTENT_TYPE_VALUES = [
  "ADD_VISIT",
  "REMOVE_VISIT",
  "MOVE_VISIT",
  "CHANGE_TIME",
  "CHANGE_DURATION",
  "REPLACE_VISIT",
  "UNSUPPORTED",
  "UNCLEAR",
] as const;

export type EditIntentType = (typeof EDIT_INTENT_TYPE_VALUES)[number];

export const EDIT_INTENT_CLARIFICATION_REASON_VALUES = [
  "MISSING_TARGET",
  "MISSING_TIME",
  "MISSING_DAY",
  "AMBIGUOUS_TARGET",
  "AMBIGUOUS_DESTINATION",
  "OUT_OF_SCOPE",
] as const;

export type EditIntentClarificationReason =
  (typeof EDIT_INTENT_CLARIFICATION_REASON_VALUES)[number];

export const MAX_EDIT_INTENT_TARGETS = MAX_EDIT_VISITS;
export const MAX_EDIT_INTENT_AFFECTED_VISITS = MAX_EDIT_VISITS;
export const MAX_EDIT_INTENT_AFFECTED_DAYS = MAX_DURATION_DAYS;

const editEntityIdSchema = z.string().min(1).max(128);
const nullableDayIndexSchema = z.number().int().min(1).max(MAX_DURATION_DAYS).nullable();
const nullablePositionSchema = z
  .number()
  .int()
  .min(1)
  .max(MAX_EDIT_VISITS_PER_DAY)
  .nullable();
const nullableStartTimeSchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u, "Giờ bắt đầu phải theo định dạng HH:mm.")
  .nullable();
const nullableDurationSchema = z.number().int().min(1).max(1440).nullable();

/**
 * Untrusted structured output from the model. This schema contains no user-
 * authored free-text field; all object shapes are closed and every key is
 * required. Business values that do not apply to an intent use null.
 */
export const modelOutputSchema = z
  .object({
    intentType: z.enum(EDIT_INTENT_TYPE_VALUES),
    targetVisitIds: z.array(editEntityIdSchema).max(MAX_EDIT_INTENT_TARGETS),
    destinationId: editEntityIdSchema.nullable(),
    params: z
      .object({
        dayIndex: nullableDayIndexSchema,
        position: nullablePositionSchema,
        startTime: nullableStartTimeSchema,
        durationMinutes: nullableDurationSchema,
      })
      .strict(),
    affected: z
      .object({
        visitIds: z.array(editEntityIdSchema).max(MAX_EDIT_INTENT_AFFECTED_VISITS),
        dayIndexes: z
          .array(z.number().int().min(1).max(MAX_DURATION_DAYS))
          .max(MAX_EDIT_INTENT_AFFECTED_DAYS),
      })
      .strict(),
    needsClarification: z.boolean(),
    clarificationReason: z.enum(EDIT_INTENT_CLARIFICATION_REASON_VALUES).nullable(),
  })
  .strict();

export type EditIntentModelOutput = z.infer<typeof modelOutputSchema>;

declare const verifiedVisitIdBrand: unique symbol;
declare const verifiedDestinationIdBrand: unique symbol;

/** IDs carrying these types have been matched to the server-owned Trip data. */
export type VerifiedEditVisitId = string & {
  readonly [verifiedVisitIdBrand]: true;
};
export type VerifiedEditDestinationId = string & {
  readonly [verifiedDestinationIdBrand]: true;
};

/** Server-verified form; untrusted model output must not be used as this type. */
export type EditIntentResult = Omit<
  EditIntentModelOutput,
  "targetVisitIds" | "destinationId" | "affected"
> & {
  targetVisitIds: VerifiedEditVisitId[];
  destinationId: VerifiedEditDestinationId | null;
  affected: {
    visitIds: VerifiedEditVisitId[];
    dayIndexes: number[];
  };
};

type JsonSchemaObject = Record<string, unknown>;

// The shared US-25 provider guard deliberately accepts only this structural
// JSON Schema subset. Zod applies these bounds/patterns after the response is
// received, while the provider schema keeps the required closed object shape.
const LOCAL_VALIDATION_SCHEMA_KEYS = new Set([
  "maxItems",
  "minItems",
  "pattern",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
]);

export type ModelOutputJsonSchemaIds = {
  /** Visit IDs loaded from the owned Trip by the server. */
  serverVisitIds: readonly string[];
  /** Visible/eligible destination IDs loaded by the server. */
  serverDestinationIds: readonly string[];
};

function uniqueValidatedIds(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => editEntityIdSchema.parse(value)))];
}

/**
 * Generate a provider schema whose ID enums come only from the server's
 * owned-Trip and eligible-destination reads. An empty visit set still permits
 * empty target/affected arrays but no visit ID item; an empty destination set
 * permits only null.
 */
export function createModelOutputJsonSchema(ids: ModelOutputJsonSchemaIds): JsonSchemaObject {
  const generated = z.toJSONSchema(modelOutputSchema, { target: "draft-7" }) as JsonSchemaObject;
  const { $schema: _draftMarker, ...schema } = generated;

  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalize);
    if (value === null || typeof value !== "object") return value;

    const object = value as JsonSchemaObject;
    const normalized: JsonSchemaObject = {};
    for (const [key, child] of Object.entries(object)) {
      if (LOCAL_VALIDATION_SCHEMA_KEYS.has(key)) continue;
      if (key === "const") {
        normalized.enum = [normalize(child)];
        continue;
      }
      normalized[key] = normalize(child);
    }
    return normalized;
  };

  const providerSchema = normalize(schema) as JsonSchemaObject;
  const providerProperties = providerSchema.properties as JsonSchemaObject;
  const affectedProperties = providerProperties.affected as JsonSchemaObject;
  const affectedFields = affectedProperties.properties as JsonSchemaObject;
  const serverVisitIds = uniqueValidatedIds(ids.serverVisitIds);
  const serverDestinationIds = uniqueValidatedIds(ids.serverDestinationIds);
  const visitItemSchema: JsonSchemaObject = serverVisitIds.length
    ? { type: "string", enum: serverVisitIds }
    : { type: "null" };

  providerProperties.targetVisitIds = {
    type: "array",
    items: visitItemSchema,
  };
  providerProperties.destinationId = serverDestinationIds.length
    ? {
        anyOf: [
          { type: "string", enum: serverDestinationIds },
          { type: "null" },
        ],
      }
    : { type: "null" };

  affectedFields.visitIds = {
    type: "array",
    items: visitItemSchema,
  };

  return providerSchema;
}
