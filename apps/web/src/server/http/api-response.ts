import { NextResponse } from "next/server";

import type {
  MutationApiResponse,
  MutationOutcome,
} from "../../lib/mutation-contract";

export type ApiSuccess<T> = {
  success: true;
  data: T;
};

export type ApiFailure = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json<ApiSuccess<T>>(
    {
      success: true,
      data,
    },
    { status },
  );
}

export function apiFailure(
  code: string,
  message: string,
  status = 400,
  details?: unknown,
) {
  return NextResponse.json<ApiFailure>(
    {
      success: false,
      error: {
        code,
        message,
        ...(details !== undefined ? { details } : {}),
      },
    },
    { status },
  );
}

export function apiMutationResult<T>(outcome: MutationOutcome<T>) {
  if (outcome.status === "SUCCESS") {
    return NextResponse.json<MutationApiResponse<T>>(
      {
        success: true,
        operationStatus: "SUCCESS",
        data: outcome.data,
      },
      {
        status: 200,
        headers: {
          "Idempotency-Replayed": String(outcome.replayed === true),
        },
      },
    );
  }

  if (outcome.status === "FAILED") {
    return NextResponse.json<MutationApiResponse<T>>(
      {
        success: false,
        operationStatus: "FAILED",
        error: {
          code: outcome.error.code,
          message: outcome.error.message,
          ...(outcome.error.details !== undefined
            ? { details: outcome.error.details }
            : {}),
        },
      },
      { status: outcome.httpStatus ?? 400 },
    );
  }

  return NextResponse.json<MutationApiResponse<T>>(
    {
      success: false,
      operationStatus: "UNKNOWN",
      error: outcome.error,
      retryWithSameKey: true,
    },
    { status: 503 },
  );
}

export function apiMutationFailure(
  code: string,
  message: string,
  status = 400,
  details?: unknown,
) {
  return NextResponse.json<MutationApiResponse<never>>(
    {
      success: false,
      operationStatus: "FAILED",
      error: {
        code,
        message,
        ...(details !== undefined ? { details } : {}),
      },
    },
    { status },
  );
}

export function apiMutationUnknown() {
  return NextResponse.json<MutationApiResponse<never>>(
    {
      success: false,
      operationStatus: "UNKNOWN",
      error: {
        code: "OPERATION_STATUS_UNKNOWN",
        message:
          "Chưa thể xác định thao tác đã hoàn tất hay chưa. Hãy thử lại với cùng Idempotency-Key.",
      },
      retryWithSameKey: true,
    },
    { status: 503 },
  );
}
