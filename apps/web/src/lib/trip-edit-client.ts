import { parseJsonEventStream, uiMessageChunkSchema } from "ai";
import { z } from "zod";

import { sendIdempotentMutation } from "@/lib/mutation-client";
import type { MutationOutcome } from "@/lib/mutation-contract";
import {
  advisoryCitationSchema,
  advisoryKnowledgePartSchema,
  aiChatHistorySchema,
  type AdvisoryCitation,
  type AdvisoryKnowledgePart,
  type AiChatHistoryTurn,
} from "@/modules/trip-edit/ai-workspace-plan";
import { inTripLocationSchema, type InTripLocation } from "@/modules/in-trip/in-trip-location";
import type { AdviceSuggestionCard } from "@/modules/trip-edit/saved-trip-advisory";
import { editCandidateSchema, type EditCandidate } from "@/modules/trip-edit/edit-candidate";
import type { ApplyEditResult } from "@/modules/trip-edit/apply-edit";
import type {
  EditPlaceDetail,
  PreviewEditResult,
  PreviewLegMetric,
  TripEditPageData,
} from "@/modules/trip-edit/trip-edit-service";
import type { PreviewJourneySummary } from "@/modules/trip-edit/edit-journey-helper";
import {
  uncheckedItemSchema,
  type AcknowledgedUnchecked,
} from "@/modules/trip-save/unchecked-checks";
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

const previewLegMetricSchema = z.object({
  dayIndex: z.number().int().positive(),
  fromVisitId: z.string(),
  toVisitId: z.string(),
  status: z.enum(["VERIFIED", "INSUFFICIENT_DATA"]),
  durationSeconds: z.number().nullable(),
  distanceMeters: z.number().nullable(),
  geometry: z.object({
    type: z.literal("LineString"),
    coordinates: z.array(z.tuple([z.number(), z.number()])),
  }).optional(),
}).strict() satisfies z.ZodType<PreviewLegMetric>;

const previewJourneySummarySchema = z.object({
  outboundDurationSeconds: z.number().nullable(),
  outboundDistanceMeters: z.number().nullable(),
  outboundRestMinutes: z.number(),
  estimatedArrivalAtFirstMinute: z.number().nullable(),
  firstVisitStartMinute: z.number().nullable(),
  returnDurationSeconds: z.number().nullable(),
  returnDistanceMeters: z.number().nullable(),
  returnRestMinutes: z.number(),
  estimatedReturnArrivalMinute: z.number().nullable(),
  returnDeadlineMinute: z.number().nullable(),
}).strict() satisfies z.ZodType<PreviewJourneySummary>;

const previewResultSchema = z.object({
  baseRevision: z.iso.datetime(),
  candidate: editCandidateSchema,
  validation: validationSchema,
  eligibleForConfirmation: z.boolean(),
  legs: z.array(previewLegMetricSchema).optional(),
  journeySummary: previewJourneySummarySchema.optional(),
  uncheckedItems: z.array(uncheckedItemSchema).optional(),
  saveEligibility: z.enum(["PASS", "NEEDS_UNCHECKED_ACK", "BLOCKED"]).optional(),
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
  | { kind: "FAILED"; status: number; code: string; message: string; details?: unknown }
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
  acknowledgedUnchecked?: AcknowledgedUnchecked;
};

const DEFAULT_TIMEOUT_MS = 15_000;
// The assistant may reason over several model rounds; wait as long as the route may run (maxDuration 300 s).
export const AI_EDIT_TIMEOUT_MS = 305_000;

function failed(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): TripEditPreviewOutcome {
  return details !== undefined
    ? { kind: "FAILED", status, code, message, details }
    : { kind: "FAILED", status, code, message };
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

  const { code, message, details } = parsed.data.error;
  if (status === 401 || code === "UNAUTHENTICATED") {
    return failed(401, "UNAUTHENTICATED", "Phiên đăng nhập không còn hiệu lực. Vui lòng đăng nhập lại.");
  }
  if (status === 403 || code === "FORBIDDEN") {
    return failed(403, "FORBIDDEN", "Bạn không có quyền kiểm tra hành trình này.");
  }
  if (status === 409 || code === "TRIP_REVISION_CONFLICT") {
    return failed(409, "TRIP_REVISION_CONFLICT", message, details);
  }
  if (status >= 500) {
    return failed(status, code, "Hệ thống chưa thể kiểm tra hành trình lúc này. Phương án vẫn được giữ lại, hãy thử lại.");
  }
  return failed(status, code, message, details);
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
          ...(input.acknowledgedUnchecked
            ? { acknowledgedUnchecked: input.acknowledgedUnchecked }
            : {}),
        }),
      },
    },
  );

  if (response.status !== "SUCCESS") return response;
  const parsed = applyResultSchema.safeParse(response.data);
  if (!parsed.success) return unknownApplyOutcome();

  const data = parsed.data;
  const groupStatuses = [
    data.validation.groups.openingHours.status,
    data.validation.groups.minimumDuration.status,
    data.validation.groups.travelTime.status,
    data.validation.groups.scheduleConflict.status,
  ];
  const noViolations = groupStatuses.every((status) => status !== "VIOLATION");
  const allChecksPassed = input.acknowledgedUnchecked
    ? noViolations
    : data.validation.canConfirm && groupStatuses.every((status) => status === "SATISFIED");
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
    position: z.number().int().min(1).max(50).nullable(),
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
      selectedDayIndex: z.number().int().min(1).max(30).optional(),
    }).strict().refine((value) => {
      const hasVisit = value.selectedVisitId !== undefined;
      const hasDest = value.selectedDestinationId !== undefined;
      const hasDay = value.selectedDayIndex !== undefined;
      const count = Number(hasVisit) + Number(hasDest) + Number(hasDay);
      if (count === 0) return false;
      if (hasVisit && (hasDest || hasDay)) return false;
      return true;
    }),
  }).strict()).max(50).optional(),
}).strict();

