import {
  isValidCalendarDate,
  tripRequirementInputSchema,
  type TripRequirementInput,
} from "./trip-requirement-contract";
import {
  buildPayload,
  validateRequiredFields,
  type TripRequirementFormFields,
} from "./trip-requirement-form-logic";
import {
  evaluateTripRequirement,
} from "./trip-requirement-readiness";
import type {
  ExtractionResult,
  FieldExtraction,
  PreferenceExtractionField,
} from "../preference-extraction/preference-extraction-contract";
import type { CheckIssue, CheckResult } from "./trip-requirement-check";
import { resolveTransportCandidateFromExtraction } from "./transport-safety";

/** Fixed order for the review surface; do not derive it from object keys. */
export const REVIEW_FIELD_KEYS = [
  "startDate",
  "durationDays",
  "companions",
  "interests",
  "pace",
  "transport",
  "mobilityConstraints",
] as const;

export type ReviewFieldKey = (typeof REVIEW_FIELD_KEYS)[number];

export type ReviewValueMap = {
  startDate: Exclude<TripRequirementInput["startDate"], null>;
  durationDays: TripRequirementInput["durationDays"];
  companions: Exclude<TripRequirementInput["companions"], null>;
  interests: TripRequirementInput["interests"];
  pace: Exclude<TripRequirementInput["pace"], null>;
  transport: TripRequirementInput["transport"];
  mobilityConstraints: Exclude<TripRequirementInput["mobilityConstraints"], null>;
};

export type ReviewIssue = {
  code: string;
  field: ReviewFieldKey | string;
  severity: "ERROR" | "WARNING";
  message: string;
};

export type ReviewField<K extends ReviewFieldKey = ReviewFieldKey> = {
  key: K;
  origin: "AI" | "USER" | "EMPTY";
  value: ReviewValueMap[K] | null;
  aiStatus: "EXTRACTED" | "AMBIGUOUS" | "MISSING" | "UNSUPPORTED" | null;
  sourceText: string | null;
  aiNote: string | null;
  aiValue: ReviewValueMap[K] | null;
  edited: boolean;
  issues: ReviewIssue[];
};

export type ReviewFieldMap = Record<ReviewFieldKey, ReviewField>;

export type TripRequirementReviewDraft = {
  fields: ReviewFieldMap;
};

/** Candidate shape intentionally permits null required fields until a server check runs. */
export type TripRequirementCandidate = {
  startDate: string | null;
  durationDays: number | null;
  companions: ReviewValueMap["companions"] | null;
  interests: TripRequirementInput["interests"];
  pace: ReviewValueMap["pace"] | null;
  transport: ReviewValueMap["transport"] | null;
  mobilityConstraints: ReviewValueMap["mobilityConstraints"] | null;
};

export type ReviewConfirmationState = "NOT_CONFIRMED" | "CHECKING" | "CONFIRMED";

export type ConfirmedTripRequirement = {
  requirement: TripRequirementInput;
  usesRelativeDays: boolean;
  eligibleForFinalConfirmation: boolean;
  warnings: CheckIssue[];
  checkedAt: string;
};

export type ReviewConfirmation = {
  state: ReviewConfirmationState;
  snapshot: ConfirmedTripRequirement | null;
};

export type ReviewRawFieldValue =
  | string
  | string[]
  | { type: string; groupSize: string }
  | { flags: string[]; note: string }
  | null;

export type ReviewEditResult =
  | {
      ok: true;
      draft: TripRequirementReviewDraft;
      confirmation: ReviewConfirmationState;
    }
  | {
      ok: false;
      draft: TripRequirementReviewDraft;
      errors: Record<string, string>;
      confirmation: ReviewConfirmationState;
    };

const REQUIRED_REVIEW_FIELDS = ["durationDays", "transport"] as const;

function clarificationIssues(result: ExtractionResult, field: ReviewFieldKey): ReviewIssue[] {
  return result.clarifications
    .filter((clarification) => clarification.field === field)
    .map((clarification) => ({
      code: clarification.reason,
      field: clarification.field,
      severity: "WARNING" as const,
      // Keep the server-authored clarification message verbatim.
      message: clarification.message,
    }));
}

