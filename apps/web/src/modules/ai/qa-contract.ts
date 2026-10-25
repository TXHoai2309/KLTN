import { z } from "zod";
import { QA_CONVERSATION_MESSAGES } from "./qa-conversation";
import { QA_ANSWER_PRESENTATIONS } from "./qa-answer-details";

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
export const qaContextSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("GENERAL") }).strict(),
  z.object({ type: z.literal("DESTINATION"), destinationId: qaReferenceIdSchema }).strict(),
]);

export const QA_KNOWLEDGE_MODES = ["SOURCE_ONLY", "EXPANDED"] as const;
export type QaKnowledgeMode = (typeof QA_KNOWLEDGE_MODES)[number];
export const qaKnowledgeModeSchema = z.enum(QA_KNOWLEDGE_MODES);

export const qaFirstTurnRequestSchema = z
  .object({
    question: qaQuestionSchema,
    context: qaContextSchema.default({ type: "GENERAL" }),
    knowledgeMode: qaKnowledgeModeSchema.optional(),
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
    knowledgeMode: qaKnowledgeModeSchema.optional(),
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

export const qaAnswerPartModeSchema = z.enum(["SOURCE", "EXPANDED"]);
export type QaAnswerPartMode = z.infer<typeof qaAnswerPartModeSchema>;

// Every answer part is evidence-requiring content in SOURCE mode, or model-supplemented in EXPANDED mode.
export const qaAnswerPartSchema = z
  .object({
    text: normalizedText(),
    mode: qaAnswerPartModeSchema.optional(),
    citationIds: z.array(qaReferenceIdSchema).default([]),
  })
  .strict()
  .superRefine((part, context) => {
    const mode = part.mode ?? "SOURCE";
    if (mode === "SOURCE" && part.citationIds.length === 0) {
      context.addIssue({ code: "custom", path: ["citationIds"], message: "Phần nội dung từ nguồn phải có ít nhất một trích dẫn." });
    }
    if (mode === "EXPANDED" && part.citationIds.length > 0) {
      context.addIssue({ code: "custom", path: ["citationIds"], message: "Phần kiến thức mở rộng không được gắn trích dẫn tài liệu." });
    }
  });

const completedTurnFields = {
  conversationId: qaReferenceIdSchema,
  turnId: qaReferenceIdSchema,
  turnState: z.literal("COMPLETED"),
  context: qaContextSchema,
  knowledgeMode: qaKnowledgeModeSchema.optional(),
};

export const qaCompletedTurnSchema = z
  .discriminatedUnion("status", [
    z.object({
      ...completedTurnFields,
      status: z.literal("CONVERSATIONAL"),
      answerParts: z.array(qaAnswerPartSchema).length(0),
      citations: z.array(qaPublicCitationSchema).length(0),
      message: z.enum(Object.values(QA_CONVERSATION_MESSAGES)),
    }).strict(),
    z.object({
      ...completedTurnFields,
      status: z.literal("ANSWERED"),
      answerMode: z.literal("SOURCE_EXCERPTS").optional(),
      presentation: z.enum(QA_ANSWER_PRESENTATIONS).optional(),
      answerParts: z.array(qaAnswerPartSchema).min(1),
      citations: z.array(qaPublicCitationSchema),
      unansweredAspects: z.array(normalizedText()).length(0),
    }).strict(),
    z.object({
      ...completedTurnFields,
      status: z.literal("PARTIAL"),
      answerMode: z.literal("SOURCE_EXCERPTS").optional(),
      presentation: z.enum(QA_ANSWER_PRESENTATIONS).optional(),
      answerParts: z.array(qaAnswerPartSchema).min(1),
      citations: z.array(qaPublicCitationSchema),
      unansweredAspects: z.array(normalizedText()).min(1),
    }).strict(),
    z.object({
      ...completedTurnFields,
      status: z.literal("INSUFFICIENT_SOURCE"),
      reason: z.enum(["NO_EVIDENCE", "MISSING_SUPPORT", "ANSWER_VERIFICATION"]).optional(),
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
    if ((turn.knowledgeMode ?? "SOURCE_ONLY") === "SOURCE_ONLY" && turn.answerParts.some(p => (p.mode ?? "SOURCE") === "EXPANDED")) {
      context.addIssue({ code: "custom", path: ["knowledgeMode"], message: "Chế độ SOURCE_ONLY không được chứa phần kiến thức mở rộng." });
    }
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
export function sameQaContext(a: QaContext, b: QaContext): boolean {
  return a.type === b.type && (a.type === "GENERAL" || (b.type === "DESTINATION" && a.destinationId === b.destinationId));
}
export type QaRequest = z.infer<typeof qaRequestSchema>;
export type QaFirstTurnRequest = z.infer<typeof qaFirstTurnRequestSchema>;
export type QaFollowUpRequest = z.infer<typeof qaFollowUpRequestSchema>;
export type QaCitationLocator = z.infer<typeof qaCitationLocatorSchema>;
export type QaPublicCitation = z.infer<typeof qaPublicCitationSchema>;
export type QaAnswerPart = z.infer<typeof qaAnswerPartSchema>;
export type QaCompletedTurn = z.infer<typeof qaCompletedTurnSchema>;
export type QaResponse = z.infer<typeof qaResponseSchema>;
export type QaErrorCode = z.infer<typeof qaErrorCodeSchema>;

export const qaConversationTitleSchema = z
  .string()
  .transform((v) => v.normalize("NFC").trim())
  .pipe(
    z
      .string()
      .min(1, "Tiêu đề không được để trống.")
      .max(100, "Tiêu đề tối đa 100 ký tự.")
  );

export const qaRenameConversationSchema = z
  .object({
    title: qaConversationTitleSchema,
  })
  .strict();

export const qaUpdateConversationSchema = z
  .object({
    title: qaConversationTitleSchema.optional(),
    knowledgeMode: qaKnowledgeModeSchema.optional(),
  })
  .strict()
  .refine(data => data.title !== undefined || data.knowledgeMode !== undefined, {
    message: "At least one field (title or knowledgeMode) must be provided",
  });

export const qaConversationSummarySchema = z
  .object({
    id: qaReferenceIdSchema,
    title: z.string(),
    context: qaContextSchema,
    knowledgeMode: qaKnowledgeModeSchema.optional(),
    createdAt: z.string(),
    lastActivityAt: z.string(),
  })
  .strict();

export const qaConversationListResponseSchema = z
  .object({
    items: z.array(qaConversationSummarySchema),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  })
  .strict();

export const qaConversationDetailMetadataSchema = z
  .object({
    id: qaReferenceIdSchema,
    title: z.string(),
    context: qaContextSchema,
    knowledgeMode: qaKnowledgeModeSchema.optional(),
    headTurnId: qaReferenceIdSchema.nullable(),
    createdAt: z.string(),
    lastActivityAt: z.string(),
  })
  .strict();

export type QaRenameConversationInput = z.infer<typeof qaRenameConversationSchema>;
export type QaUpdateConversationInput = z.infer<typeof qaUpdateConversationSchema>;
export type QaConversationSummary = z.infer<typeof qaConversationSummarySchema>;
export type QaConversationDetailMetadata = z.infer<typeof qaConversationDetailMetadataSchema>;
