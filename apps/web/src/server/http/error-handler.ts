import { AppError } from "./app-error";
import {
  apiFailure,
  apiMutationFailure,
  apiMutationUnknown,
} from "./api-response";

export function handleApiError(error: unknown) {
  if (error instanceof AppError) {
    return apiFailure(
      error.code,
      error.message,
      error.status,
      error.details,
    );
  }

  console.error("Unhandled API error:", error);

  return apiFailure(
    "INTERNAL_SERVER_ERROR",
    "Đã xảy ra lỗi hệ thống",
    500,
  );
}

export function handleMutationApiError(error: unknown) {
  if (error instanceof AppError) {
    return apiMutationFailure(
      error.code,
      error.message,
      error.status,
      error.details,
    );
  }

  console.error("Unhandled mutation API error:", error);

  return apiMutationUnknown();
}
