import { z } from "zod";

import {
  COMPANION_TYPE_VALUES,
  INTEREST_VALUES,
  MAX_DURATION_DAYS,
  MAX_GROUP_SIZE,
  MAX_INTERESTS,
  MAX_MOBILITY_FLAGS,
  MAX_NOTE_LENGTH,
  MIN_DURATION_DAYS,
  MIN_GROUP_SIZE,
  MOBILITY_CONSTRAINT_VALUES,
  PACE_VALUES,
  TRANSPORT_VALUES,
  isValidCalendarDate,
  tripRequirementInputSchema,
  type TripRequirementInput,
} from "../trip-requirement/trip-requirement-contract";

/**
 * US-25 contract only. This module is intentionally isomorphic: it contains
 * no auth, database, server-only or provider SDK dependency.
 */

export const PREFERENCE_EXTRACTION_STATUS_VALUES = [
  "EXTRACTED",
  "AMBIGUOUS",
  "MISSING",
  "UNSUPPORTED",
] as const;
export type PreferenceExtractionStatus =
  (typeof PREFERENCE_EXTRACTION_STATUS_VALUES)[number];

export const PREFERENCE_EXTRACTION_FIELD_VALUES = [
  "startDate",
  "durationDays",
  "transport",
  "companions",
  "interests",
  "pace",
  "mobilityConstraints",
] as const;
export type PreferenceExtractionField =
  (typeof PREFERENCE_EXTRACTION_FIELD_VALUES)[number];

export const PRELIMINARY_REQUIRED_EXTRACTION_FIELDS = [
  "durationDays",
  "transport",
] as const;
export type PreliminaryRequiredExtractionField =
  (typeof PRELIMINARY_REQUIRED_EXTRACTION_FIELDS)[number];

export const MAX_SOURCE_TEXT_LENGTH = 200;
export const MIN_PREFERENCE_INPUT_LENGTH = 5;
export const MAX_PREFERENCE_INPUT_LENGTH = 1000;

export const CLARIFICATION_REASON_VALUES = [
  "AMBIGUOUS_TRANSPORT",
  "UNSUPPORTED_TRANSPORT",
  "AMBIGUOUS_DATE",
  "AMBIGUOUS_DURATION",
  "OUT_OF_RANGE",
  "CONFLICT",
  "OTHER",
] as const;
export type ClarificationReason = (typeof CLARIFICATION_REASON_VALUES)[number];

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/g;

/** Normalize only the input boundary; it does not infer any trip value. */
export function normalizePreferenceInput(value: string): string {
  return value.normalize("NFC").replace(CONTROL_CHARACTER_PATTERN, "").trim();
}

export const preferenceInputSchema = z
  .string()
  .transform(normalizePreferenceInput)
  .pipe(
    z.string().superRefine((value, context) => {
      const codePointLength = [...value].length;
      if (codePointLength < MIN_PREFERENCE_INPUT_LENGTH) {
        context.addIssue({
          code: "custom",
          message: `Nhu cầu chuyến đi phải có ít nhất ${MIN_PREFERENCE_INPUT_LENGTH} ký tự.`,
        });
      }
      if (codePointLength > MAX_PREFERENCE_INPUT_LENGTH) {
        context.addIssue({
          code: "custom",
          message: `Nhu cầu chuyến đi không được quá ${MAX_PREFERENCE_INPUT_LENGTH} ký tự.`,
        });
      }
    }),
  );

type FieldValueMap = {
  startDate: Exclude<TripRequirementInput["startDate"], null>;
  durationDays: TripRequirementInput["durationDays"];
  transport: TripRequirementInput["transport"];
  companions: Exclude<TripRequirementInput["companions"], null>;
  interests: TripRequirementInput["interests"];
  pace: Exclude<TripRequirementInput["pace"], null>;
  mobilityConstraints: Exclude<TripRequirementInput["mobilityConstraints"], null>;
};

