import { randomUUID } from "node:crypto";
import { AI_LAYOUT_PRESERVED } from "./editorial-display-policy";

export type EditorialAiFailure = "MODEL_UNAVAILABLE" | "INVALID_API_KEY" | "FORBIDDEN" | "QUOTA_EXCEEDED" | "RATE_LIMIT" | "UNSUPPORTED_PARAMETER" | "INVALID_SCHEMA" | "INVALID_OUTPUT" | "TOKEN_LIMIT" | "TIMEOUT" | "NETWORK" | "PROVIDER_UNAVAILABLE" | "REFUSAL" | "CANCELLED" | "CONFIGURATION" | "PROPOSAL_INVALID" | "ADMISSION_REJECTED";
const providerCodes = new Set(["model_not_found", "invalid_api_key", "insufficient_quota", "billing_hard_limit_reached", "billing_not_active", "unsupported_parameter", "unsupported_value", "invalid_parameter", "invalid_value", "invalid_json_schema", "rate_limit_exceeded", "server_error", "context_length_exceeded"]);
const parameters = new Set(["model", "temperature", "top_p", "max_completion_tokens", "response_format", "response_format.json_schema", "response_format.json_schema.schema", "reasoning_effort", "messages"]);
const safeCode = (value: unknown) => typeof value === "string" && providerCodes.has(value) ? value : null;
const safeParam = (value: unknown) => typeof value === "string" && parameters.has(value) ? value : null;
export class EditorialAiError extends Error {
  readonly providerCode: string | null;
  readonly param: string | null;
  readonly httpStatus: number | null;
  constructor(readonly code: EditorialAiFailure, httpStatus: number | null = null, providerCode: unknown = null, param: unknown = null) {
    super("Editorial AI request failed"); this.name = "EditorialAiError";
    this.httpStatus = Number.isInteger(httpStatus) && httpStatus! >= 100 && httpStatus! <= 599 ? httpStatus : null;
    this.providerCode = safeCode(providerCode); this.param = safeParam(param);
  }
}
export type EditorialValidationCode = "OUTPUT_SIZE" | "JSON_PARSE" | "SCHEMA" | "DIRECTION" | "BLOCK_IDS" | "TITLE_PROVENANCE" | "HEADING" | "COMPOSITION" | "MEDIA_ROLE" | "HIDDEN_STATE" | "DECK_PROVENANCE" | "LAYOUT_CONTRACT" | "MEDIA_ELIGIBILITY" | "REFERENCES" | "PHOTO_REMOVAL";
const fieldNames = new Set(["family", "variant", "design", "typography", "palette", "rhythm", "blocks", "id", "mediaIds", "placement", "title", "crop", "gallery", "deck", "emphasis", "composition", "hidden", "headingProvenance", "sourceIds"]);
export class EditorialProposalError extends EditorialAiError {
  readonly fieldPath: string;
  constructor(readonly validationCode: EditorialValidationCode, path: readonly PropertyKey[] = []) {
    super("PROPOSAL_INVALID");
    this.fieldPath = path.slice(0, 6).map(part => typeof part === "number" && Number.isSafeInteger(part) && part >= 0 && part < 100 ? String(part) : typeof part === "string" && fieldNames.has(part) ? part : "field").join(".");
  }
}
export function editorialHttpError(status: number, payload: unknown) {
  const outer = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const e = outer.error && typeof outer.error === "object" ? outer.error as Record<string, unknown> : {};
  const code = safeCode(e.code) ?? safeCode(e.type), param = safeParam(e.param);
  const category: EditorialAiFailure = code === "model_not_found" || status === 404 ? "MODEL_UNAVAILABLE"
    : status === 401 ? "INVALID_API_KEY"
    : ["insufficient_quota", "billing_hard_limit_reached", "billing_not_active"].includes(code ?? "") ? "QUOTA_EXCEEDED" : status === 403 ? "FORBIDDEN"
    : status === 429 ? "RATE_LIMIT" : status === 408 ? "TIMEOUT"
    : status >= 500 ? "PROVIDER_UNAVAILABLE" : code === "invalid_json_schema" ? "INVALID_SCHEMA"
    : code === "context_length_exceeded" ? "TOKEN_LIMIT" : status === 400 ? "UNSUPPORTED_PARAMETER" : "PROVIDER_UNAVAILABLE";
  return new EditorialAiError(category, status, code, param);
}
export function createEditorialAiDiagnostics() {
  const correlationId = randomUUID();
  const emit = (phase: "CONFIGURATION" | "ADMISSION" | "PROVIDER_REQUEST" | "PROPOSAL_VALIDATION", code: string, error?: EditorialAiError) => {
    // All callers supply constant application codes. Never include messages,
    // prompts, response bodies, actor/Destination IDs, headers or raw exceptions.
    console.info(JSON.stringify({ event: "editorial_ai", correlationId, phase, code,
      httpStatus: error?.httpStatus ?? null, providerCode: error?.providerCode ?? null, param: error?.param ?? null,
      ...(error instanceof EditorialProposalError ? { validationCode: error.validationCode, fieldPath: error.fieldPath } : {}) }));
  };
  return { correlationId,
    configured(keyPresent: boolean, model: string | undefined) {
      emit("CONFIGURATION", !keyPresent ? "MISSING_API_KEY" : !model?.trim() ? "MISSING_MODEL" : model.trim() === "gpt-6-luna" ? "CONFIGURED_GPT6_LUNA" : "CONFIGURED_OTHER_MODEL");
    },
    failure(phase: "ADMISSION" | "PROVIDER_REQUEST" | "PROPOSAL_VALIDATION", error: EditorialAiError) { emit(phase, error.code, error); },
    success() { emit("PROPOSAL_VALIDATION", "PROPOSED"); },
  };
}
export type EditorialAiDiagnostics = ReturnType<typeof createEditorialAiDiagnostics>;
const reasons: Record<EditorialAiFailure, string> = {
  MODEL_UNAVAILABLE: "Model Editorial không tồn tại hoặc tài khoản chưa được cấp quyền sử dụng.",
  INVALID_API_KEY: "OpenAI từ chối API key. Kiểm tra cấu hình server.",
  FORBIDDEN: "Tài khoản hoặc project OpenAI không có quyền thực hiện yêu cầu.",
  QUOTA_EXCEEDED: "OpenAI báo thiếu quota hoặc cần kiểm tra billing.",
  RATE_LIMIT: "OpenAI đang giới hạn lượt gọi. Thử lại sau.",
  UNSUPPORTED_PARAMETER: "OpenAI từ chối tham số request Editorial. Kiểm tra log theo mã tham chiếu.",
  INVALID_SCHEMA: "OpenAI từ chối JSON Schema của Editorial.",
  INVALID_OUTPUT: "OpenAI trả dữ liệu Structured Output không hợp lệ.",
  TOKEN_LIMIT: "Đề xuất vượt giới hạn token. Giữ bố cục hiện có hoặc thử lại.",
  TIMEOUT: "AI Editorial quá thời gian chờ.", NETWORK: "Không kết nối được OpenAI.",
  PROVIDER_UNAVAILABLE: "Dịch vụ OpenAI tạm thời không sẵn sàng.", REFUSAL: "OpenAI từ chối tạo đề xuất này.",
  CANCELLED: "Đã hủy chờ đề xuất AI.", CONFIGURATION: "Cấu hình Editorial chưa sẵn sàng cho GPT-6 Luna.",
  PROPOSAL_INVALID: "Đề xuất AI không đạt kiểm tra bố cục, nội dung hoặc ảnh của điểm đến.",
  ADMISSION_REJECTED: "Chưa thể chuẩn bị yêu cầu Editorial.",
};
export function editorialFallbackReason(error: EditorialAiError, correlationId: string) {
  return `${AI_LAYOUT_PRESERVED} ${reasons[error.code]} Mã tham chiếu: ${correlationId}`;
}
