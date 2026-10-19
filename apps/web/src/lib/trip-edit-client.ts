import { z } from "zod";

import { sendIdempotentMutation } from "@/lib/mutation-client";
import type { MutationOutcome } from "@/lib/mutation-contract";
import { editCandidateSchema, type EditCandidate } from "@/modules/trip-edit/edit-candidate";
import type { ApplyEditResult } from "@/modules/trip-edit/apply-edit";
import type { PreviewEditResult } from "@/modules/trip-edit/trip-edit-service";
import type {
  TripValidation,
  ValidationFinding,
  ValidationGroupName,
} from "@/modules/trip-validation/trip-validation";

const groupNames = [
  "openingHours",
  "minimumDuration",
  "travelTime",
  "scheduleConflict",
] as const satisfies readonly ValidationGroupName[];

const groupStatusSchema = z.enum(["SATISFIED", "VIOLATION", "INSUFFICIENT_DATA"]);
const findingSchema = z.object({
  group: z.enum(groupNames),
  status: z.enum(["VIOLATION", "INSUFFICIENT_DATA"]),
  reasonCode: z.string(),
  message: z.string(),
  affectedVisitId: z.string().optional(),
  fromVisitId: z.string().optional(),
  toVisitId: z.string().optional(),
  visitIds: z.tuple([z.string(), z.string()]).optional(),
}).strict() satisfies z.ZodType<ValidationFinding>;

const validationSchema = z.object({
  timeReference: z.string(),
  groups: z.object({
    openingHours: z.object({ status: groupStatusSchema, findings: z.array(findingSchema) }).strict(),
    minimumDuration: z.object({ status: groupStatusSchema, findings: z.array(findingSchema) }).strict(),
    travelTime: z.object({ status: groupStatusSchema, findings: z.array(findingSchema) }).strict(),
    scheduleConflict: z.object({ status: groupStatusSchema, findings: z.array(findingSchema) }).strict(),
  }).strict(),
  canConfirm: z.boolean(),
}).strict() satisfies z.ZodType<TripValidation>;

const previewResultSchema = z.object({
  baseRevision: z.iso.datetime(),
  candidate: editCandidateSchema,
  validation: validationSchema,
  eligibleForConfirmation: z.boolean(),
}).strict() satisfies z.ZodType<PreviewEditResult>;

const applyResultSchema = z.object({
  tripId: z.string().min(1),
  baseRevision: z.iso.datetime(),
  kind: z.enum(["MANUAL", "AI", "IN_TRIP"]),
  candidate: editCandidateSchema,
  validation: validationSchema,
}).strict() satisfies z.ZodType<ApplyEditResult>;

const successEnvelopeSchema = z.object({
  success: z.literal(true),
  data: previewResultSchema,
}).strict();

const errorEnvelopeSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }).strict(),
}).strict();

export type TripEditPreviewOutcome =
  | { kind: "PREVIEWED"; result: PreviewEditResult }
  | { kind: "FAILED"; status: number; code: string; message: string }
  | { kind: "NETWORK_ERROR" }
  | { kind: "TIMEOUT" };

export type TripEditPreviewInput = {
  baseRevision: string;
  candidate: EditCandidate;
};