export type FieldExtraction<T> =
  | {
      status: "EXTRACTED";
      value: T;
      sourceText: string;
      note: string | null;
    }
  | {
      status: "AMBIGUOUS" | "UNSUPPORTED";
      value: null;
      sourceText: string;
      note: string | null;
    }
  | {
      status: "MISSING";
      value: null;
      sourceText: null;
      note: string | null;
    };

export type PreferenceExtractionFields = {
  [Field in PreferenceExtractionField]: FieldExtraction<FieldValueMap[Field]>;
};

const rawSourceTextSchema = z.string();
const rawNoteSchema = z.string().nullable();

const rawCompanionsValueSchema = z
  .object({
    type: z.string().nullable(),
    groupSize: z.union([z.number(), z.string()]).nullable(),
  })
  .strict();

const rawMobilityValueSchema = z
  .object({
    flags: z.array(z.string()).nullable(),
    note: z.string().nullable(),
  })
  .strict();

/**
 * The model schema intentionally accepts raw strings/numbers/enums. Enum and
 * range verification belongs to the deterministic US-24 contract boundary.
 * Its discriminated branches still enforce the status/value/sourceText
 * relationship before the result reaches server verification.
 */
function rawFieldExtractionSchema<T extends z.ZodTypeAny>(valueSchema: T) {
  // Use a plain union here so Zod 4 emits `anyOf`; OpenAI Structured Outputs
  // accepts `anyOf` branches but does not accept JSON Schema `oneOf`.
  return z.union([
    z
      .object({
        status: z.literal("EXTRACTED"),
        value: valueSchema,
        sourceText: rawSourceTextSchema,
        note: rawNoteSchema,
      })
      .strict(),
    z
      .object({
        status: z.literal("AMBIGUOUS"),
        value: z.null(),
        sourceText: rawSourceTextSchema,
        note: rawNoteSchema,
      })
      .strict(),
    z
      .object({
        status: z.literal("MISSING"),
        value: z.null(),
        sourceText: z.null(),
        note: rawNoteSchema,
      })
      .strict(),
    z
      .object({
        status: z.literal("UNSUPPORTED"),
        value: z.null(),
        sourceText: rawSourceTextSchema,
        note: rawNoteSchema,
      })
      .strict(),
  ]);
}

const rawFieldsSchema = z
  .object({
    startDate: rawFieldExtractionSchema(z.string()),
    durationDays: rawFieldExtractionSchema(z.union([z.string(), z.number()])),
    transport: rawFieldExtractionSchema(z.string()),
    companions: rawFieldExtractionSchema(rawCompanionsValueSchema),
    interests: rawFieldExtractionSchema(z.array(z.string())),
    pace: rawFieldExtractionSchema(z.string()),
    mobilityConstraints: rawFieldExtractionSchema(rawMobilityValueSchema),
  })
  .strict();

/** Exact provider response envelope sent/received in Structured Outputs. */
export const modelOutputSchema = z
  .object({
    fields: rawFieldsSchema,
  })
  .strict();
export type ModelOutput = z.infer<typeof modelOutputSchema>;

const verifiedStartDateSchema = z
  .string()
  .refine(isValidCalendarDate, "Ngày bắt đầu không tồn tại trong lịch.");
const verifiedDurationSchema = z
  .number()
  .int()
  .min(MIN_DURATION_DAYS)
  .max(MAX_DURATION_DAYS);
const verifiedTransportSchema = z.enum(TRANSPORT_VALUES);
const verifiedCompanionsSchema = z
  .object({
    type: z.enum(COMPANION_TYPE_VALUES),
    groupSize: z
      .number()
      .int()
      .min(MIN_GROUP_SIZE)
      .max(MAX_GROUP_SIZE),
  })
  .strict()
  .superRefine((value, context) => {
    const expectedSize = value.type === "SOLO" ? 1 : value.type === "COUPLE" ? 2 : null;
    if (expectedSize !== null && value.groupSize !== expectedSize) {
      context.addIssue({
        code: "custom",
        path: ["groupSize"],
        message: "Số người không phù hợp với loại nhóm.",
      });
    }
    if (expectedSize === null && value.groupSize < 2) {
      context.addIssue({
        code: "custom",
        path: ["groupSize"],
        message: "Nhóm từ hai người trở lên cần có số người hợp lệ.",
      });
    }
  });
