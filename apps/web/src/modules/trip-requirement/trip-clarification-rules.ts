import { z } from "zod";

import {
  MAX_DURATION_DAYS,
  MIN_DURATION_DAYS,
  PACE_OPTIONS,
  TRANSPORT_OPTIONS,
  isValidCalendarDate,
} from "./trip-requirement-contract";
import type { CheckIssue, CheckResult } from "./trip-requirement-check";
import type {
  ClarificationReason,
  ExtractionResult,
  PreferenceExtractionField,
  PreferenceExtractionStatus,
} from "../preference-extraction/preference-extraction-contract";
import { classifyTransportText } from "./trip-transport-policy";

/** The canonical seven-field order shared by extraction, review and check. */
export const CLARIFICATION_FIELD_VALUES = [
  "startDate",
  "durationDays",
  "companions",
  "interests",
  "pace",
  "transport",
  "mobilityConstraints",
] as const;

export type ClarificationField = (typeof CLARIFICATION_FIELD_VALUES)[number];

export const CLARIFICATION_KIND_VALUES = [
  "MISSING",
  "AMBIGUOUS",
  "CONFLICT",
  "UNSUPPORTED",
  "OUT_OF_RANGE",
  "INVALID",
] as const;
export type ClarificationKind = (typeof CLARIFICATION_KIND_VALUES)[number];

export const CLARIFICATION_SEVERITY_VALUES = ["BLOCKING", "ADVISORY"] as const;
export type ClarificationSeverity = (typeof CLARIFICATION_SEVERITY_VALUES)[number];

const clarificationOptionSchema = z
  .object({
    value: z.string().min(1),
    label: z.string().min(1),
  })
  .strict();

const clarificationResolutionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ENTER_VALUE") }).strict(),
  z.object({ type: z.literal("SKIP_ALLOWED") }).strict(),
  z
    .object({
      type: z.literal("CHOOSE_ONE"),
      options: z.array(clarificationOptionSchema).min(1),
    })
    .strict(),
]);

export const clarificationRequestSchema = z
  .object({
    id: z.string().min(1),
    field: z.enum(CLARIFICATION_FIELD_VALUES),
    kind: z.enum(CLARIFICATION_KIND_VALUES),
    severity: z.enum(CLARIFICATION_SEVERITY_VALUES),
    question: z.string().min(1),
    hint: z.string().min(1).optional(),
    sourceText: z.string().nullable(),
    resolution: clarificationResolutionSchema,
  })
  .strict();

export const clarificationRequestsSchema = z.array(clarificationRequestSchema);
export type ClarificationRequest = z.infer<typeof clarificationRequestSchema>;

export const EXTRACTION_REASON_TO_CLARIFICATION_KIND: Readonly<
  Record<ClarificationReason, ClarificationKind | null>
> = {
  AMBIGUOUS_TRANSPORT: "AMBIGUOUS",
  UNSUPPORTED_TRANSPORT: "UNSUPPORTED",
  AMBIGUOUS_DATE: "AMBIGUOUS",
  AMBIGUOUS_DURATION: "AMBIGUOUS",
  OUT_OF_RANGE: "OUT_OF_RANGE",
  CONFLICT: "CONFLICT",
  OTHER: null,
};

const FIELD_ORDER = new Map<ClarificationField, number>(
  CLARIFICATION_FIELD_VALUES.map((field, index) => [field, index]),
);

const REQUIRED_FIELDS = new Set<ClarificationField>(["durationDays", "transport"]);

const QUESTION_BY_FIELD: Record<ClarificationField, string> = {
  startDate: "Bạn muốn bắt đầu chuyến đi vào ngày nào?",
  durationDays: "Bạn muốn chuyến đi kéo dài bao nhiêu ngày?",
  companions: "Bạn đi cùng ai và nhóm có bao nhiêu người?",
  interests: "Bạn muốn ưu tiên những sở thích nào trong chuyến đi?",
  pace: "Bạn muốn nhịp độ chuyến đi như thế nào?",
  transport: "Bạn muốn đi bằng xe máy hay ô tô?",
  mobilityConstraints: "Bạn có ràng buộc di chuyển nào cần lưu ý không?",
};

