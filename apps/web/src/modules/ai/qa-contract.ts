import { z } from "zod";

// Pure contracts only. No HTTP parsing, authentication, evidence registry or AI.
export const QA_QUESTION_MAX_UTF16_UNITS = 2000;
export const QA_BODY_MAX_BYTES = 16 * 1024;
export const QA_CLARIFICATION_MAX_UTF16_UNITS = 2000;
export const QA_IDEMPOTENCY_HEADER = "Idempotency-Key";
export const QA_INSUFFICIENT_SOURCE_MESSAGE =
  "Chưa đủ dữ liệu được xác minh để trả lời câu hỏi này.";

export const qaReferenceIdSchema = z
  .string()
  .regex(/^[a-zA-Z0-9_-]{1,128}$/, "Tham chiếu không hợp lệ.");

const normalizedText = (max?: number) => {
  const text = z.string().min(1, "Không được để trống.");
  return z
    .string()
    .transform((value) => value.normalize("NFC").trim())
    .pipe(
      max === undefined
        ? text
        : text.refine((value) => value.length <= max, `Tối đa ${max} UTF-16 units.`),
    );
};

export const qaQuestionSchema = normalizedText(QA_QUESTION_MAX_UTF16_UNITS);
// Validates the scalar extracted by a future HTTP adapter, not a Headers object.
export const qaIdempotencyKeySchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => value.length <= 200, "Idempotency-Key tối đa 200 ký tự.");
export const qaContextSchema = z.object({ type: z.literal("GENERAL") }).strict();

export const qaFirstTurnRequestSchema = z
  .object({
    question: qaQuestionSchema,
    context: qaContextSchema.default({ type: "GENERAL" }),
  })
  .strict();

export const qaFollowUpRequestSchema = z
  .object({
    conversationId: qaReferenceIdSchema,
    // null means that the conversation has no completed head yet.
    parentTurnId: qaReferenceIdSchema.nullable(),
    question: qaQuestionSchema,
    // Omission inherits server-owned context; it does not reset to GENERAL.
    context: qaContextSchema.optional(),
  })
  .strict();

export const qaRequestSchema = z.union([
  qaFirstTurnRequestSchema,
  qaFollowUpRequestSchema,
]);

export const qaCitationLocatorSchema = z
  .object({
    pageNumber: z.number().int().positive().optional(),
    section: normalizedText(300).optional(),
  })
  .strict()
  .refine(
    (locator) => locator.pageNumber !== undefined || locator.section !== undefined,
    "Vị trí nguồn phải có trang hoặc mục.",
  );

