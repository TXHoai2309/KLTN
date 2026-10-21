import { z } from "zod";

import { createIdempotencyKey, sendIdempotentMutation } from "@/lib/mutation-client";
import type { MutationOutcome } from "@/lib/mutation-contract";

import { editCandidateSchema, type EditCandidate } from "@/modules/trip-edit/edit-candidate";
import type {
  InTripReplanOutcome,
  InTripReplanResponse,
} from "@/modules/in-trip/in-trip-session";
import { IN_TRIP_NEED_MAX_LENGTH } from "@/modules/in-trip/in-trip-session";
import type { InTripLocation } from "@/modules/in-trip/in-trip-location";
import type {
  InTripApplyData,
  InTripApplyOutcome,
  InTripApplyPayload,
  InTripPreviewOutcome,
} from "@/modules/in-trip/in-trip-session";
import type { TripValidation, ValidationFinding } from "@/modules/trip-validation/trip-validation";
import { TRANSPORT_VALUES } from "@/modules/trip-requirement/trip-requirement-contract";

export const IN_TRIP_REPLAN_TIMEOUT_MS = 20_000;
export const IN_TRIP_PREVIEW_TIMEOUT_MS = 20_000;

export type InTripReplanRequest = {
  baseRevision: string;
  location: InTripLocation;
  need: string;
  resolution?: {
    selectedVisitId?: string;
    selectedDestinationId?: string;
    selectedDayIndex?: number;
  };
};

export type InTripReplanClientOptions = {
  timeoutMs?: number;
  fetcher?: typeof fetch;
};

const idSchema = z.string().min(1).max(128);
const resolutionSchema = z.object({
  selectedVisitId: idSchema.optional(),
  selectedDestinationId: idSchema.optional(),
  selectedDayIndex: z.number().int().min(1).max(30).optional(),
}).strict().refine(
  value => {
    const hasVisit = value.selectedVisitId !== undefined;
    const hasDest = value.selectedDestinationId !== undefined;
    const hasDay = value.selectedDayIndex !== undefined;
    const count = Number(hasVisit) + Number(hasDest) + Number(hasDay);
    if (count === 0) return false;
    if (hasVisit && (hasDest || hasDay)) return false;
    return true;
  },
);

const clarificationReasonSchema = z.enum([
  "MISSING_TARGET",
  "MISSING_TIME",
  "MISSING_DAY",
  "AMBIGUOUS_TARGET",
  "AMBIGUOUS_DESTINATION",
  "OUT_OF_SCOPE",
]);

const clarificationSchema = z.object({
  code: clarificationReasonSchema,
  prompt: z.string().min(1).max(500),
  choices: z.array(z.object({
    label: z.string().min(1).max(200),
    resolution: resolutionSchema,
  }).strict()).max(50).optional(),
}).strict();

const positionedVisitSchema = z.object({
  visitId: idSchema,
  destinationId: idSchema,
  dayIndex: z.number().int().min(1),
  startMinute: z.number().int().min(0).max(1439),
  plannedDurationMinutes: z.number().int().min(1).max(1440),
  order: z.number().int().min(1).max(4),
}).strict();

const editDiffSchema = z.object({
  added: z.array(positionedVisitSchema),
  removed: z.array(positionedVisitSchema),
  updated: z.array(z.object({
    visitId: idSchema,
    before: positionedVisitSchema,
    after: positionedVisitSchema,
    changedFields: z.array(z.enum([
      "dayIndex",
      "order",
      "destinationId",
      "startMinute",
      "plannedDurationMinutes",
    ])),
  }).strict()),
  tripChanges: z.object({
    startDate: z.object({ before: z.string().nullable(), after: z.string().nullable() }).strict().optional(),
    durationDays: z.object({ before: z.number().int(), after: z.number().int() }).strict().optional(),
    transport: z.object({
      before: z.enum(TRANSPORT_VALUES),
      after: z.enum(TRANSPORT_VALUES),
    }).strict().optional(),
  }).strict(),
}).strict();

const responseSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("PROPOSED"),
    candidate: editCandidateSchema,
    diff: editDiffSchema,
    completedVisitIds: z.array(idSchema),
    mandatoryEndpoint: z.object({ destinationId: idSchema, deadline: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u) }).strict().nullable(),
  }).strict(),
  z.object({
    status: z.literal("NEEDS_CLARIFICATION"),
    clarificationReason: clarificationReasonSchema,
    clarification: clarificationSchema,
  }).strict(),
  z.object({ status: z.literal("ALL_COMPLETED") }).strict(),
]) satisfies z.ZodType<InTripReplanResponse>;

const successEnvelopeSchema = z.object({
  success: z.literal(true),
  data: responseSchema,
}).strict();

const errorEnvelopeSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }).strict(),
}).strict();