const FIELD_HINT: Partial<Record<ClarificationField, string>> = {
  durationDays: `Nhập số nguyên từ ${MIN_DURATION_DAYS} đến ${MAX_DURATION_DAYS} ngày.`,
  transport: "MVP chỉ hỗ trợ xe máy hoặc ô tô.",
};

function isClarificationField(value: string): value is ClarificationField {
  return (CLARIFICATION_FIELD_VALUES as readonly string[]).includes(value);
}

function boundedSourceText(value: string | null): string | null {
  if (value === null) return null;
  return [...value].slice(0, 200).join("");
}

function extractionKind(
  status: PreferenceExtractionStatus,
  reason: ClarificationReason | undefined,
): ClarificationKind {
  if (status === "MISSING") return "MISSING";
  const mapped = reason === undefined ? null : EXTRACTION_REASON_TO_CLARIFICATION_KIND[reason];
  if (mapped !== null && mapped !== undefined) return mapped;
  if (status === "AMBIGUOUS") return "AMBIGUOUS";
  return "UNSUPPORTED";
}

function checkKind(issue: CheckIssue): ClarificationKind {
  switch (issue.code) {
    case "MISSING_REQUIRED":
      return "MISSING";
    case "START_DATE_INVALID":
    case "START_DATE_IN_PAST":
      return "INVALID";
    case "TRANSPORT_UNSUPPORTED":
      return "UNSUPPORTED";
    case "COMPANIONS_CONFLICT_CHILDREN":
    case "PACE_MOBILITY_MISMATCH":
      return "CONFLICT";
    case "INVALID_VALUE":
      // The US-26 check intentionally exposes one stable code for schema
      // failures. Bounded fields are classified as range problems here; the
      // check remains the source of truth for the actual validation message.
      return issue.field === "durationDays" ||
        issue.field === "companions" ||
        issue.field === "interests" ||
        issue.field === "mobilityConstraints"
        ? "OUT_OF_RANGE"
        : "INVALID";
    case "INVALID_BODY":
      return "INVALID";
  }
}

function resolutionFor(
  field: ClarificationField,
  kind: ClarificationKind,
  severity: ClarificationSeverity,
): ClarificationRequest["resolution"] {
  if (field === "transport") {
    return {
      type: "CHOOSE_ONE",
      options: TRANSPORT_OPTIONS.map(({ value, label }) => ({ value, label })),
    };
  }
  if (severity === "ADVISORY" && kind === "UNSUPPORTED") {
    return { type: "SKIP_ALLOWED" };
  }
  if (field === "pace" && kind === "AMBIGUOUS") {
    return {
      type: "CHOOSE_ONE",
      options: PACE_OPTIONS.map(({ value, label }) => ({ value, label })),
    };
  }
  return { type: "ENTER_VALUE" };
}

function clarificationRequest(
  field: ClarificationField,
  kind: ClarificationKind,
  severity: ClarificationSeverity,
  sourceText: string | null,
): ClarificationRequest {
  const request = {
    id: `${field}:${kind}`,
    field,
    kind,
    severity,
    question: QUESTION_BY_FIELD[field],
    ...(FIELD_HINT[field] ? { hint: FIELD_HINT[field] } : {}),
    sourceText: boundedSourceText(sourceText),
    resolution: resolutionFor(field, kind, severity),
  };
  return clarificationRequestSchema.parse(request);
}

function sortAndDedupe(requests: ClarificationRequest[]): ClarificationRequest[] {
  const unique = new Map<string, ClarificationRequest>();
  for (const request of requests) unique.set(request.id, request);
  return [...unique.values()].sort((left, right) => {
    const severityOrder = left.severity === right.severity ? 0 : left.severity === "BLOCKING" ? -1 : 1;
    return severityOrder ||
      (FIELD_ORDER.get(left.field) ?? Number.MAX_SAFE_INTEGER) -
        (FIELD_ORDER.get(right.field) ?? Number.MAX_SAFE_INTEGER) ||
      left.id.localeCompare(right.id);
  });
}

/**
 * Derives user-facing clarification requests from verified extraction state.
 * The wording and options are code-owned; provider messages are never used as
 * the question text.
 */
