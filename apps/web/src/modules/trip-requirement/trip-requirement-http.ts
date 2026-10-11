import { apiSuccess } from "@/server/http/api-response";
import { AppError } from "@/server/http/app-error";
import { handleApiError } from "@/server/http/error-handler";
import { requireTraveler } from "@/server/auth/require-traveler";

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

async function readJsonBody(request: Request): Promise<unknown> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const parsedLength = Number(contentLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0 || parsedLength > MAX_EVALUATE_BODY_BYTES) {
      throw validationError("Nội dung yêu cầu vượt quá giới hạn cho phép.", {
        _form: "Nội dung yêu cầu không được vượt quá 8KB.",
      });
    }
  }

  if (!request.body) {
    throw validationError("Nội dung yêu cầu phải là JSON hợp lệ.", {
      _form: "Vui lòng gửi một nội dung JSON hợp lệ.",
    });
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_EVALUATE_BODY_BYTES) {
        await reader.cancel();
        throw validationError("Nội dung yêu cầu vượt quá giới hạn cho phép.", {
          _form: "Nội dung yêu cầu không được vượt quá 8KB.",
        });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw validationError("Nội dung yêu cầu phải là JSON hợp lệ.", {
      _form: "Vui lòng gửi một nội dung JSON hợp lệ.",
    });
  }
  return parsed;
}

export async function evaluateTripRequirementResponse(
  request: Request,
  dependencies: TripRequirementDependencies,
): Promise<Response> {
  try {
    // Authorization intentionally happens before reading/parsing the body.
    await requireTraveler(request.headers, dependencies.authorization);
    dependencies.onBodyRead?.();
    const rawInput = await readJsonBody(request);
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