export type TripEditPreviewOptions = {
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

export type TripEditApplyInput = {
  baseRevision: string;
  candidate: EditCandidate;
  confirmed: true;
  kind: "MANUAL";
};

const DEFAULT_TIMEOUT_MS = 15_000;

function failed(status: number, code: string, message: string): TripEditPreviewOutcome {
  return { kind: "FAILED", status, code, message };
}

/** Validate the untrusted HTTP envelope before exposing a preview to the UI. */
export function decideTripEditPreviewResponse(
  status: number,
  body: unknown,
): TripEditPreviewOutcome {
  if (status === 200) {
    const parsed = successEnvelopeSchema.safeParse(body);
    return parsed.success
      ? { kind: "PREVIEWED", result: parsed.data.data }
      : failed(502, "INVALID_RESPONSE", "Phản hồi kiểm tra hành trình không hợp lệ.");
  }

  const parsed = errorEnvelopeSchema.safeParse(body);
  if (!parsed.success) {
    return failed(status >= 400 ? status : 502, "INVALID_RESPONSE", "Phản hồi kiểm tra hành trình không hợp lệ.");
  }

  const { code, message } = parsed.data.error;
  if (status === 401 || code === "UNAUTHENTICATED") {
    return failed(401, "UNAUTHENTICATED", "Phiên đăng nhập không còn hiệu lực. Vui lòng đăng nhập lại.");
  }
  if (status === 403 || code === "FORBIDDEN") {
    return failed(403, "FORBIDDEN", "Bạn không có quyền kiểm tra hành trình này.");
  }
  if (status === 409 || code === "TRIP_REVISION_CONFLICT") {
    return failed(409, "TRIP_REVISION_CONFLICT", message);
  }
  if (status >= 500) {
    return failed(status, code, "Hệ thống chưa thể kiểm tra hành trình lúc này. Phương án vẫn được giữ lại, hãy thử lại.");
  }
  return failed(status, code, message);
}

/** Call the read-only edit preview endpoint with a bounded client-side wait. */
export async function previewTripEdit(
  tripId: string,
  input: TripEditPreviewInput,
  options: TripEditPreviewOptions = {},
): Promise<TripEditPreviewOutcome> {
  const controller = new AbortController();
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetcher(
      `/api/trips/${encodeURIComponent(tripId)}/edits/preview`,
      {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          baseRevision: input.baseRevision,
          candidate: editCandidateSchema.parse(input.candidate),
        }),
        signal: controller.signal,
      },
    );
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (timedOut) return { kind: "TIMEOUT" };
    return decideTripEditPreviewResponse(response.status, body);
  } catch {
    return timedOut ? { kind: "TIMEOUT" } : { kind: "NETWORK_ERROR" };
  } finally {
    clearTimeout(timeoutId);
  }
}

function unknownApplyOutcome(): MutationOutcome<ApplyEditResult> {
  return {
    status: "UNKNOWN",
    error: {
      code: "OPERATION_STATUS_UNKNOWN",
      message: "Phản hồi áp dụng không hợp lệ. Hãy thử lại cùng request và Idempotency-Key để xác nhận kết quả.",
    },
    retryWithSameKey: true,
  };
}

/** Read the authoritative validation result attached to a known apply rejection. */
export function parseTripEditApplyValidation(details: unknown): TripValidation | null {
  if (typeof details !== "object" || details === null || !("validation" in details)) return null;
  const parsed = validationSchema.safeParse(details.validation);
  return parsed.success ? parsed.data : null;
}

/** Apply one confirmed manual candidate through the shared idempotent mutation client. */
export async function applyTripEdit(
  tripId: string,
  input: TripEditApplyInput,
  idempotencyKey: string,
): Promise<MutationOutcome<ApplyEditResult>> {
  const candidate = editCandidateSchema.parse(input.candidate);
  const response = await sendIdempotentMutation<unknown>(
    `/api/trips/${encodeURIComponent(tripId)}/edits/apply`,
    {
      idempotencyKey,
      init: {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          baseRevision: input.baseRevision,
          candidate,
          confirmed: input.confirmed,
          kind: input.kind,
        }),
      },
    },
  );

  if (response.status !== "SUCCESS") return response;
  const parsed = applyResultSchema.safeParse(response.data);
  if (!parsed.success) return unknownApplyOutcome();

  const data = parsed.data;
  const allChecksPassed = data.validation.canConfirm && [
    data.validation.groups.openingHours.status,
    data.validation.groups.minimumDuration.status,
    data.validation.groups.travelTime.status,
    data.validation.groups.scheduleConflict.status,
  ].every((status) => status === "SATISFIED");
  if (
    data.tripId !== tripId ||
    data.kind !== input.kind ||
    data.baseRevision === input.baseRevision ||
    JSON.stringify(data.candidate) !== JSON.stringify(candidate) ||
    !allChecksPassed
  ) {
    // A malformed success may follow a committed write; only a same-key retry can resolve it.
    return unknownApplyOutcome();
  }

  return { ...response, data };
}

