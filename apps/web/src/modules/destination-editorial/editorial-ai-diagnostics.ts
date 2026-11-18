import { randomUUID } from "node:crypto";
import { AI_LAYOUT_PRESERVED } from "./editorial-display-policy";
import { EDITORIAL_V2_MAX_ROOT_SECTIONS, EDITORIAL_V2_MAX_TOTAL_NODES } from "./editorial-contract";

const MAX_DIAGNOSTIC_COUNT = 1000;
export type EditorialLayoutDiagnosticCounts = {
  expectedRootSections: number;
  actualRootSections: number;
  expectedTotalNodes: number;
  actualTotalNodes: number;
  countsCapped?: true;
};

/** Count only bounded structural fields; never inspect or return Editorial text. */
export function editorialLayoutDiagnosticCounts(value: unknown): EditorialLayoutDiagnosticCounts | undefined {
  if (!value || typeof value !== "object" || !Array.isArray((value as { sections?: unknown }).sections)) return undefined;
  const sections = (value as { sections: unknown[] }).sections;
  const actualRootSections = Math.min(sections.length, MAX_DIAGNOSTIC_COUNT);
  const pending: unknown[] = sections.slice(0, MAX_DIAGNOSTIC_COUNT);
  let actualTotalNodes = 0;
  let countsCapped = sections.length > MAX_DIAGNOSTIC_COUNT;
  while (pending.length && actualTotalNodes < MAX_DIAGNOSTIC_COUNT) {
    const current = pending.pop();
    actualTotalNodes++;
    if (!current || typeof current !== "object") continue;
    const children = (current as { children?: unknown }).children;
    if (!Array.isArray(children)) continue;
    const available = MAX_DIAGNOSTIC_COUNT - actualTotalNodes - pending.length;
    if (children.length > available) countsCapped = true;
    for (let index = Math.min(children.length, Math.max(0, available)) - 1; index >= 0; index--) {
      pending.push(children[index]);
    }
  }
  if (pending.length) countsCapped = true;
  return {
    expectedRootSections: EDITORIAL_V2_MAX_ROOT_SECTIONS,
    actualRootSections,
    expectedTotalNodes: EDITORIAL_V2_MAX_TOTAL_NODES,
    actualTotalNodes,
    ...(countsCapped ? { countsCapped: true as const } : {}),
  };
}

export function editorialLayoutLimitIssue(counts: EditorialLayoutDiagnosticCounts | undefined) {
  if (!counts) return undefined;
  if (counts.actualRootSections > counts.expectedRootSections) return "SECTION_LIMIT" as const;
  if (counts.actualTotalNodes > counts.expectedTotalNodes) return "NODE_LIMIT" as const;
  return undefined;
}

export type EditorialApiDiagnosticStage = "EDITORIAL_GET" | "EDITORIAL_SAVE" | "EDITORIAL_PUBLISH" | "EDITORIAL_RESTORE_DRAFT" | "EDITORIAL_ROLLBACK" | "EDITORIAL_PROPOSAL_REQUEST";
export function recordEditorialApiFailure(
  stage: EditorialApiDiagnosticStage,
  errorCode: string,
  counts?: EditorialLayoutDiagnosticCounts,
  correlationId = randomUUID(),
  fieldPath?: string,
) {
  const safeCode = /^[A-Z0-9_]{1,64}$/.test(errorCode) ? errorCode : "EDITORIAL_FAILURE";
  const safePath = fieldPath && /^(?:layout\.)?(?:sections|blocks)(?:\.(?:children|\d{1,3}|[A-Za-z]{1,32}))*$/.test(fieldPath) ? fieldPath : undefined;
  const safeCounts = counts ? {
    expectedRootSections: EDITORIAL_V2_MAX_ROOT_SECTIONS,
    actualRootSections: Math.min(Math.max(0, Math.floor(counts.actualRootSections)), MAX_DIAGNOSTIC_COUNT),
    expectedTotalNodes: EDITORIAL_V2_MAX_TOTAL_NODES,
    actualTotalNodes: Math.min(Math.max(0, Math.floor(counts.actualTotalNodes)), MAX_DIAGNOSTIC_COUNT),
    ...(counts.countsCapped ? { countsCapped: true } : {}),
  } : {};
  console.error(JSON.stringify({ event: "editorial_api", correlationId, stage, code: safeCode, ...safeCounts,
    ...(editorialLayoutLimitIssue(counts) ? { issueCode: editorialLayoutLimitIssue(counts) } : {}),
    ...(safePath ? { fieldPath: safePath } : {}),
  }));
  return correlationId;
}

