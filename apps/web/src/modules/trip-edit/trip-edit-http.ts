import { z } from "zod";

import { requireTraveler } from "@/server/auth/require-traveler";
import type { AuthorizationDependencies } from "@/server/authorization/guard";
import { apiMutationResult, apiSuccess } from "@/server/http/api-response";
import { AppError } from "@/server/http/app-error";
import { handleApiError, handleMutationApiError } from "@/server/http/error-handler";
import { requireIdempotencyKey } from "@/server/http/idempotency";
import { readBoundedJsonBody } from "@/server/http/read-json-body";
import {
  applyEdit,
  applyEditRequestSchema,
  type ApplyEditDependencies,
} from "./apply-edit";
import { editCandidateSchema } from "./edit-candidate";
import {
  previewEdit,
  type TripEditServiceDependencies,
} from "./trip-edit-service";

export const MAX_EDIT_PREVIEW_BODY_BYTES = 64 * 1024;

export const previewEditRequestSchema = z
  .object({
    baseRevision: z.iso.datetime(),
    candidate: editCandidateSchema,
  })
  .strict();

export type TripEditPreviewHttpDependencies = {
  authorization: AuthorizationDependencies;
  service: TripEditServiceDependencies;
  now: () => Date;
  /** Test-only instrumentation; production dependencies do not set it. */
  onBodyRead?: () => void;
};

export type TripEditApplyHttpDependencies = {
  authorization: AuthorizationDependencies;
  service: ApplyEditDependencies;
  now: () => Date;
  /** Test-only instrumentation; production dependencies do not set it. */
  onBodyRead?: () => void;
};

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

const readPreviewJsonBody = (request: Request) =>
  readBoundedJsonBody(request, {
    maxBytes: MAX_EDIT_PREVIEW_BODY_BYTES,
    tooLargeError: validationError("Nội dung yêu cầu vượt quá giới hạn cho phép.", {
      _form: "Nội dung yêu cầu không được vượt quá 64KB.",
    }),
    emptyError: requestBodyError(),
    invalidJsonError: requestBodyError(),
  });

function assertSameOriginPost(request: Request): void {
  const requestOrigin = new URL(request.url).origin;
  if (request.headers.get("origin") !== requestOrigin) {
    throw new AppError("INVALID_ORIGIN", "Yêu cầu không hợp lệ.", 403);
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "same-site") {
    throw new AppError("INVALID_ORIGIN", "Yêu cầu không hợp lệ.", 403);
  }
}

function requestFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path[0];
    const field = ["baseRevision", "candidate", "confirmed", "kind"].includes(String(path))
      ? String(path)
      : "_form";
    fieldErrors[field] ??= field === "baseRevision"
      ? "Phiên bản hành trình không hợp lệ."
      : field === "candidate"
        ? "Phương án chỉnh sửa không hợp lệ."
        : field === "confirmed"
          ? "Cần xác nhận áp dụng phương án."
          : field === "kind"
            ? "Loại chỉnh sửa không hợp lệ."
            : "Nội dung yêu cầu có trường không được hỗ trợ.";
  }
  if (Object.keys(fieldErrors).length === 0) {
    fieldErrors._form = "Vui lòng gửi baseRevision và candidate.";
  }
  return fieldErrors;
}

export async function applyEditResponse(
  request: Request,
  tripId: string,
  dependencies: TripEditApplyHttpDependencies,
): Promise<Response> {
  try {
    // Keep auth ahead of headers that can fail validation and all body access.
    const actor = await requireTraveler(request.headers, dependencies.authorization);
    assertSameOriginPost(request);
    if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") {
      throw validationError("Yêu cầu phải là JSON.", {
        _form: "Content-Type phải là application/json.",
      });
    }

    dependencies.onBodyRead?.();
    const rawBody = await readPreviewJsonBody(request);
    const parsed = applyEditRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw validationError(
        "Nội dung áp dụng chỉnh sửa chưa hợp lệ.",
        requestFieldErrors(parsed.error),
      );
    }
    const key = requireIdempotencyKey(request);
    const result = await applyEdit(
      request.headers,
      tripId,
      actor.userId,
      parsed.data,
      key,
      dependencies.service,
      dependencies.now(),
    );
    return privateResponse(apiMutationResult(result));
  } catch (error) {
    return privateResponse(handleMutationApiError(error));
  }
}

export async function previewEditResponse(
  request: Request,
  tripId: string,
  dependencies: TripEditPreviewHttpDependencies,
): Promise<Response> {
  try {
    // Keep auth ahead of Content-Type checks and all request body access.
    const actor = await requireTraveler(request.headers, dependencies.authorization);
    assertSameOriginPost(request);
    if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") {
      throw validationError("Yêu cầu phải là JSON.", {
        _form: "Content-Type phải là application/json.",
      });
    }

    dependencies.onBodyRead?.();
    const rawBody = await readPreviewJsonBody(request);
    const parsed = previewEditRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw validationError(
        "Nội dung phương án chỉnh sửa chưa hợp lệ.",
        requestFieldErrors(parsed.error),
      );
    }

    const result = await previewEdit(
      tripId,
      actor.userId,
      parsed.data.baseRevision,
      parsed.data.candidate,
      dependencies.service,
      dependencies.now(),
    );
    return privateResponse(apiSuccess(result));
  } catch (error) {
    return privateResponse(handleApiError(error));
  }
}