const verifiedInterestsSchema = z
  .array(z.enum(INTEREST_VALUES))
  .max(MAX_INTERESTS)
  .refine((values) => new Set(values).size === values.length, "Sở thích không được trùng.");
const verifiedPaceSchema = z.enum(PACE_VALUES);
const verifiedMobilitySchema = z
  .object({
    flags: z
      .array(z.enum(MOBILITY_CONSTRAINT_VALUES))
      .max(MAX_MOBILITY_FLAGS)
      .refine((values) => new Set(values).size === values.length, "Ràng buộc không được trùng."),
    note: z.string().max(MAX_NOTE_LENGTH).nullable(),
  })
  .strict();

const sourceTextSchema = z.string().min(1).max(MAX_SOURCE_TEXT_LENGTH);
const resultNoteSchema = z.string().max(MAX_NOTE_LENGTH).nullable();

function verifiedFieldExtractionSchema<T extends z.ZodTypeAny>(valueSchema: T) {
  return z.discriminatedUnion("status", [
    z
      .object({
        status: z.literal("EXTRACTED"),
        value: valueSchema,
        sourceText: sourceTextSchema,
        note: resultNoteSchema,
      })
      .strict(),
    z
      .object({
        status: z.literal("AMBIGUOUS"),
        value: z.null(),
        sourceText: sourceTextSchema,
        note: resultNoteSchema,
      })
      .strict(),
    z
      .object({
        status: z.literal("MISSING"),
        value: z.null(),
        sourceText: z.null(),
        note: resultNoteSchema,
      })
      .strict(),
    z
      .object({
        status: z.literal("UNSUPPORTED"),
        value: z.null(),
        sourceText: sourceTextSchema,
        note: resultNoteSchema,
      })
      .strict(),
  ]);
}

const clarificationSchema = z
  .object({
    field: z.enum(PREFERENCE_EXTRACTION_FIELD_VALUES),
    reason: z.enum(CLARIFICATION_REASON_VALUES),
    message: z.string().min(1),
    sourceText: sourceTextSchema,
  })
  .strict();

const verifiedFieldsSchema = z
  .object({
    startDate: verifiedFieldExtractionSchema(verifiedStartDateSchema),
    durationDays: verifiedFieldExtractionSchema(verifiedDurationSchema),
    transport: verifiedFieldExtractionSchema(verifiedTransportSchema),
    companions: verifiedFieldExtractionSchema(verifiedCompanionsSchema),
    interests: verifiedFieldExtractionSchema(verifiedInterestsSchema),
    pace: verifiedFieldExtractionSchema(verifiedPaceSchema),
    mobilityConstraints: verifiedFieldExtractionSchema(verifiedMobilitySchema),
  })
  .strict();

export const extractionResultSchema = z
  .object({
    fields: verifiedFieldsSchema,
    clarifications: z.array(clarificationSchema),
    missingRequired: z.array(z.enum(PRELIMINARY_REQUIRED_EXTRACTION_FIELDS)),
    meta: z
      .object({
        model: z.string().min(1),
        latencyMs: z.number().int().nonnegative(),
        inputLength: z.number().int().min(0).max(MAX_PREFERENCE_INPUT_LENGTH),
      })
      .strict(),
  })
  .strict()
  .superRefine((result, context) => {
    const expectedMissing = PRELIMINARY_REQUIRED_EXTRACTION_FIELDS.filter(
      (field) => result.fields[field].status !== "EXTRACTED",
    );
    if (
      expectedMissing.length !== result.missingRequired.length ||
      expectedMissing.some((field, index) => field !== result.missingRequired[index])
    ) {
      context.addIssue({
        code: "custom",
        path: ["missingRequired"],
        message: "missingRequired phải khớp với trạng thái các trường bắt buộc.",
      });
    }
  });
