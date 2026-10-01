import type {
  MutationApiResponse,
  MutationError,
  MutationOutcome,
} from "./mutation-contract";

type MutationRequestOptions = {
  /** Keep this key and the request body unchanged when retrying UNKNOWN. */
  idempotencyKey: string;
  init?: RequestInit;
};

function unknownOutcome<T>(): MutationOutcome<T> {
  return {
    status: "UNKNOWN",
    error: {
      code: "OPERATION_STATUS_UNKNOWN",
      message:
        "Không nhận được trạng thái xác nhận. Hãy thử lại cùng request và Idempotency-Key.",
    },
    retryWithSameKey: true,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMutationError(value: unknown): value is MutationError {
  return (
    isObject(value) &&
    typeof value.code === "string" &&
    typeof value.message === "string"
  );
}

function isMutationResponse<T>(
  value: unknown,
): value is MutationApiResponse<T> {
  if (!isObject(value)) return false;

  if (
    value.success === true &&
    value.operationStatus === "SUCCESS" &&
    "data" in value
  ) {
    return true;
  }

  return (
    value.success === false &&
    (value.operationStatus === "FAILED" ||
      value.operationStatus === "UNKNOWN") &&
    isMutationError(value.error)
  );
}

/**
 * Sends one write attempt. Call again with the same key and identical request
 * when the returned outcome is UNKNOWN.
 */
export async function sendIdempotentMutation<T>(
  url: string | URL,
  options: MutationRequestOptions,
): Promise<MutationOutcome<T>> {
  const headers = new Headers(options.init?.headers);
  headers.set("Idempotency-Key", options.idempotencyKey);

  let response: Response;
  try {
    response = await fetch(url, { ...options.init, headers });
  } catch {
    return unknownOutcome<T>();
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return unknownOutcome<T>();
  }

  if (!isMutationResponse<T>(body)) return unknownOutcome<T>();

  if (body.operationStatus === "SUCCESS") {
    return {
      status: "SUCCESS",
      data: body.data,
      replayed: response.headers.get("Idempotency-Replayed") === "true",
    };
  }

  if (body.operationStatus === "FAILED") {
    return {
      status: "FAILED",
      error: body.error,
      httpStatus: response.status,
    };
  }

  return {
    status: "UNKNOWN",
    error: body.error,
    retryWithSameKey: true,
  };
}

export function createIdempotencyKey(): string {
  return globalThis.crypto.randomUUID();
}
