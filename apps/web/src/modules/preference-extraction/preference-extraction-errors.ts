import { AppError } from "@/server/http/app-error";

export const PREFERENCE_EXTRACTION_ERROR_CODES = [
  "CREDENTIALS_UNAVAILABLE",
  "MODEL_UNAVAILABLE",
  "PROVIDER_TIMEOUT",
  "PROVIDER_RATE_LIMITED",
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_REJECTED",
  "INVALID_PROVIDER_RESPONSE",
  "PROVIDER_REFUSAL",
  "CANCELLED",
] as const;

export type PreferenceExtractionErrorCode =
  (typeof PREFERENCE_EXTRACTION_ERROR_CODES)[number];

export type PreferenceExtractionErrorOptions = {
  retryAfterMs?: number;
};

const safeMessageByCode: Record<PreferenceExtractionErrorCode, string> = {
  CREDENTIALS_UNAVAILABLE: "Tính năng phân tích nhu cầu hiện chưa được cấu hình.",
  MODEL_UNAVAILABLE: "Tính năng phân tích nhu cầu hiện chưa sẵn sàng.",
  PROVIDER_TIMEOUT: "Phân tích nhu cầu mất quá nhiều thời gian.",
  PROVIDER_RATE_LIMITED: "Tính năng phân tích nhu cầu đang bận; vui lòng thử lại sau.",
  PROVIDER_UNAVAILABLE: "Không thể kết nối tới dịch vụ phân tích nhu cầu.",
  PROVIDER_REJECTED: "Dịch vụ phân tích nhu cầu chưa chấp nhận yêu cầu này.",
  INVALID_PROVIDER_RESPONSE: "Dịch vụ phân tích nhu cầu trả về dữ liệu không hợp lệ.",
  PROVIDER_REFUSAL: "Dịch vụ phân tích nhu cầu không thể xử lý nội dung này.",
  CANCELLED: "Yêu cầu phân tích nhu cầu đã được hủy.",
};

const retryableByCode: Record<PreferenceExtractionErrorCode, boolean> = {
  CREDENTIALS_UNAVAILABLE: false,
  MODEL_UNAVAILABLE: false,
  PROVIDER_TIMEOUT: true,
  PROVIDER_RATE_LIMITED: true,
  PROVIDER_UNAVAILABLE: true,
  PROVIDER_REJECTED: false,
  INVALID_PROVIDER_RESPONSE: false,
  PROVIDER_REFUSAL: false,
  CANCELLED: false,
};

export class PreferenceExtractionError extends Error {
  readonly code: PreferenceExtractionErrorCode;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;

  constructor(
    code: PreferenceExtractionErrorCode,
    retryable = retryableByCode[code],
    options: PreferenceExtractionErrorOptions | number = {},
  ) {
    super(safeMessageByCode[code]);
    this.name = "PreferenceExtractionError";
    this.code = code;
    this.retryable = retryable;
    this.retryAfterMs = typeof options === "number" ? options : options.retryAfterMs;
  }

  toAppError(): AppError {
    return toPreferenceExtractionAppError(this);
  }
}

export function isPreferenceExtractionError(
  error: unknown,
): error is PreferenceExtractionError {
  return error instanceof PreferenceExtractionError;
}

/** Map provider failures to the public API error vocabulary without leaking provider data. */
export function toPreferenceExtractionAppError(error: unknown): AppError {
  if (!isPreferenceExtractionError(error)) {
    return new AppError(
      "AI_UNAVAILABLE",
      "Tính năng phân tích nhu cầu hiện chưa sẵn sàng. Bạn vẫn có thể nhập bằng biểu mẫu.",
      503,
    );
  }

  const code =
    error.code === "INVALID_PROVIDER_RESPONSE" || error.code === "PROVIDER_REFUSAL"
      ? "AI_INVALID_RESPONSE"
      : "AI_UNAVAILABLE";
  const message = `${safeMessageByCode[error.code]} Bạn vẫn có thể nhập bằng biểu mẫu.`;
  return new AppError(code, message, code === "AI_INVALID_RESPONSE" ? 502 : 503);
}

export const toAppError = toPreferenceExtractionAppError;
export const mapPreferenceExtractionError = toPreferenceExtractionAppError;

export type { StructuredLlmClient } from "./preference-extraction-client";

export function preferenceExtractionErrorMessage(
  code: PreferenceExtractionErrorCode,
): string {
  return safeMessageByCode[code];
}