function extractionField<K extends ReviewFieldKey>(
  key: K,
  extraction: FieldExtraction<ReviewValueMap[K]>,
  result: ExtractionResult,
): ReviewField<K> {
  const common = {
    key,
    aiStatus: extraction.status,
    sourceText: extraction.sourceText,
    aiNote: extraction.note,
    edited: false,
  } as const;

  const extractedValue = key === "transport"
    ? resolveTransportCandidateFromExtraction(extraction)
    : extraction.status === "EXTRACTED"
      ? extraction.value
      : null;

  if (extractedValue !== null) {
    return {
      ...common,
      origin: "AI",
      value: extractedValue as ReviewValueMap[K],
      aiValue: extractedValue as ReviewValueMap[K],
      issues: [],
    };
  }

  return {
    ...common,
    origin: "EMPTY",
    value: null,
    aiValue: null,
    issues: clarificationIssues(result, key),
  };
}

/** Converts the verified extraction result into a review draft without applying it to the form. */
export function draftFromExtraction(result: ExtractionResult): TripRequirementReviewDraft {
  const fields = {} as ReviewFieldMap;
  for (const key of REVIEW_FIELD_KEYS) {
    const extraction = result.fields[key] as FieldExtraction<ReviewValueMap[typeof key]>;
    fields[key] = extractionField(key, extraction, result) as ReviewFieldMap[typeof key];
  }
  return { fields };
}