const validationGroupNames = ["openingHours", "minimumDuration", "travelTime", "scheduleConflict"] as const;
const validationGroupStatusSchema = z.enum(["SATISFIED", "VIOLATION", "INSUFFICIENT_DATA"]);
const validationFindingSchema = z.object({
  group: z.enum(validationGroupNames),
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
    openingHours: z.object({ status: validationGroupStatusSchema, findings: z.array(validationFindingSchema) }).strict(),
    minimumDuration: z.object({ status: validationGroupStatusSchema, findings: z.array(validationFindingSchema) }).strict(),
    travelTime: z.object({ status: validationGroupStatusSchema, findings: z.array(validationFindingSchema) }).strict(),
    scheduleConflict: z.object({ status: validationGroupStatusSchema, findings: z.array(validationFindingSchema) }).strict(),
  }).strict(),
  canConfirm: z.boolean(),
}).strict() satisfies z.ZodType<TripValidation>;
const inTripPreviewDataSchema = z.object({
  validation: validationSchema,
  checkedAt: z.iso.datetime(),
  completedVisitIds: z.array(idSchema),
}).strict();
const inTripPreviewEnvelopeSchema = z.object({ success: z.literal(true), data: inTripPreviewDataSchema }).strict();
const inTripApplyDataSchema = z.object({
  tripId: idSchema,
  baseRevision: z.iso.datetime(),
  kind: z.literal("IN_TRIP"),
  candidate: editCandidateSchema,
  validation: validationSchema,
}).strict() satisfies z.ZodType<InTripApplyData>;
const inTripDetailsSchema = z.object({
  validation: validationSchema.optional(),
  checkedAt: z.iso.datetime().optional(),
}).passthrough();

function invalidInTripApplyOutcome(): MutationOutcome<InTripApplyData> {
  return {
    status: "UNKNOWN",
    error: {
      code: "OPERATION_STATUS_UNKNOWN",
      message: "Phản hồi xác nhận chưa rõ. Hãy thử lại cùng yêu cầu và mã xác nhận.",
    },
    retryWithSameKey: true,
  };
}

function inTripApplyErrorDetails(details: unknown): { validation?: TripValidation; checkedAt?: string } {
  const parsed = inTripDetailsSchema.safeParse(details);
  return parsed.success ? parsed.data : {};
}

const invalidResponse = (): InTripReplanOutcome => ({
  kind: "FAILED",
  status: 502,
  code: "INVALID_RESPONSE",
  message: "Phản hồi đề xuất không hợp lệ. Vị trí và nhu cầu vẫn được giữ lại; hãy thử lại.",
});

/** Validates the private API envelope and maps provider/network failures to UI states. */
export function decideInTripReplanResponse(input:
  | { kind: "network"; timedOut?: boolean }
  | { kind: "http"; status: number; body: unknown }
): InTripReplanOutcome {
  if (input.kind === "network") {
    return input.timedOut ? { kind: "TIMEOUT" } : { kind: "NETWORK_ERROR" };
  }

  if (input.status === 200) {
    const parsed = successEnvelopeSchema.safeParse(input.body);
    return parsed.success
      ? { kind: "RESPONSE", data: parsed.data.data }
      : invalidResponse();
  }

  const parsed = errorEnvelopeSchema.safeParse(input.body);
  if (!parsed.success) return invalidResponse();

  const { code } = parsed.data.error;
  if (code === "AI_INVALID_RESPONSE") {
    return {
      kind: "AI_ERROR",
      code,
      message: "AI chưa tạo được đề xuất hợp lệ. Vị trí và nhu cầu vẫn được giữ lại; bạn có thể thử lại.",
    };
  }
  if (code === "AI_UNAVAILABLE") {
    return {
      kind: "AI_ERROR",
      code,
      message: "Dịch vụ AI hiện chưa sẵn sàng. Vị trí và nhu cầu vẫn được giữ lại; bạn có thể thử lại.",
    };
  }

  const message = input.status === 401
    ? "Phiên đăng nhập không còn hiệu lực. Vui lòng đăng nhập lại."
    : input.status === 403
      ? "Bạn không có quyền đề xuất lại chuyến đi này."
      : input.status === 404
        ? "Không tìm thấy chuyến đi của bạn."
        : code === "TRIP_REVISION_CONFLICT"
          ? "Hành trình đã thay đổi. Hãy tải lại trang trước khi đề xuất lại."
          : input.status >= 500
            ? "Hệ thống chưa thể tạo đề xuất lúc này. Vị trí và nhu cầu vẫn được giữ lại; hãy thử lại."
            : parsed.data.error.message;

  return { kind: "FAILED", status: input.status, code, message };
}