const positionedDiffVisitSchema = z.object({
  visitId: z.string().min(1).max(128),
  destinationId: z.string().min(1).max(128),
  startMinute: z.number().int().min(0).max(1439),
  plannedDurationMinutes: z.number().int().min(1).max(1440),
  order: z.number().int().min(1).max(50),
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
    transport: z.object({ before: z.enum(["MOTORCYCLE", "CAR"]), after: z.enum(["MOTORCYCLE", "CAR"]) }).strict().optional(),
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

const editPlaceDetailSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  area: z.string(),
  category: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  suggestedDurationMinutes: z.number().nullable().optional(),
  minimumDurationMinutes: z.number().nullable().optional(),
  isOutdoor: z.boolean().optional(),
  availability: z.enum(["AVAILABLE", "UNAVAILABLE"]),
  image: z.object({ url: z.string(), alt: z.string() }).strict().optional(),
  external: z.boolean().optional(),
}).strict() satisfies z.ZodType<EditPlaceDetail>;

const adviceSuggestionCardSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  diffSummaryLines: z.array(z.string()),
  candidate: editCandidateSchema,
  diff: aiDiffSchema,
  validation: aiValidationSchema,
  changedVisitIds: z.object({
    added: z.array(z.string()),
    updated: z.array(z.string()),
    shifted: z.array(z.string()),
    removedCount: z.number().int().nonnegative(),
  }).strict(),
  legs: z.array(previewLegMetricSchema).optional(),
  saveEligibility: z.enum(["PASS", "NEEDS_UNCHECKED_ACK", "BLOCKED"]).optional(),
  uncheckedItems: z.array(uncheckedItemSchema).optional(),
  journeySummary: previewJourneySummarySchema.optional(),
  addedPlaceDetails: z.record(z.string(), editPlaceDetailSchema).optional(),
}).strict() satisfies z.ZodType<AdviceSuggestionCard>;

const aiEditResponseSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("PROPOSED"),
    candidate: editCandidateSchema,
    intent: aiIntentSchema,
    diff: aiDiffSchema,
    validation: aiValidationSchema,
    aiSummary: z.string().optional(),
    changedVisitIds: z.object({
      added: z.array(z.string()),
      updated: z.array(z.string()),
      shifted: z.array(z.string()),
      removedCount: z.number().int().nonnegative(),
    }).strict().optional(),
    legs: z.array(previewLegMetricSchema).optional(),
    saveEligibility: z.enum(["PASS", "NEEDS_UNCHECKED_ACK", "BLOCKED"]).optional(),
    uncheckedItems: z.array(uncheckedItemSchema).optional(),
    journeySummary: previewJourneySummarySchema.optional(),
    addedPlaceDetails: z.record(z.string(), z.unknown()).optional(),
    correctionNote: z.string().optional(),
  }).strict(),
  z.object({
    status: z.literal("NEEDS_CLARIFICATION"),
    intent: aiIntentSchema,
    reason: z.enum([
      "MISSING_TARGET", "MISSING_TIME", "MISSING_DAY", "AMBIGUOUS_TARGET",
      "AMBIGUOUS_DESTINATION", "OUT_OF_SCOPE",
    ]),
    clarification: aiClarificationSchema,
    aiSummary: z.string().optional(),
  }).strict(),
  z.object({
    status: z.literal("ADVISED"),
    intent: aiIntentSchema,
    advice: z.string().min(1),
    validation: aiValidationSchema,
    aiSummary: z.string().min(1),
    saveEligibility: z.enum(["PASS", "NEEDS_UNCHECKED_ACK", "BLOCKED"]).optional(),
    suggestions: z.array(adviceSuggestionCardSchema).max(4).optional(),
    knowledgeParts: z.array(advisoryKnowledgePartSchema).optional(),
    citations: z.array(advisoryCitationSchema).optional(),
    correctionNote: z.string().optional(),
  }).strict(),
  z.object({
    status: z.literal("NEEDS_LOCATION"),
    prompt: z.string().min(1),
    pendingMessage: z.string().min(1),
    aiSummary: z.string().min(1),
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
  draft?: EditCandidate;
  history?: AiChatHistoryTurn[];
  location?: InTripLocation;
};

export type AiTripEditOutcome =
  | { kind: "RESULT"; result: import("@/modules/trip-edit/ai-edit-service").AiEditServiceResult }
  | { kind: "FAILED"; status: number; code: string; message: string; details?: unknown }
  | { kind: "NETWORK_ERROR" }
  | { kind: "TIMEOUT" };

export type AiTripEditStreamOutcome =
  | AiTripEditOutcome
  | { kind: "INTERRUPTED"; partialText: string }
  | { kind: "STOPPED"; partialText: string };

export type AiTripEditOptions = {
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

export type StreamAiTripEditOptions = AiTripEditOptions & {
  signal?: AbortSignal;
  onStatus?: (status: { kind: string; label: string }) => void;
  onSteps?: (steps: string[]) => void;
  onTextDelta?: (delta: string) => void;
  onCorrectionNote?: (note: string) => void;
};

function buildAiRequestBody(input: AiTripEditInput): string {
  const validatedDraft = input.draft !== undefined ? editCandidateSchema.parse(input.draft) : undefined;
  const validatedHistory =
    input.history && input.history.length > 0 ? aiChatHistorySchema.parse(input.history) : undefined;
  const validatedLocation =
    input.location !== undefined ? inTripLocationSchema.parse(input.location) : undefined;
  return JSON.stringify({
    baseRevision: input.baseRevision,
    message: input.message,
    ...(input.resolution ? { resolution: input.resolution } : {}),
    ...(validatedDraft ? { draft: validatedDraft } : {}),
    ...(validatedHistory ? { history: validatedHistory } : {}),
    ...(validatedLocation ? { location: validatedLocation } : {}),
  });
}

function decideAiJsonResponse(status: number, body: unknown): AiTripEditOutcome {
  if (status === 200) {
    const parsed = aiSuccessEnvelopeSchema.safeParse(body);
    return parsed.success
      ? { kind: "RESULT", result: parsed.data.data as import("@/modules/trip-edit/ai-edit-service").AiEditServiceResult }
      : { kind: "FAILED", status: 502, code: "AI_INVALID_RESPONSE", message: "Phản hồi đề xuất bằng AI không hợp lệ. Hãy thử lại." };
  }

  const parsedError = errorEnvelopeSchema.safeParse(body);
  if (!parsedError.success) {
    return { kind: "FAILED", status, code: "INVALID_RESPONSE", message: "Hệ thống chưa thể tạo đề xuất lúc này." };
  }
  const { code, message, details } = parsedError.data.error;
  if (code === "AI_UNAVAILABLE" || code === "AI_INVALID_RESPONSE") {
    return { kind: "FAILED", status, code, message, ...(details !== undefined ? { details } : {}) };
  }
  if (status === 409 || code === "TRIP_REVISION_CONFLICT") {
    return { kind: "FAILED", status: 409, code: "TRIP_REVISION_CONFLICT", message, ...(details !== undefined ? { details } : {}) };
  }
  return { kind: "FAILED", status, code, message, ...(details !== undefined ? { details } : {}) };
}

/** Request one read-only AI proposal or clarification with bounded waiting. */
export async function requestAiTripEdit(
  tripId: string,
  input: AiTripEditInput,
  options: AiTripEditOptions = {},
): Promise<AiTripEditOutcome> {
  const controller = new AbortController();
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? AI_EDIT_TIMEOUT_MS;
  let timedOut = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    const requestBody = buildAiRequestBody(input);
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new Error("AI_CLIENT_TIMEOUT"));
      }, timeoutMs);
    });
    const response = await Promise.race([
      fetcher(
        `/api/trips/${encodeURIComponent(tripId)}/edits/ai`,
        {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: requestBody,
          signal: controller.signal,
        },
      ),
      timeoutPromise,
    ]);
    let body: unknown = null;
    try { body = await Promise.race([response.json(), timeoutPromise]); } catch { body = null; }
    if (timedOut) return { kind: "TIMEOUT" };
    return decideAiJsonResponse(response.status, body);
  } catch {
    return timedOut ? { kind: "TIMEOUT" } : { kind: "NETWORK_ERROR" };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Stream a Saved-trip assistant turn via the AI SDK UI message SSE protocol.
 * Resets the inactivity timer on every chunk; aborts yield `STOPPED` and
 * premature stream ends yield `INTERRUPTED` without mutating any draft.
 */
export async function streamAiTripEdit(
  tripId: string,
  input: AiTripEditInput,
  options: StreamAiTripEditOptions = {},
): Promise<AiTripEditStreamOutcome> {
  const controller = new AbortController();
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? AI_EDIT_TIMEOUT_MS;
  let timedOut = false;
  let stopped = Boolean(options.signal?.aborted);
  let partialText = "";
  let streamOpened = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let wakeWaiter: ((reason: "TIMEOUT" | "STOPPED") => void) | null = null;

  const triggerWake = (reason: "TIMEOUT" | "STOPPED") => {
    const fn = wakeWaiter;
    wakeWaiter = null;
    fn?.(reason);
  };

  const onExternalAbort = () => {
    stopped = true;
    controller.abort();
    triggerWake("STOPPED");
  };
  if (stopped) return { kind: "STOPPED", partialText: "" };
  options.signal?.addEventListener("abort", onExternalAbort, { once: true });

  const clearInactivityTimer = () => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  };

  const armInactivityTimer = () => {
    clearInactivityTimer();
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
      triggerWake("TIMEOUT");
    }, timeoutMs);
  };

  const raceWithWait = <T,>(promise: Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      if (stopped) {
        reject(new Error("AI_CLIENT_STOPPED"));
        return;
      }
      if (timedOut) {
        reject(new Error("AI_CLIENT_TIMEOUT"));
        return;
      }
      wakeWaiter = (reason) => reject(new Error(reason === "STOPPED" ? "AI_CLIENT_STOPPED" : "AI_CLIENT_TIMEOUT"));
      promise.then(
        (value) => {
          wakeWaiter = null;
          resolve(value);
        },
        (error) => {
          wakeWaiter = null;
          reject(error);
        },
      );
    });

  try {
    const requestBody = buildAiRequestBody(input);
    armInactivityTimer();
    const response = await raceWithWait(
      fetcher(`/api/trips/${encodeURIComponent(tripId)}/edits/ai`, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          Accept: "text/event-stream",
          "Content-Type": "application/json",
        },
        body: requestBody,
        signal: controller.signal,
      }),
    );

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!response.ok || !contentType.includes("text/event-stream") || !response.body) {
      armInactivityTimer();
      let body: unknown = null;
      try {
        body = await raceWithWait(response.json());
      } catch {
        body = null;
      }
      if (stopped) return { kind: "STOPPED", partialText };
      if (timedOut) return { kind: "TIMEOUT" };
      return decideAiJsonResponse(response.status, body);
    }

    streamOpened = true;
    const parsedStream = parseJsonEventStream({
      stream: response.body,
      schema: uiMessageChunkSchema,
    });
    const reader = parsedStream.getReader();
    let finalResult: import("@/modules/trip-edit/ai-edit-service").AiEditServiceResult | null = null;

    try {
      while (true) {
        armInactivityTimer();
        const next = await raceWithWait(reader.read());
        if (next.done) break;
        const entry = next.value;
        if (!entry.success) continue;
        const chunk = entry.value as { type: string; delta?: unknown; data?: unknown };

        if (chunk.type === "data-status" && chunk.data && typeof chunk.data === "object") {
          const data = chunk.data as { kind?: unknown; label?: unknown };
          if (typeof data.label === "string" && data.label.trim()) {
            options.onStatus?.({ kind: typeof data.kind === "string" ? data.kind : "tool", label: data.label });
          }
        } else if (chunk.type === "data-steps" && chunk.data && typeof chunk.data === "object") {
          const data = chunk.data as { steps?: unknown };
          if (Array.isArray(data.steps) && data.steps.every((s) => typeof s === "string")) {
            options.onSteps?.(data.steps as string[]);
          }
        } else if (chunk.type === "text-delta" && typeof chunk.delta === "string") {
          partialText += chunk.delta;
          options.onTextDelta?.(chunk.delta);
        } else if (chunk.type === "data-correction-note" && chunk.data && typeof chunk.data === "object") {
          const data = chunk.data as { note?: unknown };
          if (typeof data.note === "string" && data.note.trim()) {
            options.onCorrectionNote?.(data.note);
          }
        } else if (chunk.type === "data-trip-assistant-result") {
          const validated = aiEditResponseSchema.safeParse(chunk.data);
          if (validated.success) {
            finalResult = validated.data as import("@/modules/trip-edit/ai-edit-service").AiEditServiceResult;
          }
        }
      }
    } finally {
      reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }

    if (stopped) return { kind: "STOPPED", partialText };
    if (timedOut) return { kind: "TIMEOUT" };
    if (finalResult) return { kind: "RESULT", result: finalResult };
    return { kind: "INTERRUPTED", partialText };
  } catch {
    if (stopped) return { kind: "STOPPED", partialText };
    if (timedOut) return { kind: "TIMEOUT" };
    return streamOpened ? { kind: "INTERRUPTED", partialText } : { kind: "NETWORK_ERROR" };
  } finally {
    clearInactivityTimer();
    options.signal?.removeEventListener("abort", onExternalAbort);
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

export function extractCompletedVisitIdsFromDetails(details: unknown): string[] {
  if (typeof details !== "object" || details === null || !("completedVisitIds" in details)) {
    return [];
  }
  const raw = (details as { completedVisitIds?: unknown }).completedVisitIds;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === "string" && item.length > 0);
}

