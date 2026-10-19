import { z } from "zod";

import { MAX_DURATION_DAYS } from "../trip-requirement/trip-requirement-contract";
import {
  EDIT_INTENT_CLARIFICATION_REASON_VALUES,
  type EditIntentClarificationReason,
} from "../trip-edit/edit-intent-contract";
import { MAX_EDIT_VISITS, MAX_EDIT_VISITS_PER_DAY } from "../trip-edit/edit-candidate";

export const REPLAN_OPERATION_TYPES = [
  "ADD_VISIT",
  "REMOVE_VISIT",
  "MOVE_VISIT",
  "CHANGE_TIME",
  "CHANGE_DURATION",
  "REPLACE_VISIT",
] as const;

export type ReplanOperationType = (typeof REPLAN_OPERATION_TYPES)[number];
export const REPLAN_CLARIFICATION_REASONS = EDIT_INTENT_CLARIFICATION_REASON_VALUES;
export type ReplanClarificationReason = EditIntentClarificationReason;

export const MAX_REPLAN_OPERATIONS = 10;
export const MAX_REPLAN_DESTINATIONS = 50;
export const MAX_REPLAN_VISITS = MAX_EDIT_VISITS;
export const MAX_REPLAN_NEED_LENGTH = 500;
export const MAX_REPLAN_OUTPUT_CHARS = 32 * 1024;
export const MAX_REPLAN_PROVIDER_TIMEOUT_MS = 15_000;

const entityIdSchema = z.string().min(1).max(128);
const nullableDayIndexSchema = z.number().int().min(1).max(MAX_DURATION_DAYS).nullable();
const nullablePositionSchema = z
  .number()
  .int()
  .min(1)
  .max(MAX_EDIT_VISITS_PER_DAY)
  .nullable();
const nullableStartTimeSchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u, "Giờ phải theo định dạng HH:mm.")
  .nullable();
const nullableDurationSchema = z.number().int().min(1).max(1440).nullable();

const operationSchema = z
  .object({
    operationType: z.enum(REPLAN_OPERATION_TYPES),
    targetVisitId: entityIdSchema.nullable(),
    destinationId: entityIdSchema.nullable(),
    params: z
      .object({
        dayIndex: nullableDayIndexSchema,
        position: nullablePositionSchema,
        startTime: nullableStartTimeSchema,
        durationMinutes: nullableDurationSchema,
      })
      .strict(),
  })
  .strict();

const mandatoryEndpointSchema = z
  .object({
    destinationId: entityIdSchema.nullable(),
    deadline: nullableStartTimeSchema,
  })
  .strict()
  .nullable();

/** Strict, untrusted model output; all absent business values are explicit nulls. */
export const modelOutputSchema = z
  .object({
    operations: z.array(operationSchema).max(MAX_REPLAN_OPERATIONS),
    mandatoryEndpoint: mandatoryEndpointSchema,
    needsClarification: z.boolean(),
    clarificationReason: z.enum(REPLAN_CLARIFICATION_REASONS).nullable(),
  })
  .strict();

export type ReplanModelOutput = z.infer<typeof modelOutputSchema>;
export type ReplanOperation = ReplanModelOutput["operations"][number];

declare const verifiedVisitIdBrand: unique symbol;
declare const verifiedDestinationIdBrand: unique symbol;

export type VerifiedReplanVisitId = string & {
  readonly [verifiedVisitIdBrand]: true;
};
export type VerifiedReplanDestinationId = string & {
  readonly [verifiedDestinationIdBrand]: true;
};

export type VerifiedReplanOperation = Omit<
  ReplanOperation,
  "targetVisitId" | "destinationId"
> & {
  targetVisitId: VerifiedReplanVisitId | null;
  destinationId: VerifiedReplanDestinationId | null;
};

export type VerifiedMandatoryEndpoint = {
  destinationId: VerifiedReplanDestinationId;
  deadline: string;
};

export type ReplanIntentResult = {
  operations: VerifiedReplanOperation[];
  mandatoryEndpoint: VerifiedMandatoryEndpoint | null;
};

export type ReplanServerIds = {
  remainingVisitIds: readonly string[];
  eligibleDestinationIds: readonly string[];
  dayIndexes: readonly number[];
};

type JsonSchemaObject = Record<string, unknown>;

const LOCAL_ONLY_VALIDATION_KEYS = new Set([
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

function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids.map((id) => entityIdSchema.parse(id)))];
}

function nullableEnum(values: readonly (string | number)[], type: "string" | "integer"): JsonSchemaObject {
  if (values.length === 0) return { type: "null" };
  return {
    anyOf: [
      { type, enum: [...values] },
      { type: "null" },
    ],
  };
}

/**
 * Zod remains the source of truth. The provider-facing shape removes local
 * bounds/patterns (rechecked by Zod) and restricts all IDs to server context.
 */
export function createReplanModelOutputJsonSchema(ids: ReplanServerIds): JsonSchemaObject {
  const generated = z.toJSONSchema(modelOutputSchema, { target: "draft-7" }) as JsonSchemaObject;
  const { $schema: _draftMarker, ...schema } = generated;

  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalize);
    if (value === null || typeof value !== "object") return value;

    const object = value as JsonSchemaObject;
    const normalized: JsonSchemaObject = {};
    for (const [key, child] of Object.entries(object)) {
      if (LOCAL_ONLY_VALIDATION_KEYS.has(key)) continue;
      if (key === "const") {
        normalized.enum = [normalize(child)];
        continue;
      }
      normalized[key] = normalize(child);
    }
    return normalized;
  };

  const providerSchema = normalize(schema) as JsonSchemaObject;
  const rootProperties = providerSchema.properties as JsonSchemaObject;
  const operationsSchema = rootProperties.operations as JsonSchemaObject;
  const operationItems = operationsSchema.items as JsonSchemaObject;
  const operationProperties = operationItems.properties as JsonSchemaObject;
  const endpointSchema = rootProperties.mandatoryEndpoint as JsonSchemaObject;
  const endpointBranches = endpointSchema.anyOf as JsonSchemaObject[] | undefined;
  const endpointObject = endpointBranches?.find((branch) => branch.type === "object");
  const endpointProperties = endpointObject?.properties as JsonSchemaObject | undefined;
  const serverVisitIds = uniqueIds(ids.remainingVisitIds);
  const serverDestinationIds = uniqueIds(ids.eligibleDestinationIds);
  const dayIndexes = [...new Set(ids.dayIndexes)];

  operationProperties.targetVisitId = nullableEnum(serverVisitIds, "string");
  operationProperties.destinationId = nullableEnum(serverDestinationIds, "string");
  const params = operationProperties.params as JsonSchemaObject;
  const paramProperties = params.properties as JsonSchemaObject;
  paramProperties.dayIndex = nullableEnum(dayIndexes, "integer");

  if (endpointProperties) {
    endpointProperties.destinationId = nullableEnum(serverDestinationIds, "string");
  }

  return providerSchema;
}