export type ExtractionResult = z.infer<typeof extractionResultSchema>;

type JsonSchemaObject = Record<string, unknown>;

/**
 * Zod 4 is the source of truth for the provider schema. The draft marker is
 * removed because the OpenAI request carries the schema body, not a JSON
 * Schema document wrapper.
 */
export function createModelOutputJsonSchema(): JsonSchemaObject {
  const generated = z.toJSONSchema(modelOutputSchema, { target: "draft-7" }) as JsonSchemaObject;
  const { $schema: _draftMarker, ...schema } = generated;

  // Zod emits `const` for z.literal(). Structured Outputs documents enum
  // branches, so normalize the equivalent singleton constraint while keeping
  // Zod as the source of truth for the structure.
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalize);
    if (value === null || typeof value !== "object") return value;
    const object = value as JsonSchemaObject;
    const normalized: JsonSchemaObject = {};
    for (const [key, child] of Object.entries(object)) {
      if (key === "const") {
        normalized.enum = [normalize(child)];
        continue;
      }
      normalized[key] = normalize(child);
    }
    return normalized;
  };

  return normalize(schema) as JsonSchemaObject;
}

export const modelOutputJsonSchema = createModelOutputJsonSchema();

const STRICT_JSON_SCHEMA_KEYS = new Set([
  "minLength", "maxLength", "pattern", "minItems", "maxItems", "minimum", "maximum",
  "type",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "anyOf",
  "enum",
]);

/**
 * Small local guard used by tests and a future provider adapter. It checks the
 * Structured Outputs subset we deliberately generate, not arbitrary JSON
 * Schema validity.
 */
export function assertStrictModelJsonSchema(schema: unknown): asserts schema is JsonSchemaObject {
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (node === null || typeof node !== "object") return;

    const object = node as JsonSchemaObject;
    for (const key of Object.keys(object)) {
      if (!STRICT_JSON_SCHEMA_KEYS.has(key)) {
        throw new Error(`Unsupported Structured Outputs keyword: ${key}`);
      }
    }
    if (object.type === "object") {
      if (object.additionalProperties !== false) {
        throw new Error("Every Structured Outputs object must set additionalProperties=false.");
      }
      const properties = object.properties;
      const required = object.required;
      if (properties === null || typeof properties !== "object" || Array.isArray(properties)) {
        throw new Error("Structured Outputs objects must declare properties.");
      }
      if (!Array.isArray(required)) {
        throw new Error("Structured Outputs objects must declare required fields.");
      }
      const propertyNames = Object.keys(properties as JsonSchemaObject).sort();
      const requiredNames = (required as unknown[]).map(String).sort();
      if (
        propertyNames.length !== requiredNames.length ||
        propertyNames.some((name, index) => name !== requiredNames[index])
      ) {
        throw new Error("Every Structured Outputs property must be required.");
      }
    }
    if (object.properties !== null && typeof object.properties === "object" && !Array.isArray(object.properties)) {
      Object.values(object.properties as JsonSchemaObject).forEach(visit);
    }
    if (object.items !== undefined) visit(object.items);
    if (object.anyOf !== undefined) visit(object.anyOf);
  };

  visit(schema);
}

function boundedSourceText(value: string): string {
  return [...value].slice(0, MAX_SOURCE_TEXT_LENGTH).join("") || "(không có trích đoạn rõ ràng)";
}

function boundedNote(value: string | null): string | null {
  return value === null ? null : [...value].slice(0, MAX_NOTE_LENGTH).join("");
}

function missingField<T>(): FieldExtraction<T> {
  return { status: "MISSING", value: null, sourceText: null, note: null };
}

function rejectedField<T>(
  status: "AMBIGUOUS" | "UNSUPPORTED",
  sourceText: string,
  note: string | null,
): FieldExtraction<T> {
  return {
    status,
    value: null,
    sourceText: boundedSourceText(sourceText),
    note: boundedNote(note),
  };
}