export type EditorialAiFailure = "MODEL_UNAVAILABLE" | "INVALID_API_KEY" | "FORBIDDEN" | "QUOTA_EXCEEDED" | "RATE_LIMIT" | "UNSUPPORTED_PARAMETER" | "INVALID_SCHEMA" | "LOCAL_INVALID_SCHEMA" | "OPENAI_SCHEMA_REJECTED" | "INVALID_OUTPUT" | "TOKEN_LIMIT" | "TIMEOUT" | "NETWORK" | "PROVIDER_UNAVAILABLE" | "REFUSAL" | "CANCELLED" | "CONFIGURATION" | "PROPOSAL_INVALID" | "ADMISSION_REJECTED" | "LLM_PROVIDER_ERROR" | "STALE_LAYOUT" | "SCHEMA_VALIDATION" | "MEDIA_PROVENANCE";
const providerCodes = new Set(["model_not_found", "invalid_api_key", "insufficient_quota", "billing_hard_limit_reached", "billing_not_active", "unsupported_parameter", "unsupported_value", "invalid_parameter", "invalid_value", "invalid_json_schema", "rate_limit_exceeded", "server_error", "context_length_exceeded"]);
const parameters = new Set(["model", "temperature", "top_p", "max_completion_tokens", "response_format", "response_format.json_schema", "response_format.json_schema.schema", "reasoning_effort", "messages"]);
const safeCode = (value: unknown) => typeof value === "string" && providerCodes.has(value) ? value : null;
const safeParam = (value: unknown) => typeof value === "string" && parameters.has(value) ? value : null;
export class EditorialAiError extends Error {
  readonly providerCode: string | null;
  readonly param: string | null;
  readonly httpStatus: number | null;
  constructor(readonly code: EditorialAiFailure, httpStatus: number | null = null, providerCode: unknown = null, param: unknown = null, readonly retryAfterSeconds?: number) {
    super("Editorial AI request failed"); this.name = "EditorialAiError";
    this.httpStatus = Number.isInteger(httpStatus) && httpStatus! >= 100 && httpStatus! <= 599 ? httpStatus : null;
    this.providerCode = safeCode(providerCode); this.param = safeParam(param);
  }
}
export type EditorialValidationCode = "OUTPUT_SIZE" | "JSON_PARSE" | "SCHEMA" | "DIRECTION" | "BLOCK_IDS" | "TITLE_PROVENANCE" | "HEADING" | "COMPOSITION" | "MEDIA_ROLE" | "HIDDEN_STATE" | "DECK_PROVENANCE" | "LAYOUT_CONTRACT" | "MEDIA_ELIGIBILITY" | "DUPLICATE_MEDIA" | "REFERENCES" | "PHOTO_REMOVAL" | "STALE_LAYOUT" | "INVALID_MODEL_OUTPUT" | "SCHEMA_VALIDATION" | "MEDIA_PROVENANCE";

export type ReferenceValidationDetails = {
  validationStage?: "MODEL_PARSE" | "WIRE_SCHEMA" | "TREE_CONTRACT" | "REFERENCES" | "HYDRATION" | "LOCKS" | "QUALITY_GATE" | "DIVERGENCE";
  issueCode?: string;
  referenceType?: "CONTENT_AST" | "MEDIA" | "SOURCE" | "NODE";
  nodeType?: string;
  nodePath?: string;
  invalidReason?: "UNKNOWN_REFERENCE" | "DUPLICATE_REFERENCE" | "UNUSABLE_MEDIA" | "REJECTED_SOURCE" | "MISSING_REQUIRED_SOURCE" | "INVALID_FORMAT";
  expectedNamespace?: "ast.units" | "context.media" | "context.sources" | "layout.sections";
  limitCounts?: EditorialLayoutDiagnosticCounts;
};

