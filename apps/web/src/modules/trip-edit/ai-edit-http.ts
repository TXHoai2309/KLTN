import { z } from "zod";

import { requireTraveler } from "@/server/auth/require-traveler";
import type { AuthorizationDependencies } from "@/server/authorization/guard";
import { apiSuccess } from "@/server/http/api-response";
import { AppError } from "@/server/http/app-error";
import { handleApiError } from "@/server/http/error-handler";
import { readBoundedJsonBody } from "@/server/http/read-json-body";
import {
  isPreferenceExtractionError,
  toPreferenceExtractionAppError,
} from "../preference-extraction/preference-extraction-errors";
import {
  MAX_EDIT_INTENT_MESSAGE_LENGTH,
} from "./edit-intent-prompt";
import { editResolutionSchema } from "./edit-clarification";
import {
  createAiEditProposal,
  type AiEditServiceDependencies,
} from "./ai-edit-service";

export const MAX_AI_EDIT_BODY_BYTES = 8 * 1024;

export const aiEditRequestSchema = z
  .object({
    baseRevision: z.iso.datetime(),
    message: z
      .string()
      .min(1)
      .refine((message) => message.trim().length > 0, "Yêu cầu không được để trống.")
      .refine(
        (message) => [...message].length <= MAX_EDIT_INTENT_MESSAGE_LENGTH,
        `Tối đa ${MAX_EDIT_INTENT_MESSAGE_LENGTH} ký tự.`,
      ),
    resolution: editResolutionSchema.optional(),
  })
  .strict();

export type AiEditHttpDependencies = {
  authorization: AuthorizationDependencies;
  service: AiEditServiceDependencies;
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

const readAiEditJsonBody = (request: Request) =>
  readBoundedJsonBody(request, {
    maxBytes: MAX_AI_EDIT_BODY_BYTES,
    tooLargeError: validationError("Nội dung yêu cầu vượt quá giới hạn cho phép.", {
      _form: "Nội dung yêu cầu không được vượt quá 8KB.",
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

function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = ["baseRevision", "message", "resolution"].includes(String(issue.path[0]))
      ? String(issue.path[0])
      : "_form";
    result[field] ??=
      field === "baseRevision"
        ? "Phiên bản hành trình không hợp lệ."
        : field === "message"
          ? `Yêu cầu chỉnh sửa phải có nội dung và không quá ${MAX_EDIT_INTENT_MESSAGE_LENGTH} ký tự.`
          : field === "resolution"
            ? "Lựa chọn làm rõ không hợp lệ."
            : "Nội dung yêu cầu có trường không được hỗ trợ.";
  }
  if (Object.keys(result).length === 0) {
    result._form = "Vui lòng gửi baseRevision và message.";
  }
  return result;
}

function publicError(error: unknown): AppError {
  if (isPreferenceExtractionError(error)) {
    const mapped = toPreferenceExtractionAppError(error);
    const code = mapped.code === "AI_INVALID_RESPONSE" ? "AI_INVALID_RESPONSE" : "AI_UNAVAILABLE";
    const status = mapped.status;
    return new AppError(
      code,
      "Không thể tạo đề xuất chỉnh sửa bằng AI. Bạn vẫn có thể chỉnh sửa thủ công.",
      status,
    );
  }
  if (error instanceof AppError) return error;
  return new AppError("INTERNAL_SERVER_ERROR", "Đã xảy ra lỗi hệ thống.", 500);
}

/** Authenticates before touching the body, then maps a read-only proposal request. */
export async function aiEditResponse(
  request: Request,
  tripId: string,
  dependencies: AiEditHttpDependencies,
): Promise<Response> {
  try {
    const actor = await requireTraveler(request.headers, dependencies.authorization);
    assertSameOriginPost(request);
    if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") {
      throw validationError("Yêu cầu phải là JSON.", {
        _form: "Content-Type phải là application/json.",
      });
    }

    dependencies.onBodyRead?.();
    const rawBody = await readAiEditJsonBody(request);
    const parsed = aiEditRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw validationError(
        "Nội dung yêu cầu chỉnh sửa bằng AI chưa hợp lệ.",
        fieldErrors(parsed.error),
      );
    }

    const result = await createAiEditProposal(
      tripId,
      actor.userId,
      parsed.data,
      dependencies.service,
      dependencies.now(),
    );
    return privateResponse(apiSuccess(result));
  } catch (error) {
    return privateResponse(handleApiError(publicError(error)));
  }
}
