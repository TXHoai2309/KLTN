import { z } from "zod";

import { editCandidateSchema } from "@/modules/trip-edit/edit-candidate";
import type {
  InTripReplanOutcome,
  InTripReplanResponse,
} from "@/modules/in-trip/in-trip-session";
import { IN_TRIP_NEED_MAX_LENGTH } from "@/modules/in-trip/in-trip-session";
import type { InTripLocation } from "@/modules/in-trip/in-trip-location";
import { TRANSPORT_VALUES } from "@/modules/trip-requirement/trip-requirement-contract";

export const IN_TRIP_REPLAN_TIMEOUT_MS = 20_000;

export type InTripReplanRequest = {
  baseRevision: string;
  location: InTripLocation;
  need: string;
  resolution?: {
    selectedVisitId?: string;
    selectedDestinationId?: string;
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
}).strict().refine(
  value => Number(value.selectedVisitId !== undefined) + Number(value.selectedDestinationId !== undefined) === 1,
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