export type TripEditSnapshot = TripEditPageData;

export type TripEditSnapshotOutcome =
  | { kind: "OK"; snapshot: TripEditSnapshot }
  | { kind: "FAILED"; message: string };

const snapshotSuccessSchema = z.object({
  success: z.literal(true),
  data: z.object({
    tripId: z.string().min(1),
    tripStatus: z.enum(["UPCOMING", "ONGOING", "COMPLETED"]),
    hasCompanionPublication: z.boolean(),
    baseRevision: z.iso.datetime(),
    candidate: editCandidateSchema,
    destinationLabels: z.record(z.string(), z.string()),
    placeDetails: z.record(z.string(), z.unknown()),
    completedVisitIds: z.array(z.string()).optional(),
    journeyDisclosure: z.enum(["ORIGIN_LEGS_NOT_INCLUDED", "SAVED_JOURNEY_PRESENT"]).optional(),
  }).passthrough(),
}).strict();

/** Fetches the latest owner-scoped snapshot cleanly after a 409 TRIP_REVISION_CONFLICT. */
export async function fetchTripEditSnapshot(
  tripId: string,
  fetcher: typeof fetch = fetch,
): Promise<TripEditSnapshotOutcome> {
  try {
    const response = await fetcher(
      `/api/trips/${encodeURIComponent(tripId)}/edits/snapshot`,
      {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
      },
    );
    const body = await response.json().catch(() => null);
    if (response.ok) {
      const parsed = snapshotSuccessSchema.safeParse(body);
      if (parsed.success) {
        return { kind: "OK", snapshot: parsed.data.data as TripEditSnapshot };
      }
    }
    const errParsed = errorEnvelopeSchema.safeParse(body);
    return {
      kind: "FAILED",
      message: errParsed.success
        ? errParsed.data.error.message
        : "Không thể tải phiên bản lịch trình mới nhất lúc này.",
    };
  } catch {
    return {
      kind: "FAILED",
      message: "Mất kết nối khi tải phiên bản lịch trình mới nhất.",
    };
  }
}

export type PersistedTripEditChatPayload = {
  role: "user" | "assistant";
  kind?: "ADVISED" | "APPLIED" | "CLARIFYING" | "INTERRUPTED" | "STOPPED";
  text: string;
  steps?: readonly string[];
  correctionNote?: string;
  statusNotice?: string;
  knowledgeParts?: readonly AdvisoryKnowledgePart[];
  citations?: readonly AdvisoryCitation[];
};

/** Best-effort persistence of trip-edit chat turns to PostgreSQL (never blocks UI). */
export async function appendTripEditChatMessagesClient(
  tripId: string,
  messages: readonly PersistedTripEditChatPayload[],
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  if (messages.length === 0) return true;
  try {
    const response = await fetcher(
      `/api/trips/${encodeURIComponent(tripId)}/edits/ai/messages`,
      {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}

/** Clear persisted trip-edit chat history for this trip on the server. */
export async function clearTripEditChatMessagesClient(
  tripId: string,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetcher(
      `/api/trips/${encodeURIComponent(tripId)}/edits/ai/messages`,
      {
        method: "DELETE",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}