/** Sends coordinates and the new need only in the POST body, never in the URL. */
export async function requestInTripReplan(
  tripId: string,
  request: InTripReplanRequest,
  options: InTripReplanClientOptions = {},
): Promise<InTripReplanOutcome> {
  const timeoutMs = options.timeoutMs ?? IN_TRIP_REPLAN_TIMEOUT_MS;
  const fetcher = options.fetcher ?? fetch;
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    if ([...request.need].length > IN_TRIP_NEED_MAX_LENGTH) {
      return {
        kind: "FAILED",
        status: 400,
        code: "VALIDATION_ERROR",
        message: `Nhu cầu mới không được vượt quá ${IN_TRIP_NEED_MAX_LENGTH} ký tự.`,
      };
    }

    const response = await fetcher(`/api/trips/${encodeURIComponent(tripId)}/in-trip/replan`, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      if (timedOut) return { kind: "TIMEOUT" };
      body = null;
    }
    return decideInTripReplanResponse({ kind: "http", status: response.status, body });
  } catch {
    return decideInTripReplanResponse({ kind: "network", timedOut });
  } finally {
    clearTimeout(timeout);
  }
}

export type InTripPreviewRequest = {
  baseRevision: string;
  candidate: EditCandidate;
  location: InTripLocation;
  mandatoryEndpoint: { destinationId: string; deadline: string } | null;
};

/** Check a proposed in-trip candidate; location is sent only in the private POST body. */
export async function previewInTrip(
  tripId: string,
  request: InTripPreviewRequest,
  options: InTripReplanClientOptions = {},
): Promise<InTripPreviewOutcome> {
  const timeoutMs = options.timeoutMs ?? IN_TRIP_PREVIEW_TIMEOUT_MS;
  const fetcher = options.fetcher ?? fetch;
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetcher(`/api/trips/${encodeURIComponent(tripId)}/in-trip/preview`, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    let body: unknown = null;
    try { body = await response.json(); } catch { body = null; }
    if (response.status === 200) {
      const parsed = inTripPreviewEnvelopeSchema.safeParse(body);
      return parsed.success
        ? { status: "SUCCESS", data: parsed.data.data }
        : { status: "FAILED", code: "INVALID_RESPONSE", message: "Kết quả kiểm tra không hợp lệ.", httpStatus: 502 };
    }
    const error = errorEnvelopeSchema.safeParse(body);
    if (!error.success) {
      return timedOut
        ? { status: "TIMEOUT" }
        : { status: "FAILED", code: "INVALID_RESPONSE", message: "Không đọc được kết quả kiểm tra.", httpStatus: response.status };
    }
    const details = inTripDetailsSchema.safeParse(error.data.error.details);
    return {
      status: "FAILED",
      code: error.data.error.code,
      message: error.data.error.message,
      httpStatus: response.status,
      ...(details.success && details.data.validation ? { validation: details.data.validation } : {}),
      ...(details.success && details.data.checkedAt ? { checkedAt: details.data.checkedAt } : {}),
    };
  } catch {
    return timedOut ? { status: "TIMEOUT" } : { status: "NETWORK_ERROR" };
  } finally {
    clearTimeout(timeout);
  }
}

/** Send a confirmed IN_TRIP apply using the shared idempotent mutation contract. */
export async function applyInTrip(
  tripId: string,
  request: InTripApplyPayload,
  idempotencyKey = createIdempotencyKey(),
): Promise<InTripApplyOutcome> {
  const candidate = editCandidateSchema.parse(request.candidate);
  const result = await sendIdempotentMutation<unknown>(
    `/api/trips/${encodeURIComponent(tripId)}/edits/apply`,
    {
      idempotencyKey,
      init: {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ ...request, candidate }),
      },
    },
  );
  if (result.status === "UNKNOWN") {
    return { status: "UNKNOWN", error: result.error, retryWithSameKey: true };
  }
  if (result.status === "FAILED") {
    const details = inTripApplyErrorDetails(result.error.details);
    return {
      status: "FAILED",
      error: { code: result.error.code, message: result.error.message },
      ...(result.httpStatus !== undefined ? { httpStatus: result.httpStatus } : {}),
      ...details,
    };
  }

  const parsed = inTripApplyDataSchema.safeParse(result.data);
  if (!parsed.success) return invalidInTripApplyOutcome();
  const data = parsed.data;
  const passed = data.validation.canConfirm && [
    data.validation.groups.openingHours.status,
    data.validation.groups.minimumDuration.status,
    data.validation.groups.travelTime.status,
    data.validation.groups.scheduleConflict.status,
  ].every(status => status === "SATISFIED");
  if (data.tripId !== tripId || data.kind !== "IN_TRIP" || data.baseRevision === request.baseRevision
    || JSON.stringify(data.candidate) !== JSON.stringify(candidate) || !passed) {
    return invalidInTripApplyOutcome();
  }
  return { status: "SUCCESS", data, ...(result.replayed === undefined ? {} : { replayed: result.replayed }) };
}