function extractedField<T>(value: T, sourceText: string, note: string | null): FieldExtraction<T> {
  return {
    status: "EXTRACTED",
    value,
    sourceText: boundedSourceText(sourceText),
    note: boundedNote(note),
  };
}

function parseIntegerValue(value: string | number): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) ? value : null;
  }
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function canonicalizeValues<const T extends readonly string[]>(
  values: readonly string[],
  canonicalOrder: T,
): T[number][] | null {
  if (!values.every((value) => canonicalOrder.includes(value as T[number]))) return null;
  const unique = new Set(values);
  return canonicalOrder.filter((value) => unique.has(value));
}

function verifyStartDate(raw: ModelOutput["fields"]["startDate"]): FieldExtraction<string> {
  if (raw.status === "MISSING") return missingField();
  if (raw.status !== "EXTRACTED") return rejectedField(raw.status, raw.sourceText, raw.note);
  if (!isValidCalendarDate(raw.value)) {
    return rejectedField("AMBIGUOUS", raw.sourceText, "Ngày chưa ở dạng ngày lịch đầy đủ và hợp lệ.");
  }
  return extractedField(raw.value, raw.sourceText, raw.note);
}

function verifyDuration(
  raw: ModelOutput["fields"]["durationDays"],
): FieldExtraction<number> {
  if (raw.status === "MISSING") return missingField();
  if (raw.status !== "EXTRACTED") return rejectedField(raw.status, raw.sourceText, raw.note);
  const parsed = parseIntegerValue(raw.value);
  if (parsed === null) {
    return rejectedField("AMBIGUOUS", raw.sourceText, "Thời lượng chưa xác định được thành số ngày nguyên.");
  }
  const checked = verifiedDurationSchema.safeParse(parsed);
  if (!checked.success) {
    return rejectedField("UNSUPPORTED", raw.sourceText, "Thời lượng nằm ngoài giới hạn của US-24.");
  }
  return extractedField(checked.data, raw.sourceText, raw.note);
}

function verifyTransport(
  raw: ModelOutput["fields"]["transport"],
): FieldExtraction<TripRequirementInput["transport"]> {
  if (raw.status === "MISSING") return missingField();
  if (raw.status !== "EXTRACTED") return rejectedField(raw.status, raw.sourceText, raw.note);
  const checked = verifiedTransportSchema.safeParse(raw.value);
  if (!checked.success) {
    return rejectedField("UNSUPPORTED", raw.sourceText, "Phương tiện này chưa được hỗ trợ trong US-24.");
  }
  return extractedField(checked.data, raw.sourceText, raw.note);
}

function verifyCompanions(
  raw: ModelOutput["fields"]["companions"],
): FieldExtraction<FieldValueMap["companions"]> {
  if (raw.status === "MISSING") return missingField();
  if (raw.status !== "EXTRACTED") return rejectedField(raw.status, raw.sourceText, raw.note);
  const checked = verifiedCompanionsSchema.safeParse({
    type: raw.value.type,
    groupSize:
      raw.value.groupSize === null ? null : parseIntegerValue(raw.value.groupSize),
  });
  if (!checked.success) {
    return rejectedField("AMBIGUOUS", raw.sourceText, "Thông tin nhóm hoặc số người đang mâu thuẫn/chưa đủ rõ.");
  }
  return extractedField(checked.data, raw.sourceText, raw.note);
}

function verifyInterests(
  raw: ModelOutput["fields"]["interests"],
): FieldExtraction<TripRequirementInput["interests"]> {
  if (raw.status === "MISSING") return missingField();
  if (raw.status !== "EXTRACTED") return rejectedField(raw.status, raw.sourceText, raw.note);
  const values = canonicalizeValues(raw.value, INTEREST_VALUES);
  if (values === null || values.length > MAX_INTERESTS) {
    return rejectedField("UNSUPPORTED", raw.sourceText, "Có sở thích chưa thuộc bộ giá trị US-24.");
  }
  return extractedField(values, raw.sourceText, raw.note);
}