const aiIntentSchema = z.object({
  intentType: z.enum([
    "ADD_VISIT", "REMOVE_VISIT", "MOVE_VISIT", "CHANGE_TIME", "CHANGE_DURATION",
    "REPLACE_VISIT", "UNSUPPORTED", "UNCLEAR",
  ]),
  targetVisitIds: z.array(z.string().min(1).max(128)).max(50),
  destinationId: z.string().min(1).max(128).nullable(),
  params: z.object({
    dayIndex: z.number().int().min(1).max(30).nullable(),
    position: z.number().int().min(1).max(4).nullable(),
    startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u).nullable(),
    durationMinutes: z.number().int().min(1).max(1440).nullable(),
  }).strict(),
  affected: z.object({
    visitIds: z.array(z.string().min(1).max(128)).max(50),
    dayIndexes: z.array(z.number().int().min(1).max(30)).max(30),
  }).strict(),
  needsClarification: z.boolean(),
  clarificationReason: z.enum([
    "MISSING_TARGET", "MISSING_TIME", "MISSING_DAY", "AMBIGUOUS_TARGET",
    "AMBIGUOUS_DESTINATION", "OUT_OF_SCOPE",
  ]).nullable(),
}).strict();

const aiClarificationSchema = z.object({
  code: z.enum([
    "MISSING_TARGET", "MISSING_TIME", "MISSING_DAY", "AMBIGUOUS_TARGET",
    "AMBIGUOUS_DESTINATION", "OUT_OF_SCOPE",
  ]),
  prompt: z.string().min(1).max(500),
  choices: z.array(z.object({
    label: z.string().min(1).max(200),
    resolution: z.object({
      selectedVisitId: z.string().min(1).max(128).optional(),
      selectedDestinationId: z.string().min(1).max(128).optional(),
    }).strict().refine((value) => Number(value.selectedVisitId !== undefined) + Number(value.selectedDestinationId !== undefined) === 1),
  }).strict()).max(50).optional(),
}).strict();

const positionedDiffVisitSchema = z.object({
  visitId: z.string().min(1).max(128),
  destinationId: z.string().min(1).max(128),
  startMinute: z.number().int().min(0).max(1439),
  plannedDurationMinutes: z.number().int().min(1).max(1440),
  order: z.number().int().min(1).max(4),
  dayIndex: z.number().int().min(1).max(30),
}).strict();

const aiDiffSchema = z.object({
  added: z.array(positionedDiffVisitSchema),
  removed: z.array(positionedDiffVisitSchema),
  updated: z.array(z.object({
    visitId: z.string().min(1).max(128),
    before: positionedDiffVisitSchema,
    after: positionedDiffVisitSchema,
    changedFields: z.array(z.enum([
      "dayIndex", "order", "destinationId", "startMinute", "plannedDurationMinutes",
    ])),
  }).strict()),
  tripChanges: z.object({
    startDate: z.object({ before: z.string().nullable(), after: z.string().nullable() }).strict().optional(),
    durationDays: z.object({ before: z.number().int(), after: z.number().int() }).strict().optional(),
    transport: z.object({ before: z.string(), after: z.string() }).strict().optional(),
  }).strict(),
}).strict();

const aiValidationSchema = z.object({
  timeReference: z.string(),
  groups: z.object({
    openingHours: z.object({ status: groupStatusSchema, findings: z.array(findingSchema) }).strict(),
    minimumDuration: z.object({ status: groupStatusSchema, findings: z.array(findingSchema) }).strict(),
    travelTime: z.object({ status: groupStatusSchema, findings: z.array(findingSchema) }).strict(),
    scheduleConflict: z.object({ status: groupStatusSchema, findings: z.array(findingSchema) }).strict(),
  }).strict(),
  canConfirm: z.boolean(),
}).strict() satisfies z.ZodType<TripValidation>;

const aiEditResponseSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("PROPOSED"),
    candidate: editCandidateSchema,
    intent: aiIntentSchema,
    diff: aiDiffSchema,
    validation: aiValidationSchema,
  }).strict(),
  z.object({
    status: z.literal("NEEDS_CLARIFICATION"),
    intent: aiIntentSchema,
    reason: z.enum([
      "MISSING_TARGET", "MISSING_TIME", "MISSING_DAY", "AMBIGUOUS_TARGET",
      "AMBIGUOUS_DESTINATION", "OUT_OF_SCOPE",
    ]),
    clarification: aiClarificationSchema,
  }).strict(),
]);

const aiSuccessEnvelopeSchema = z.object({
  success: z.literal(true),
  data: aiEditResponseSchema,
}).strict();

export type AiTripEditInput = {
  baseRevision: string;
  message: string;
  resolution?: import("@/modules/trip-edit/edit-clarification").EditResolution;
};

