import { apiSuccess } from "@/server/http/api-response";
import { AppError } from "@/server/http/app-error";
import { handleApiError } from "@/server/http/error-handler";
import { requireTraveler } from "@/server/auth/require-traveler";
import { readBoundedJsonBody } from "@/server/http/read-json-body";

import {
  tripRequirementFieldErrors,
  tripRequirementInputSchema,
} from "./trip-requirement-contract";
import {
  evaluateTripRequirement,
} from "./trip-requirement-readiness";
import type { TripRequirementDependencies } from "./trip-requirement-server";

export const MAX_EVALUATE_BODY_BYTES = 8 * 1024;

function privateResponse<T extends Response>(response: T): T {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function validationError(message: string, fieldErrors: Record<string, string>): AppError {
  return new AppError("VALIDATION_ERROR", message, 400, { fieldErrors });
}

const readEvaluateJsonBody = (request: Request) =>
  readBoundedJsonBody(request, {
    maxBytes: MAX_EVALUATE_BODY_BYTES,
    tooLargeError: validationError("Nội dung yêu cầu vượt quá giới hạn cho phép.", {
      _form: "Nội dung yêu cầu không được vượt quá 8KB.",
    }),
    emptyError: validationError("Nội dung yêu cầu phải là JSON hợp lệ.", {
      _form: "Vui lòng gửi một nội dung JSON hợp lệ.",
    }),
    invalidJsonError: validationError("Nội dung yêu cầu phải là JSON hợp lệ.", {
      _form: "Vui lòng gửi một nội dung JSON hợp lệ.",
    }),
  });

export async function evaluateTripRequirementResponse(
  request: Request,
  dependencies: TripRequirementDependencies,
): Promise<Response> {
  try {
    // Authorization intentionally happens before reading/parsing the body.
    await requireTraveler(request.headers, dependencies.authorization);
    dependencies.onBodyRead?.();
    const rawInput = await readEvaluateJsonBody(request);
    const parsed = tripRequirementInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Thông tin nhu cầu chuyến đi chưa hợp lệ.",
        400,
        { fieldErrors: tripRequirementFieldErrors(parsed.error) },
      );
    }

    return privateResponse(
      apiSuccess({
        requirement: parsed.data,
        readiness: evaluateTripRequirement(parsed.data, dependencies.now()),
      }),
    );
  } catch (error) {
    return privateResponse(handleApiError(error));
  }
}