function verifyPace(
  raw: ModelOutput["fields"]["pace"],
): FieldExtraction<FieldValueMap["pace"]> {
  if (raw.status === "MISSING") return missingField();
  if (raw.status !== "EXTRACTED") return rejectedField(raw.status, raw.sourceText, raw.note);
  const checked = verifiedPaceSchema.safeParse(raw.value);
  if (!checked.success) return rejectedField("UNSUPPORTED", raw.sourceText, "Nhịp độ chưa thuộc bộ giá trị US-24.");
  return extractedField(checked.data, raw.sourceText, raw.note);
}

function verifyMobility(
  raw: ModelOutput["fields"]["mobilityConstraints"],
): FieldExtraction<FieldValueMap["mobilityConstraints"]> {
  if (raw.status === "MISSING") return missingField();
  if (raw.status !== "EXTRACTED") return rejectedField(raw.status, raw.sourceText, raw.note);
  const flags = raw.value.flags === null ? null : canonicalizeValues(raw.value.flags, MOBILITY_CONSTRAINT_VALUES);
  const checked = verifiedMobilitySchema.safeParse({
    flags,
    note: raw.value.note === null ? null : [...raw.value.note].slice(0, MAX_NOTE_LENGTH).join(""),
  });
  if (!checked.success) {
    return rejectedField("UNSUPPORTED", raw.sourceText, "Ràng buộc di chuyển chưa thuộc bộ giá trị US-24.");
  }
  return extractedField(checked.data, raw.sourceText, raw.note);
}

function verifyWithTripRequirementContract(
  fields: PreferenceExtractionFields,
): PreferenceExtractionFields {
  if (
    fields.durationDays.status !== "EXTRACTED" ||
    fields.transport.status !== "EXTRACTED"
  ) {
    return fields;
  }

  const candidate = {
    startDate: fields.startDate.status === "EXTRACTED" ? fields.startDate.value : null,
    durationDays: fields.durationDays.value,
    transport: fields.transport.value,
    companions: fields.companions.status === "EXTRACTED" ? fields.companions.value : null,
    interests: fields.interests.status === "EXTRACTED" ? fields.interests.value : [],
    pace: fields.pace.status === "EXTRACTED" ? fields.pace.value : null,
    mobilityConstraints:
      fields.mobilityConstraints.status === "EXTRACTED"
        ? fields.mobilityConstraints.value
        : null,
  } satisfies TripRequirementInput;
  const checked = tripRequirementInputSchema.safeParse(candidate);
  if (!checked.success) {
    const verified = { ...fields };
    for (const issue of checked.error.issues) {
      const field = issue.path[0];
      if (
        typeof field !== "string" ||
        !PREFERENCE_EXTRACTION_FIELD_VALUES.includes(field as PreferenceExtractionField)
      ) {
        continue;
      }
      const current = verified[field as PreferenceExtractionField];
      if (current.status === "EXTRACTED") {
        verified[field as PreferenceExtractionField] = rejectedField(
          "UNSUPPORTED",
          current.sourceText,
          issue.message,
        ) as never;
      }
    }
    return verified;
  }

  const normalized = checked.data;
  return {
    ...fields,
    startDate:
      fields.startDate.status === "EXTRACTED" && normalized.startDate !== null
        ? { ...fields.startDate, value: normalized.startDate }
        : fields.startDate,
    durationDays: { ...fields.durationDays, value: normalized.durationDays },
    transport: { ...fields.transport, value: normalized.transport },
    companions:
      fields.companions.status === "EXTRACTED" && normalized.companions !== null
        ? { ...fields.companions, value: normalized.companions }
        : fields.companions,
    interests:
      fields.interests.status === "EXTRACTED"
        ? { ...fields.interests, value: normalized.interests }
        : fields.interests,
    pace:
      fields.pace.status === "EXTRACTED" && normalized.pace !== null
        ? { ...fields.pace, value: normalized.pace }
        : fields.pace,
    mobilityConstraints:
      fields.mobilityConstraints.status === "EXTRACTED" && normalized.mobilityConstraints !== null
        ? { ...fields.mobilityConstraints, value: normalized.mobilityConstraints }
        : fields.mobilityConstraints,
  };
}

