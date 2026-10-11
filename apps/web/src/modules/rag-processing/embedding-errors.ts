export type EmbeddingErrorCode =
  | "INVALID_INPUT"
  | "RESOURCE_LIMIT"
  | "COST_LIMIT"
  | "CREDENTIALS_UNAVAILABLE"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED"
  | "PROVIDER_TIMEOUT"
  | "CANCELLED"
  | "ATTEMPT_LIMIT"
  | "INVALID_PROVIDER_RESPONSE";

export class EmbeddingError extends Error {
  constructor(
    readonly code: EmbeddingErrorCode,
    readonly retryable: boolean,
    readonly retryAfterMs?: number,
  ) {
    super(code);
    this.name = "EmbeddingError";
  }
}