export function deriveClarificationsFromExtraction(
  extraction: ExtractionResult,
): ClarificationRequest[] {
  const requests: ClarificationRequest[] = [];

  for (const field of CLARIFICATION_FIELD_VALUES) {
    const extractedField = extraction.fields[field];
    if (extractedField.status === "EXTRACTED") continue;
    if (extractedField.status === "MISSING" && !REQUIRED_FIELDS.has(field)) continue;

    const clarification = extraction.clarifications.find((item) => item.field === field);
    const kind = extractionKind(extractedField.status, clarification?.reason);
    const severity: ClarificationSeverity =
      REQUIRED_FIELDS.has(field) || (field === "companions" && kind === "CONFLICT")
        ? "BLOCKING"
        : "ADVISORY";
    requests.push(
      clarificationRequest(
        field,
        kind,
        severity,
        extractedField.sourceText ?? clarification?.sourceText ?? null,
      ),
    );
  }

  return sortAndDedupe(requests);
}

/** Maps US-26 check issues without duplicating the check's validation rules. */
export function deriveClarificationsFromCheck(
  check: CheckResult,
): ClarificationRequest[] {
  const requests = check.issues.flatMap((issue) => {
    if (!isClarificationField(issue.field)) return [];
    const severity: ClarificationSeverity = issue.severity === "WARNING" ? "ADVISORY" : "BLOCKING";
    return [clarificationRequest(issue.field, checkKind(issue), severity, null)];
  });
  return sortAndDedupe(requests);
}

function dayNumbersInSource(sourceText: string): { values: number[]; hasRange: boolean } {
  const values = [...sourceText.matchAll(/(?<!\d)(\d{1,3})\s*ngày/giu)].map((match) => Number(match[1]));
  const ranges = [...sourceText.matchAll(
    /(?<!\d)(\d{1,3})\s*(?:-|–|—|đến|hoặc|hay)\s*(\d{1,3})\s*ngày/giu,
  )];
  return {
    values,
    hasRange: ranges.length > 0,
  };
}

function absoluteDatesInSource(sourceText: string): string[] {
  const dates = new Set<string>();
  const add = (year: string, month: string, day: string) => {
    const candidate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    if (isValidCalendarDate(candidate)) dates.add(candidate);
  };

  for (const match of sourceText.matchAll(/(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/gu)) {
    add(match[1], match[2], match[3]);
  }
  for (const match of sourceText.matchAll(/(?<!\d)(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?!\d)/gu)) {
    add(match[3], match[2], match[1]);
  }
  for (const match of sourceText.matchAll(/ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})(?!\d)/giu)) {
    add(match[3], match[2], match[1]);
  }
  return [...dates];
}

function downgradedField<T>(
  field: { sourceText: string; note: string | null },
  note: string,
) {
  return {
    status: "AMBIGUOUS" as const,
    value: null,
    sourceText: field.sourceText,
    note,
  } satisfies {
    status: "AMBIGUOUS";
    value: null;
    sourceText: string;
    note: string;
  };
}

function appendClarification(
  clarifications: ExtractionResult["clarifications"],
  field: PreferenceExtractionField,
  reason: ClarificationReason,
  sourceText: string,
  message: string,
): ExtractionResult["clarifications"] {
  if (clarifications.some((item) => item.field === field && item.reason === reason)) {
    return clarifications;
  }
  return [
    ...clarifications,
    { field, reason, message, sourceText: boundedSourceText(sourceText) ?? sourceText.slice(0, 200) },
  ];
}

function downgradedTransportField(
  field: Extract<ExtractionResult["fields"]["transport"], { status: "EXTRACTED" }>,
  status: "AMBIGUOUS" | "UNSUPPORTED",
  note: string,
): Extract<ExtractionResult["fields"]["transport"], { status: "AMBIGUOUS" | "UNSUPPORTED" }> {
  return {
    status,
    value: null,
    sourceText: field.sourceText,
    note,
  } as const;
}