const fieldNames = new Set([
  "family", "variant", "design", "typography", "palette", "rhythm",
  "blocks", "sections", "id", "mediaIds", "placement", "title", "text", "crop",
  "gallery", "deck", "emphasis", "composition", "hidden", "headingProvenance",
  "sourceIds", "contentRef", "entries", "children", "columns", "gap", "label",
  "caption", "hero", "containerWidth", "content", "type", "locked", "aspectRatio", "columnRatio", "focalX", "focalY", "focalLocked", "schemaVersion", "mode"
]);

export class EditorialProposalError extends EditorialAiError {
  readonly fieldPath: string;
  readonly referenceDetails?: ReferenceValidationDetails;
  constructor(
    readonly validationCode: EditorialValidationCode,
    path: readonly PropertyKey[] = [],
    details?: ReferenceValidationDetails
  ) {
    super("PROPOSAL_INVALID");
    this.fieldPath = path.slice(0, 12).map(part => typeof part === "number" && Number.isSafeInteger(part) && part >= 0 && part < 100 ? String(part) : typeof part === "string" && fieldNames.has(part) ? part : "field").join(".") || "$";
    this.referenceDetails = { validationStage: ["JSON_PARSE", "OUTPUT_SIZE"].includes(validationCode) ? "MODEL_PARSE" : validationCode === "SCHEMA" ? "WIRE_SCHEMA" : validationCode === "DIRECTION" ? "LOCKS" : "REFERENCES", ...details };
  }
}
export function editorialHttpError(status: number, payload: unknown, retryAfterSeconds?: number) {
  const outer = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const e = outer.error && typeof outer.error === "object" ? outer.error as Record<string, unknown> : {};
  const code = safeCode(e.code) ?? safeCode(e.type), param = safeParam(e.param);
  const category: EditorialAiFailure = code === "model_not_found" || status === 404 ? "MODEL_UNAVAILABLE"
    : status === 401 ? "INVALID_API_KEY"
    : ["insufficient_quota", "billing_hard_limit_reached", "billing_not_active"].includes(code ?? "") ? "QUOTA_EXCEEDED" : status === 403 ? "FORBIDDEN"
    : status === 429 ? "RATE_LIMIT" : status === 408 ? "TIMEOUT"
    : status >= 500 ? "PROVIDER_UNAVAILABLE" : code === "invalid_json_schema" ? "OPENAI_SCHEMA_REJECTED"
    : code === "context_length_exceeded" ? "TOKEN_LIMIT" : status === 400 ? "UNSUPPORTED_PARAMETER" : "PROVIDER_UNAVAILABLE";
  return new EditorialAiError(category, status, code, param, retryAfterSeconds);
}
export function createEditorialAiDiagnostics() {
  const correlationId = randomUUID();
  const emit = (phase: "CONFIGURATION" | "ADMISSION" | "PROVIDER_REQUEST" | "PROPOSAL_VALIDATION", code: string, error?: EditorialAiError, extra: Record<string, unknown> = {}) => {
    // All callers supply constant application codes. Never include messages,
    // prompts, response bodies, actor/Destination IDs, headers or raw exceptions.
    console.info(JSON.stringify({ event: "editorial_ai", correlationId, phase, code, ...extra,
      httpStatus: error?.httpStatus ?? null, providerCode: error?.providerCode ?? null, param: error?.param ?? null,
      ...(error instanceof EditorialProposalError ? {
        validationCode: error.validationCode,
        fieldPath: error.fieldPath,
        validationStage: error.referenceDetails?.validationStage ?? "REFERENCES",
        issueCode: error.referenceDetails?.issueCode ?? error.validationCode,
        nodePath: error.fieldPath,
        ...(error.referenceDetails ? {
          referenceType: error.referenceDetails.referenceType ?? null,
          nodeType: error.referenceDetails.nodeType ?? null,
          nodePath: error.referenceDetails.nodePath && /^(?:sections|blocks)(?:\.(?:children|entries|[0-9]{1,2}))*$/.test(error.referenceDetails.nodePath) ? error.referenceDetails.nodePath : error.fieldPath,
          invalidReason: error.referenceDetails.invalidReason ?? null,
          expectedNamespace: error.referenceDetails.expectedNamespace ?? null,
          ...(error.referenceDetails.limitCounts ? {
            expectedRootSections: EDITORIAL_V2_MAX_ROOT_SECTIONS,
            actualRootSections: Number.isSafeInteger(error.referenceDetails.limitCounts.actualRootSections) ? Math.min(Math.max(0, error.referenceDetails.limitCounts.actualRootSections), MAX_DIAGNOSTIC_COUNT) : null,
            expectedTotalNodes: EDITORIAL_V2_MAX_TOTAL_NODES,
            actualTotalNodes: Number.isSafeInteger(error.referenceDetails.limitCounts.actualTotalNodes) ? Math.min(Math.max(0, error.referenceDetails.limitCounts.actualTotalNodes), MAX_DIAGNOSTIC_COUNT) : null,
            ...(error.referenceDetails.limitCounts.countsCapped ? { countsCapped: true } : {}),
          } : {}),
        } : {}),
      } : {}) }));
  };
  return { correlationId,
    received() { emit("ADMISSION", "APP_REQUEST_RECEIVED", undefined, { stage: "APP_REQUEST_RECEIVED" }); },
    admitted() { emit("ADMISSION", "ADMISSION_ACCEPTED", undefined, { stage: "ADMISSION_ACCEPTED" }); },
    admissionRejected(status: number | null, reason: "CONCURRENCY" | "PREPARATION_FAILED" | "AUTH_OR_INPUT") { emit("ADMISSION", "ADMISSION_REJECTED", new EditorialAiError("ADMISSION_REJECTED", status), { stage: "ADMISSION_REJECTED", outcome: "REJECTED_BEFORE_PROVIDER", providerCalled: false, admissionReason: reason }); },
    providerStarted(attempt: number, configuredTimeoutMs?: number, requestedModel = "gpt-6-luna") {
      emit("PROVIDER_REQUEST", "PROVIDER_REQUEST_STARTED", undefined, {
        stage: "PROVIDER_REQUEST_STARTED",
        requestedModel,
        attempt: attempt === 2 ? 2 : 1,
        ...(Number.isSafeInteger(configuredTimeoutMs) ? { configuredTimeoutMs } : {}),
      });
    },
    providerResponse(status: number, requestId: unknown, payload: unknown, attempt: number, elapsedMs?: number, configuredTimeoutMs?: number, requestedModel = "gpt-6-luna") {
      const p = payload && typeof payload === "object" ? payload as { model?: unknown; usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; completion_tokens_details?: { reasoning_tokens?: unknown } } } : {};
      const tokens = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
      emit("PROVIDER_REQUEST", "PROVIDER_RESPONSE_RECEIVED", new EditorialAiError("PROVIDER_UNAVAILABLE", status), {
        stage: "PROVIDER_RESPONSE_RECEIVED",
        requestedModel,
        actualModel: typeof p.model === "string" && p.model.length <= 100 && /^[a-zA-Z0-9._-]+$/u.test(p.model) && (p.model === requestedModel || p.model.startsWith(`${requestedModel}-`)) ? p.model : null,
        providerRequestId: typeof requestId === "string" && /^req_[a-zA-Z0-9_-]{1,160}$/.test(requestId) ? requestId : null,
        providerStatus: status,
        inputTokens: tokens(p.usage?.prompt_tokens),
        outputTokens: tokens(p.usage?.completion_tokens),
        reasoningTokens: tokens(p.usage?.completion_tokens_details?.reasoning_tokens),
        attempt: attempt === 2 ? 2 : 1,
        ...(Number.isSafeInteger(elapsedMs) ? { elapsedMs } : {}),
        ...(Number.isSafeInteger(configuredTimeoutMs) ? { configuredTimeoutMs } : {}),
      });
    },
    providerFailed(error: EditorialAiError, attempt: number, elapsedMs?: number, configuredTimeoutMs?: number) {
      emit("PROVIDER_REQUEST", error.code, error, {
        stage: "PROVIDER_REQUEST_FAILED",
        attempt: attempt === 2 ? 2 : 1,
        outcome: error.code,
        errorClassification: error.code,
        providerStatus: error.httpStatus ?? null,
        ...(Number.isSafeInteger(elapsedMs) ? { elapsedMs } : {}),
        ...(Number.isSafeInteger(configuredTimeoutMs) ? { configuredTimeoutMs } : {}),
      });
    },
    fallback(phase: "ADMISSION" | "PROVIDER_REQUEST" | "PROPOSAL_VALIDATION", error?: EditorialAiError, outcome = "FALLBACK") { emit(phase, error?.code ?? "FALLBACK", error, { stage: "FALLBACK_USED", outcome }); },
    configured(keyPresent: boolean, model: string | undefined) {
      emit("CONFIGURATION", !keyPresent ? "MISSING_API_KEY" : !model?.trim() ? "MISSING_MODEL" : model.trim() === "gpt-6-luna" ? "CONFIGURED_GPT6_LUNA" : "CONFIGURED_OTHER_MODEL");
    },
    failure(phase: "ADMISSION" | "PROVIDER_REQUEST" | "PROPOSAL_VALIDATION", error: EditorialAiError) { emit(phase, error.code, error, { stage: phase === "ADMISSION" ? "ADMISSION_REJECTED" : phase === "PROPOSAL_VALIDATION" ? "PROPOSAL_REJECTED" : "PROVIDER_REQUEST_FAILED" }); },
    success(outcome = "PROPOSED") { emit("PROPOSAL_VALIDATION", "PROPOSED", undefined, { stage: "PROPOSAL_VALIDATED", outcome }); },
    repaired(actions: { code: string; nodePath: string }[]) {
      // Only repair codes and structural paths, never replaced text or raw JSON.
      const safe = actions.filter(a => /^[A-Z_]{1,64}$/.test(a.code) && /^(sections(?:\.\d+|\.children|\.mediaIds|\.sourceIds|\.entries|\.text|\.title|\.deck|\.caption|\.contentRef|\.id|\.gap|\.crop|\.placement|\.gallery|\.emphasis|\.columnRatio|\.aspectRatio|\.columns|\.focalX|\.focalY|\.locked|\.hidden)*|hero|design|\$)$/.test(a.nodePath)).slice(0, 200);
      if (safe.length) emit("PROPOSAL_VALIDATION", "PROPOSAL_REPAIRED", undefined, { stage: "PROPOSAL_REPAIR", repairCount: safe.length, repairs: safe });
    },
  };
}
export type EditorialAiDiagnostics = ReturnType<typeof createEditorialAiDiagnostics>;
const reasons: Record<string, string> = {
  MODEL_UNAVAILABLE: "Model Editorial không tồn tại hoặc tài khoản chưa được cấp quyền sử dụng.",
  INVALID_API_KEY: "OpenAI từ chối API key. Kiểm tra cấu hình server.",
  FORBIDDEN: "Tài khoản hoặc project OpenAI không có quyền thực hiện yêu cầu.",
  QUOTA_EXCEEDED: "OpenAI báo thiếu quota hoặc cần kiểm tra billing.",
  RATE_LIMIT: "OpenAI đang giới hạn lượt gọi. Thử lại sau.",
  UNSUPPORTED_PARAMETER: "OpenAI từ chối tham số request Editorial. Kiểm tra log theo mã tham chiếu.",
  LOCAL_INVALID_SCHEMA: "JSON Schema của Editorial không hợp lệ cục bộ trước khi gửi.",
  OPENAI_SCHEMA_REJECTED: "OpenAI từ chối JSON Schema của Editorial.",
  INVALID_SCHEMA: "OpenAI từ chối JSON Schema của Editorial.",
  INVALID_OUTPUT: "OpenAI trả dữ liệu Structured Output không hợp lệ.",
  TOKEN_LIMIT: "Đề xuất vượt giới hạn token. Giữ bố cục hiện có hoặc thử lại.",
  TIMEOUT: "AI Editorial quá thời gian chờ.", NETWORK: "Không kết nối được OpenAI.",
  PROVIDER_UNAVAILABLE: "Dịch vụ OpenAI tạm thời không sẵn sàng.", REFUSAL: "OpenAI từ chối tạo đề xuất này.",
  CANCELLED: "Đã hủy chờ đề xuất AI.", CONFIGURATION: "Cấu hình Editorial chưa sẵn sàng cho GPT-6 Luna.",
  PROPOSAL_INVALID: "Đề xuất AI không đạt kiểm tra bố cục, nội dung hoặc ảnh của điểm đến.",
  ADMISSION_REJECTED: "Chưa thể chuẩn bị yêu cầu Editorial.",
  LLM_PROVIDER_ERROR: "Lỗi kết nối hoặc xử lý từ nhà cung cấp mô hình AI.",
  INVALID_MODEL_OUTPUT: "Đầu ra từ mô hình AI không đúng cấu trúc yêu cầu.",
  TITLE_PROVENANCE: "Đề xuất chứa tiêu đề không có trong nội dung gốc.",
  MEDIA_PROVENANCE: "Đề xuất chứa ảnh hoặc quyền sử dụng ảnh không hợp lệ.",
  SCHEMA_VALIDATION: "Dữ liệu bố cục không khớp với schema quy định.",
  STALE_LAYOUT: "Bản nháp đã thay đổi từ phiên khác. Vui lòng tải lại trang.",
};
export function editorialFallbackReason(error: EditorialAiError, correlationId: string) {
  const code = error instanceof EditorialProposalError ? error.validationCode : error.code;
  const detail = reasons[code] ?? reasons[error.code] ?? reasons.PROPOSAL_INVALID;
  const issues: Record<string, string> = {
    DUPLICATE_NODE_ID: "Có node trùng ID.", DUPLICATE_MEDIA: "Một ảnh xuất hiện nhiều lần.",
    SECTION_LIMIT: "Đề xuất vượt giới hạn 50 root node.", NODE_LIMIT: "Cây bố cục vượt giới hạn 50 node toàn cây.", TREE_LIMIT: "Cây bố cục vượt giới hạn kích thước node.", DEPTH_LIMIT: "Cây bố cục vượt ba cấp.",
    HERO_POSITION: "Hero bị lặp hoặc đặt sai cấp.", CONTENT_LOSS: "Đề xuất chưa giữ đủ nội dung gốc.",
    UNSOURCED_CONTENT: "Đề xuất có nội dung không được chứng minh từ hồ sơ.",
    UNVERIFIED_EVENT_SOURCE: "Sự kiện và nguồn tham khảo chưa có liên kết được kiểm chứng.",
    UNVERIFIED_CLAIM_SOURCE: "Nguồn chưa được xác nhận cho nội dung này.",
    MANUAL_LOCK: "Đề xuất thay đổi phần Admin đã khóa hoặc ẩn.",
  };
  const issue = error instanceof EditorialProposalError ? issues[error.referenceDetails?.issueCode ?? ""] : undefined;
  return `${AI_LAYOUT_PRESERVED} ${issue ?? detail}${error.providerCode ? ` Mã OpenAI: ${error.providerCode}.` : ""} Mã tham chiếu: ${correlationId}`;
}