export type AiTripEditOutcome =
  | { kind: "RESULT"; result: import("@/modules/trip-edit/ai-edit-service").AiEditServiceResult }
  | { kind: "FAILED"; status: number; code: string; message: string }
  | { kind: "NETWORK_ERROR" }
  | { kind: "TIMEOUT" };

export type AiTripEditOptions = {
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

/** Request one read-only AI proposal or clarification with bounded waiting. */
export async function requestAiTripEdit(
  tripId: string,
  input: AiTripEditInput,
  options: AiTripEditOptions = {},
): Promise<AiTripEditOutcome> {
  const controller = new AbortController();
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetcher(
      `/api/trips/${encodeURIComponent(tripId)}/edits/ai`,
      {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          baseRevision: input.baseRevision,
          message: input.message,
          ...(input.resolution ? { resolution: input.resolution } : {}),
        }),
        signal: controller.signal,
      },
    );
    let body: unknown = null;
    try { body = await response.json(); } catch { body = null; }
    if (timedOut) return { kind: "TIMEOUT" };

    if (response.status === 200) {
      const parsed = aiSuccessEnvelopeSchema.safeParse(body);
      return parsed.success
        ? { kind: "RESULT", result: parsed.data.data as import("@/modules/trip-edit/ai-edit-service").AiEditServiceResult }
        : { kind: "FAILED", status: 502, code: "AI_INVALID_RESPONSE", message: "Phản hồi đề xuất bằng AI không hợp lệ. Hãy thử lại." };
    }

    const parsedError = errorEnvelopeSchema.safeParse(body);
    if (!parsedError.success) {
      return { kind: "FAILED", status: response.status, code: "INVALID_RESPONSE", message: "Hệ thống chưa thể tạo đề xuất lúc này." };
    }
    const { code, message } = parsedError.data.error;
    if (code === "AI_UNAVAILABLE" || code === "AI_INVALID_RESPONSE") {
      return { kind: "FAILED", status: response.status, code, message };
    }
    if (response.status === 409 || code === "TRIP_REVISION_CONFLICT") {
      return { kind: "FAILED", status: 409, code: "TRIP_REVISION_CONFLICT", message };
    }
    return { kind: "FAILED", status: response.status, code, message };
  } catch {
    return timedOut ? { kind: "TIMEOUT" } : { kind: "NETWORK_ERROR" };
  } finally {
    clearTimeout(timeoutId);
  }
}

export type AiTripEditApplyInput = {
  baseRevision: string;
  candidate: EditCandidate;
  confirmed: true;
  kind: "AI";
};

function unknownAiApplyOutcome(): MutationOutcome<ApplyEditResult> {
  return {
    status: "UNKNOWN",
    error: {
      code: "OPERATION_STATUS_UNKNOWN",
      message: "Phản hồi áp dụng không hợp lệ. Hãy thử lại cùng request và Idempotency-Key để xác nhận kết quả.",
    },
    retryWithSameKey: true,
  };
}

/** Confirm an AI candidate through the same idempotent apply endpoint as manual edits. */
export async function applyAiTripEdit(
  tripId: string,
  input: AiTripEditApplyInput,
  idempotencyKey: string,
): Promise<MutationOutcome<ApplyEditResult>> {
  const candidate = editCandidateSchema.parse(input.candidate);
  const response = await sendIdempotentMutation<unknown>(
    `/api/trips/${encodeURIComponent(tripId)}/edits/apply`,
    {
      idempotencyKey,
      init: {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          baseRevision: input.baseRevision,
          candidate,
          confirmed: input.confirmed,
          kind: "AI",
        }),
      },
    },
  );
  if (response.status !== "SUCCESS") return response;
  const parsed = applyResultSchema.safeParse(response.data);
  if (!parsed.success) return unknownAiApplyOutcome();

  const data = parsed.data;
  const allChecksPassed = data.validation.canConfirm && [
    data.validation.groups.openingHours.status,
    data.validation.groups.minimumDuration.status,
    data.validation.groups.travelTime.status,
    data.validation.groups.scheduleConflict.status,
  ].every((status) => status === "SATISFIED");
  if (
    data.tripId !== tripId ||
    data.kind !== "AI" ||
    data.baseRevision === input.baseRevision ||
    JSON.stringify(data.candidate) !== JSON.stringify(candidate) ||
    !allChecksPassed
  ) {
    return unknownAiApplyOutcome();
  }
  return { ...response, data };
}