function downgradeTransportContradiction(
  field: ExtractionResult["fields"]["transport"],
): {
  field: ExtractionResult["fields"]["transport"];
  reason: ClarificationReason | null;
  message: string | null;
} {
  if (field.status !== "EXTRACTED") {
    return { field, reason: null, message: null };
  }

  const classification = classifyTransportText(field.sourceText);
  if (classification.kind === "MOTORCYCLE" || classification.kind === "CAR") {
    if (classification.kind === field.value) {
      return { field, reason: null, message: null };
    }
    return {
      field: downgradedTransportField(
        field,
        "AMBIGUOUS",
        "Mô tả phương tiện và giá trị trích xuất đang mâu thuẫn; vui lòng chọn xe máy hoặc ô tô.",
      ),
      reason: "CONFLICT",
      message: "Mô tả phương tiện và giá trị trích xuất đang mâu thuẫn; vui lòng chọn xe máy hoặc ô tô.",
    };
  }

  if (classification.kind === "UNSUPPORTED") {
    return {
      field: downgradedTransportField(
        field,
        "UNSUPPORTED",
        "Phương tiện trong mô tả chưa được hỗ trợ; vui lòng chọn xe máy hoặc ô tô.",
      ),
      reason: "UNSUPPORTED_TRANSPORT",
      message: "Phương tiện trong mô tả chưa được hỗ trợ; vui lòng chọn xe máy hoặc ô tô.",
    };
  }

  if (classification.kind === "AMBIGUOUS" || classification.kind === "NONE") {
    return {
      field: downgradedTransportField(
        field,
        "AMBIGUOUS",
        "Phương tiện trong mô tả chưa đủ rõ; vui lòng chọn xe máy hoặc ô tô.",
      ),
      reason: "AMBIGUOUS_TRANSPORT",
      message: "Phương tiện trong mô tả chưa đủ rõ; vui lòng chọn xe máy hoặc ô tô.",
    };
  }

  return {
    field: downgradedTransportField(
      field,
      "AMBIGUOUS",
      "Mô tả phương tiện có thông tin mâu thuẫn; vui lòng chọn xe máy hoặc ô tô.",
    ),
    reason: "CONFLICT",
    message: "Mô tả phương tiện có thông tin mâu thuẫn; vui lòng chọn xe máy hoặc ô tô.",
  };
}

/**
 * Downgrades only deterministic contradictions found in verified source text.
 * The input is never mutated and the ExtractionResult shape is unchanged.
 */
export function downgradeContradictions(extraction: ExtractionResult): ExtractionResult {
  const fields = { ...extraction.fields };
  let clarifications = [...extraction.clarifications];

  const duration = fields.durationDays;
  if (duration.status === "EXTRACTED") {
    const dayValues = dayNumbersInSource(duration.sourceText);
    if (dayValues.hasRange || new Set(dayValues.values).size > 1) {
      fields.durationDays = downgradedField(
        duration,
        "Thời lượng có nhiều khả năng; vui lòng chọn một số ngày cụ thể.",
      ) as unknown as typeof duration;
      clarifications = appendClarification(
        clarifications,
        "durationDays",
        "AMBIGUOUS_DURATION",
        duration.sourceText,
        "Thời lượng chưa rõ số ngày; vui lòng nhập một số ngày cụ thể.",
      );
    }
  }

  const startDate = fields.startDate;
  if (startDate.status === "EXTRACTED" && absoluteDatesInSource(startDate.sourceText).length > 1) {
    fields.startDate = downgradedField(
      startDate,
      "Ngày bắt đầu có nhiều lựa chọn; vui lòng chọn một ngày cụ thể.",
    ) as unknown as typeof startDate;
    clarifications = appendClarification(
      clarifications,
      "startDate",
      "CONFLICT",
      startDate.sourceText,
      "Ngày bắt đầu đang có nhiều lựa chọn; vui lòng chọn một ngày cụ thể.",
    );
  }

  const transportResult = downgradeTransportContradiction(fields.transport);
  if (transportResult.reason !== null && transportResult.message !== null) {
    fields.transport = transportResult.field;
    clarifications = appendClarification(
      clarifications,
      "transport",
      transportResult.reason,
      fields.transport.sourceText ?? "",
      transportResult.message,
    );
  }

  const missingRequired = (["durationDays", "transport"] as const).filter(
    (field) => fields[field].status !== "EXTRACTED",
  );

  return {
    ...extraction,
    fields,
    clarifications,
    missingRequired,
  };
}

export const clarificationRules = {
  clarificationRequestSchema,
  clarificationRequestsSchema,
  deriveClarificationsFromExtraction,
  deriveClarificationsFromCheck,
  downgradeContradictions,
} as const;