// Syntax only: runtime must separately prove that the URL may be public.
export const qaSourceUrlSchema = z
  .string()
  .max(2000)
  .refine((value) => {
    if (/[\u0000-\u0020\u007f]/.test(value)) return false;
    try {
      const url = new URL(value);
      return (
        ["http:", "https:"].includes(url.protocol) &&
        Boolean(url.hostname) &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  }, "URL nguồn phải là HTTP(S) hợp lệ, không chứa thông tin đăng nhập.")
  .nullable();

export const qaPublicCitationSchema = z
  .object({
    id: qaReferenceIdSchema,
    sourceId: qaReferenceIdSchema,
    title: normalizedText(300),
    sourceUrl: qaSourceUrlSchema,
    locators: z.array(qaCitationLocatorSchema),
  })
  .strict();

// Every answer part is evidence-requiring content. System notices live elsewhere.
export const qaAnswerPartSchema = z
  .object({
    text: normalizedText(),
    citationIds: z.array(qaReferenceIdSchema).min(1),
  })
  .strict();

const completedTurnFields = {
  conversationId: qaReferenceIdSchema,
  turnId: qaReferenceIdSchema,
  turnState: z.literal("COMPLETED"),
  context: qaContextSchema,
};

export const qaCompletedTurnSchema = z
  .discriminatedUnion("status", [
    z.object({
      ...completedTurnFields,
      status: z.literal("ANSWERED"),
      answerParts: z.array(qaAnswerPartSchema).min(1),
      citations: z.array(qaPublicCitationSchema).min(1),
      unansweredAspects: z.array(normalizedText()).length(0),
    }).strict(),
    z.object({
      ...completedTurnFields,
      status: z.literal("PARTIAL"),
      answerParts: z.array(qaAnswerPartSchema).min(1),
      citations: z.array(qaPublicCitationSchema).min(1),
      unansweredAspects: z.array(normalizedText()).min(1),
    }).strict(),
    z.object({
      ...completedTurnFields,
      status: z.literal("INSUFFICIENT_SOURCE"),
      answerParts: z.array(qaAnswerPartSchema).length(0),
      citations: z.array(qaPublicCitationSchema).length(0),
      message: z.literal(QA_INSUFFICIENT_SOURCE_MESSAGE),
    }).strict(),
    z.object({
      ...completedTurnFields,
      status: z.literal("CLARIFICATION_REQUIRED"),
      answerParts: z.array(qaAnswerPartSchema).length(0),
      citations: z.array(qaPublicCitationSchema).length(0),
      clarificationQuestion: normalizedText(QA_CLARIFICATION_MAX_UTF16_UNITS),
    }).strict(),
  ])
  .superRefine((turn, context) => {
    const ids = new Set<string>();
    for (const [index, citation] of turn.citations.entries()) {
      if (ids.has(citation.id)) {
        context.addIssue({ code: "custom", path: ["citations", index, "id"], message: "Citation ID bị trùng." });
      }
      ids.add(citation.id);
    }
    const used = new Set<string>();
    for (const [partIndex, part] of turn.answerParts.entries()) {
      const partIds = new Set<string>();
      for (const [idIndex, id] of part.citationIds.entries()) {
        const path = ["answerParts", partIndex, "citationIds", idIndex];
        if (partIds.has(id)) {
          context.addIssue({ code: "custom", path, message: "Citation ID bị trùng trong phần trả lời." });
        }
        if (!ids.has(id)) {
          context.addIssue({ code: "custom", path, message: "Citation ID không tồn tại trong response." });
        }
        partIds.add(id);
        used.add(id);
      }
    }
    for (const [index, citation] of turn.citations.entries()) {
      if (!used.has(citation.id)) {
        context.addIssue({ code: "custom", path: ["citations", index, "id"], message: "Citation không được sử dụng." });
      }
    }
  });

export const QA_ERROR_HTTP_STATUS = {
  INVALID_REQUEST: 400,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONTEXT_UNAVAILABLE: 404,
  CONVERSATION_STALE: 409,
  CONVERSATION_BUSY: 409,
  IDEMPOTENCY_KEY_REQUIRED: 400,
  IDEMPOTENCY_KEY_INVALID: 400,
  IDEMPOTENCY_KEY_REUSED: 409,
  RATE_LIMITED: 429,
  AI_UNAVAILABLE: 503,
  AI_INVALID_RESPONSE: 502,
  INTERNAL_SERVER_ERROR: 500,
  OPERATION_STATUS_UNKNOWN: 503,
} as const;

export const qaErrorCodeSchema = z.enum(Object.keys(QA_ERROR_HTTP_STATUS) as [
  keyof typeof QA_ERROR_HTTP_STATUS,
  ...(keyof typeof QA_ERROR_HTTP_STATUS)[],
]);

const errorFields = {
  message: normalizedText(),
  // Same extension point as ApiFailure. Runtime must sanitize error details.
  details: z.unknown().optional(),
};

export const qaCompletedResponseSchema = z.object({
  success: z.literal(true),
  operationStatus: z.literal("SUCCESS"),
  data: qaCompletedTurnSchema,
}).strict();

export const qaFailedResponseSchema = z.object({
  success: z.literal(false),
  operationStatus: z.literal("FAILED"),
  error: z.object({
    ...errorFields,
    code: qaErrorCodeSchema.exclude(["OPERATION_STATUS_UNKNOWN"]),
  }).strict(),
}).strict();

export const qaUnknownResponseSchema = z.object({
  success: z.literal(false),
  operationStatus: z.literal("UNKNOWN"),
  error: z.object({
    ...errorFields,
    code: z.literal("OPERATION_STATUS_UNKNOWN"),
  }).strict(),
  retryWithSameKey: z.literal(true),
}).strict();

// Admission/pending HTTP 202 is deliberately NOT part of the active contract.
export const qaResponseSchema = z.discriminatedUnion("operationStatus", [
  qaCompletedResponseSchema,
  qaFailedResponseSchema,
  qaUnknownResponseSchema,
]);

export type QaContext = z.infer<typeof qaContextSchema>;
export type QaRequest = z.infer<typeof qaRequestSchema>;
export type QaFirstTurnRequest = z.infer<typeof qaFirstTurnRequestSchema>;
export type QaFollowUpRequest = z.infer<typeof qaFollowUpRequestSchema>;
export type QaCitationLocator = z.infer<typeof qaCitationLocatorSchema>;
export type QaPublicCitation = z.infer<typeof qaPublicCitationSchema>;
export type QaAnswerPart = z.infer<typeof qaAnswerPartSchema>;
export type QaCompletedTurn = z.infer<typeof qaCompletedTurnSchema>;
export type QaResponse = z.infer<typeof qaResponseSchema>;
export type QaErrorCode = z.infer<typeof qaErrorCodeSchema>;
