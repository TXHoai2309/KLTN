import { apiSuccess } from "@/server/http/api-response";
import { AppError } from "@/server/http/app-error";
import { handleApiError } from "@/server/http/error-handler";
import { requireTraveler } from "@/server/auth/require-traveler";
import { readBoundedJsonBody } from "@/server/http/read-json-body";

import { checkTripRequirement } from "./trip-requirement-check";
import type { TripRequirementDependencies } from "./trip-requirement-server";
import { deriveClarificationsFromCheck } from "./trip-clarification-rules";

export const MAX_CHECK_BODY_BYTES = 8 * 1024;

function privateResponse<T extends Response>(response: T): T {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function validationError(message: string, fieldErrors: Record<string, string>): AppError {
  return new AppError("VALIDATION_ERROR", message, 400, { fieldErrors });
}

function requestBodyError(): AppError {
  return validationError("Nội dung yêu cầu phải là JSON hợp lệ.", {
    _form: "Vui lòng gửi một đối tượng JSON hợp lệ.",
  });
}

const readCheckJsonBody = (request: Request) =>
  readBoundedJsonBody(request, {
    maxBytes: MAX_CHECK_BODY_BYTES,
    tooLargeError: validationError("Nội dung yêu cầu vượt quá giới hạn cho phép.", {
      _form: "Nội dung yêu cầu không được vượt quá 8KB.",
    }),
    emptyError: requestBodyError(),
    invalidJsonError: requestBodyError(),
  });

function isJsonRequest(request: Request): boolean {
  return request.headers.get("content-type")?.split(";")[0]?.trim() === "application/json";
}

function isObjectBody(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function checkTripRequirementResponse(
  request: Request,
  dependencies: TripRequirementDependencies,
): Promise<Response> {
  try {
    // Authorization must stay before Content-Type validation and body reads.
    await requireTraveler(request.headers, dependencies.authorization);
    if (!isJsonRequest(request)) {
      throw validationError("Yêu cầu phải là JSON.", {
        _form: "Content-Type phải là application/json.",
      });
    }

    dependencies.onBodyRead?.();
    const rawBody = await readCheckJsonBody(request);
    if (!isObjectBody(rawBody)) throw requestBodyError();

    const result = checkTripRequirement(rawBody, dependencies.now());
    return privateResponse(apiSuccess({
      ...result,
      clarificationRequests: deriveClarificationsFromCheck(result),
    }));
  } catch (error) {
    return privateResponse(handleApiError(error));
  }
}