function clarificationFor(
  field: PreferenceExtractionField,
  extraction: FieldExtraction<unknown>,
): z.infer<typeof clarificationSchema> | null {
  if (extraction.status !== "AMBIGUOUS" && extraction.status !== "UNSUPPORTED") return null;
  const reason: ClarificationReason =
    field === "transport"
      ? extraction.status === "AMBIGUOUS"
        ? "AMBIGUOUS_TRANSPORT"
        : "UNSUPPORTED_TRANSPORT"
      : field === "startDate"
        ? "AMBIGUOUS_DATE"
        : field === "durationDays"
          ? extraction.status === "UNSUPPORTED"
            ? "OUT_OF_RANGE"
            : "AMBIGUOUS_DURATION"
          : field === "companions"
            ? "CONFLICT"
            : "OTHER";
  const messageByReason: Record<ClarificationReason, string> = {
    AMBIGUOUS_TRANSPORT: "Bạn chưa nêu rõ muốn đi bằng xe máy hay ô tô.",
    UNSUPPORTED_TRANSPORT: "Phương tiện này chưa được hỗ trợ; vui lòng chọn xe máy hoặc ô tô.",
    AMBIGUOUS_DATE: "Ngày bắt đầu chưa rõ; vui lòng chọn một ngày cụ thể.",
    AMBIGUOUS_DURATION: "Thời lượng chưa rõ số ngày; vui lòng nhập một số ngày cụ thể.",
    OUT_OF_RANGE: `Thời lượng phải nằm trong khoảng ${MIN_DURATION_DAYS} đến ${MAX_DURATION_DAYS} ngày.`,
    CONFLICT: "Thông tin người đi cùng đang mâu thuẫn; vui lòng kiểm tra lại số người.",
    OTHER: "Thông tin này chưa đủ rõ; vui lòng chọn hoặc nhập lại để hệ thống không phải đoán.",
  };
  return {
    field,
    reason,
    message: messageByReason[reason],
    sourceText: boundedSourceText(extraction.sourceText),
  };
}

/**
 * Verify a raw model-shaped object against US-24. This is intentionally a
 * pure helper for the future server adapter; it does not call OpenAI.
 */
export function verifyModelOutput(
  value: unknown,
  meta: { model: string; latencyMs: number; inputLength: number },
): ExtractionResult {
  const raw = modelOutputSchema.parse(value);
  const fields = verifyWithTripRequirementContract({
    startDate: verifyStartDate(raw.fields.startDate),
    durationDays: verifyDuration(raw.fields.durationDays),
    transport: verifyTransport(raw.fields.transport),
    companions: verifyCompanions(raw.fields.companions),
    interests: verifyInterests(raw.fields.interests),
    pace: verifyPace(raw.fields.pace),
    mobilityConstraints: verifyMobility(raw.fields.mobilityConstraints),
  });
  const clarifications = PREFERENCE_EXTRACTION_FIELD_VALUES.map((field) =>
    clarificationFor(field, fields[field] as FieldExtraction<unknown>),
  ).filter((value): value is NonNullable<typeof value> => value !== null);
  const missingRequired = PRELIMINARY_REQUIRED_EXTRACTION_FIELDS.filter(
    (field) => fields[field].status !== "EXTRACTED",
  );

  return extractionResultSchema.parse({
    fields,
    clarifications,
    missingRequired,
    meta: {
      model: meta.model,
      latencyMs: meta.latencyMs,
      inputLength: meta.inputLength,
    },
  });
}

export const preferenceExtractionContract = {
  modelOutputSchema,
  extractionResultSchema,
  modelOutputJsonSchema,
  preferenceInputSchema,
  verifyModelOutput,
} as const;