function canonicalFormValue<K extends ReviewFieldKey>(
  key: K,
  payload: Record<string, unknown>,
  complete: TripRequirementInput | null,
): ReviewValueMap[K] | null {
  if (complete) return complete[key] as ReviewValueMap[K];

  const parsed = tripRequirementInputSchema.partial().safeParse({ [key]: payload[key] });
  return parsed.success ? (parsed.data[key] as ReviewValueMap[K]) : null;
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function formIssues(fields: TripRequirementFormFields): ReviewIssue[] {
  return Object.entries(validateRequiredFields(fields)).map(([field, message]) => ({
    code: "CLIENT_VALIDATION",
    field,
    severity: "ERROR" as const,
    message,
  }));
}

function reviewFieldForValidationPath(path: string): ReviewFieldKey {
  if (path.startsWith("companions.")) return "companions";
  if (path.startsWith("mobilityConstraints.")) return "mobilityConstraints";
  if (REVIEW_FIELD_KEYS.includes(path as ReviewFieldKey)) return path as ReviewFieldKey;
  return "durationDays";
}

function userField<K extends ReviewFieldKey>(
  key: K,
  value: ReviewValueMap[K] | null,
  issues: ReviewIssue[],
): ReviewField<K> {
  return {
    key,
    origin: hasValue(value) ? "USER" : "EMPTY",
    value,
    aiStatus: null,
    sourceText: null,
    aiNote: null,
    aiValue: null,
    edited: false,
    issues,
  };
}

/** Builds a review draft from the existing controlled US-24 form state. */
export function draftFromFormFields(fields: TripRequirementFormFields): TripRequirementReviewDraft {
  const payload = buildPayload(fields);
  const parsed = tripRequirementInputSchema.safeParse(payload);
  const complete = parsed.success ? parsed.data : null;
  const issues = formIssues(fields);
  const issuesByField = new Map<ReviewFieldKey, ReviewIssue[]>();

  for (const issue of issues) {
    const key = reviewFieldForValidationPath(issue.field);
    const list = issuesByField.get(key) ?? [];
    list.push({ ...issue, field: key });
    issuesByField.set(key, list);
  }

  const fieldsByKey = {} as ReviewFieldMap;
  for (const key of REVIEW_FIELD_KEYS) {
    const value = canonicalFormValue(key, payload, complete);
    fieldsByKey[key] = userField(key, value, issuesByField.get(key) ?? []) as ReviewFieldMap[typeof key];
  }
  return { fields: fieldsByKey };
}

/** Creates a candidate-shaped object; callers must still validate it on the server. */
export function draftToCandidate(draft: TripRequirementReviewDraft): TripRequirementCandidate {
  const fields = draft.fields;
  const interests = fields.interests.value;
  return {
    startDate: fields.startDate.value as string | null,
    durationDays: fields.durationDays.value as number | null,
    companions: fields.companions.value as ReviewValueMap["companions"] | null,
    interests: Array.isArray(interests) ? [...interests] : [],
    pace: fields.pace.value as ReviewValueMap["pace"] | null,
    transport: fields.transport.value as ReviewValueMap["transport"] | null,
    mobilityConstraints: fields.mobilityConstraints.value as ReviewValueMap["mobilityConstraints"] | null,
  };
}

/** Converts canonical review values back to the controlled string-based form state. */
export function draftToFormFields(draft: TripRequirementReviewDraft): TripRequirementFormFields {
  const candidate = draftToCandidate(draft);
  return {
    startDate: candidate.startDate ?? "",
    durationDays: candidate.durationDays === null ? "" : String(candidate.durationDays),
    transport: candidate.transport ?? "",
    companionType: candidate.companions?.type ?? "",
    companionGroupSize: candidate.companions === null ? "" : String(candidate.companions.groupSize),
    interests: [...candidate.interests],
    pace: candidate.pace ?? "",
    mobilityFlags: candidate.mobilityConstraints?.flags ? [...candidate.mobilityConstraints.flags] : [],
    mobilityNote: candidate.mobilityConstraints?.note ?? "",
  };
}

export function countReviewValues(draft: TripRequirementReviewDraft): number {
  return REVIEW_FIELD_KEYS.filter((key) => hasValue(draft.fields[key].value)).length;
}

export function countUnactionedAiFields(draft: TripRequirementReviewDraft): number {
  return REVIEW_FIELD_KEYS.filter(
    (key) => draft.fields[key].origin === "AI" && draft.fields[key].aiStatus === "EXTRACTED" && !draft.fields[key].edited,
  ).length;
}

export function listMissingRequiredFields(
  draft: TripRequirementReviewDraft,
): Array<(typeof REQUIRED_REVIEW_FIELDS)[number]> {
  return REQUIRED_REVIEW_FIELDS.filter((key) => !hasValue(draft.fields[key].value));
}

export function countReviewIssues(draft: TripRequirementReviewDraft): number {
  const fieldsNeedingAttention = new Set<string>();
  for (const key of REVIEW_FIELD_KEYS) {
    if (draft.fields[key].issues.length > 0) fieldsNeedingAttention.add(key);
  }
  for (const key of listMissingRequiredFields(draft)) fieldsNeedingAttention.add(key);
  return fieldsNeedingAttention.size;
}

export function reviewFieldLabel(key: ReviewFieldKey): string {
  return {
    startDate: "Ngày bắt đầu",
    durationDays: "Thời lượng chuyến đi",
    companions: "Người đồng hành",
    interests: "Sở thích chuyến đi",
    pace: "Nhịp độ chuyến đi",
    transport: "Phương tiện di chuyển",
    mobilityConstraints: "Ràng buộc di chuyển",
  }[key];
}

export function isCanonicalStartDate(value: unknown): value is string {
  return typeof value === "string" && isValidCalendarDate(value);
}

function setRawFieldValue(
  fields: TripRequirementFormFields,
  key: ReviewFieldKey,
  rawValue: ReviewRawFieldValue,
): TripRequirementFormFields {
  switch (key) {
    case "startDate":
      return { ...fields, startDate: typeof rawValue === "string" ? rawValue : "" };
    case "durationDays":
      return {
        ...fields,
        durationDays:
          typeof rawValue === "number" && Number.isFinite(rawValue)
            ? String(rawValue)
            : typeof rawValue === "string"
              ? rawValue
              : "",
      };
    case "transport":
      return { ...fields, transport: typeof rawValue === "string" ? rawValue : "" };
    case "companions":
      return {
        ...fields,
        companionType:
          rawValue && !Array.isArray(rawValue) && typeof rawValue === "object" && "type" in rawValue
            ? rawValue.type
            : "",
        companionGroupSize:
          rawValue && !Array.isArray(rawValue) && typeof rawValue === "object" && "groupSize" in rawValue
            ? rawValue.groupSize
            : "",
      };
    case "interests":
      return { ...fields, interests: Array.isArray(rawValue) ? [...rawValue] : [] };
    case "pace":
      return { ...fields, pace: typeof rawValue === "string" ? rawValue : "" };
    case "mobilityConstraints":
      return {
        ...fields,
        mobilityFlags:
          rawValue && !Array.isArray(rawValue) && typeof rawValue === "object" && "flags" in rawValue
            ? [...rawValue.flags]
            : [],
        mobilityNote:
          rawValue && !Array.isArray(rawValue) && typeof rawValue === "object" && "note" in rawValue
            ? rawValue.note
            : "",
      };
  }
}

function relevantValidationErrors(
  key: ReviewFieldKey,
  errors: Record<string, string>,
): Record<string, string> {
  const paths: Record<ReviewFieldKey, string[]> = {
    startDate: ["startDate"],
    durationDays: ["durationDays"],
    companions: ["companions.type", "companions.groupSize"],
    interests: ["interests"],
    pace: ["pace"],
    transport: ["transport"],
    mobilityConstraints: ["mobilityConstraints.flags", "mobilityConstraints.note"],
  };
  return Object.fromEntries(
    paths[key].filter((path) => errors[path]).map((path) => [path, errors[path]]),
  );
}

function editedField<K extends ReviewFieldKey>(
  current: ReviewField<K>,
  value: ReviewValueMap[K] | null,
): ReviewField<K> {
  return {
    ...current,
    origin: hasValue(value) ? "USER" : "EMPTY",
    value,
    edited: true,
    issues: [],
  };
}

function emptyValueFor(key: ReviewFieldKey): ReviewValueMap[ReviewFieldKey] | null {
  if (key === "interests") return [] as ReviewValueMap["interests"];
  return null;
}

/**
 * Validates one in-place review edit using the US-24 form validator and schema.
 * Invalid values return without changing the draft. `now` is injectable so the
 * Asia/Ho_Chi_Minh date rule is deterministic in tests.
 */
export function applyFieldEdit(
  draft: TripRequirementReviewDraft,
  key: ReviewFieldKey,
  newRawValue: ReviewRawFieldValue,
  now: Date = new Date(),
): ReviewEditResult {
  const nextFormFields = setRawFieldValue(draftToFormFields(draft), key, newRawValue);
  const allErrors = validateRequiredFields(nextFormFields);
  const errors = relevantValidationErrors(key, allErrors);

  if (key === "startDate" && errors.startDate === undefined && nextFormFields.startDate.trim() !== "") {
    const payload = buildPayload(nextFormFields);
    const readiness = evaluateTripRequirement(
      { ...draftToCandidate(draft), startDate: payload.startDate as string | null } as TripRequirementInput,
      now,
    );
    if (readiness.startDateIssue === "IN_PAST") {
      errors.startDate = "Ngày bắt đầu không được ở trong quá khứ.";
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, draft, errors, confirmation: "NOT_CONFIRMED" };
  }

  const payload = buildPayload(nextFormFields);
  const canonical = canonicalFormValue(key, payload, null);
  if (canonical === null && key !== "startDate" && key !== "companions" && key !== "interests" && key !== "pace" && key !== "mobilityConstraints") {
    return {
      ok: false,
      draft,
      errors: { [key]: "Giá trị trường chưa hợp lệ." },
      confirmation: "NOT_CONFIRMED",
    };
  }

  const nextFields = {
    ...draft.fields,
    [key]: editedField(draft.fields[key], canonical as ReviewValueMap[typeof key] | null),
  } as ReviewFieldMap;
  return {
    ok: true,
    draft: { fields: nextFields },
    confirmation: "NOT_CONFIRMED",
  };
}

/** Clears one field in the draft without changing the preserved AI suggestion. */
export function clearField(
  draft: TripRequirementReviewDraft,
  key: ReviewFieldKey,
): TripRequirementReviewDraft {
  const nextFields = {
    ...draft.fields,
    [key]: editedField(draft.fields[key], emptyValueFor(key) as ReviewValueMap[typeof key] | null),
  } as ReviewFieldMap;
  return { fields: nextFields };
}

/** Restores only an actually extracted AI value; ambiguous/missing fields are untouched. */
export function restoreAiValue(
  draft: TripRequirementReviewDraft,
  key: ReviewFieldKey,
): TripRequirementReviewDraft {
  const current = draft.fields[key];
  if (current.aiStatus !== "EXTRACTED" || current.aiValue === null) return draft;
  const restoredValue = Array.isArray(current.aiValue)
    ? [...current.aiValue]
    : current.aiValue && typeof current.aiValue === "object"
      ? { ...current.aiValue }
      : current.aiValue;
  const nextFields = {
    ...draft.fields,
    [key]: {
      ...current,
      origin: hasValue(current.aiValue) ? "AI" : "EMPTY",
      value: restoredValue,
      edited: false,
      issues: [],
    },
  } as ReviewFieldMap;
  return { fields: nextFields };
}

function cloneReviewValue<K extends ReviewFieldKey>(
  key: K,
  value: TripRequirementInput[K],
): ReviewValueMap[K] | null {
  if (value === null) return null;
  if (key === "interests") return [...(value as TripRequirementInput["interests"])] as ReviewValueMap[K];
  if (key === "companions") return { ...(value as NonNullable<TripRequirementInput["companions"]>) } as ReviewValueMap[K];
  if (key === "mobilityConstraints") {
    const mobility = value as NonNullable<TripRequirementInput["mobilityConstraints"]>;
    return { ...mobility, flags: [...mobility.flags] } as ReviewValueMap[K];
  }
  return value as ReviewValueMap[K];
}

function syncDraftWithRequirement(
  draft: TripRequirementReviewDraft,
  requirement: TripRequirementInput,
): TripRequirementReviewDraft {
  const fields = {} as ReviewFieldMap;
  for (const key of REVIEW_FIELD_KEYS) {
    fields[key] = {
      ...draft.fields[key],
      // Server-normalized values are authoritative, but provenance and the
      // user's edited badge remain intact for the review surface.
      value: cloneReviewValue(key, requirement[key]),
      issues: [],
    } as ReviewFieldMap[typeof key];
  }
  return { fields };
}

/**
 * A successful check must not silently replace an explicit user transport
 * choice with a different server-normalized value.
 */
export function hasUserTransportNormalizationMismatch(
  draft: TripRequirementReviewDraft,
  requirement: TripRequirementInput,
): boolean {
  const field = draft.fields.transport;
  return field.origin === "USER" &&
    field.value !== null &&
    field.value !== requirement.transport;
}

/** Converts a successful authoritative check into the in-memory confirmation snapshot. */
export function confirmDraft(
  draft: TripRequirementReviewDraft,
  result: CheckResult,
  checkedAt: Date = new Date(),
): { draft: TripRequirementReviewDraft; confirmation: ReviewConfirmation } {
  if (!result.confirmable || result.requirement === null || result.readiness === null) {
    return {
      draft,
      confirmation: { state: "NOT_CONFIRMED", snapshot: null },
    };
  }

  const normalizedDraft = syncDraftWithRequirement(draft, result.requirement);
  return {
    draft: normalizedDraft,
    confirmation: {
      state: "CONFIRMED",
      snapshot: {
        requirement: result.requirement,
        usesRelativeDays: result.usesRelativeDays,
        eligibleForFinalConfirmation: result.readiness.finalConfirmation,
        warnings: result.issues.filter((issue) => issue.severity === "WARNING"),
        checkedAt: checkedAt.toISOString(),
      },
    },
  };
}

/** Any subsequent edit must invalidate the check snapshot before a future save flow. */
export function invalidateConfirmation(): ReviewConfirmation {
  return { state: "NOT_CONFIRMED", snapshot: null };
}

export type ReviewExtractionField = PreferenceExtractionField;
