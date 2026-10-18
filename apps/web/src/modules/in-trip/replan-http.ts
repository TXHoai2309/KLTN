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
import { editResolutionSchema } from "../trip-edit/edit-clarification";
import { MAX_REPLAN_NEED_LENGTH } from "./replan-contract";
import { inTripLocationSchema } from "./in-trip-location";
import { replanTrip, type ReplanServiceDependencies } from "./replan-service";

export const MAX_IN_TRIP_REPLAN_BODY_BYTES = 8 * 1024;

export const inTripReplanRequestSchema = z
  .object({
    baseRevision: z.iso.datetime(),
    location: inTripLocationSchema,
    need: z
      .string()
      .min(1)
      .refine((need) => need.trim().length > 0, "Nhu cầu không được để trống.")
      .refine(
        (need) => [...need].length <= MAX_REPLAN_NEED_LENGTH,
        `Nhu cầu mới không được quá ${MAX_REPLAN_NEED_LENGTH} ký tự.`,
      ),
    resolution: editResolutionSchema.optional(),
  })
  .strict();

export type InTripReplanHttpDependencies = {
  authorization: AuthorizationDependencies;
  service: ReplanServiceDependencies;
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

const readReplanJsonBody = (request: Request) =>
  readBoundedJsonBody(request, {
    maxBytes: MAX_IN_TRIP_REPLAN_BODY_BYTES,
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
    const field = ["baseRevision", "location", "need", "resolution"].includes(
      String(issue.path[0]),
    )
      ? String(issue.path[0])
      : "_form";
    result[field] ??=
      field === "baseRevision"
        ? "Phiên bản hành trình không hợp lệ."
        : field === "location"
          ? "Vị trí hiện tại không hợp lệ."
          : field === "need"
            ? `Nhu cầu mới phải có nội dung và không quá ${MAX_REPLAN_NEED_LENGTH} ký tự.`
            : field === "resolution"
              ? "Lựa chọn làm rõ không hợp lệ."
              : "Nội dung yêu cầu có trường không được hỗ trợ.";
  }
  if (Object.keys(result).length === 0) {
    result._form = "Vui lòng gửi baseRevision, location và need.";
  }
  return result;
}

function publicError(error: unknown): AppError {
  if (isPreferenceExtractionError(error)) {
    const mapped = toPreferenceExtractionAppError(error);
    const code = mapped.code === "AI_INVALID_RESPONSE" ? "AI_INVALID_RESPONSE" : "AI_UNAVAILABLE";
    return new AppError(code, "Không thể tạo đề xuất trong chuyến đi bằng AI.", mapped.status);
  }
  if (error instanceof AppError) return error;
  return new AppError("INTERNAL_SERVER_ERROR", "Đã xảy ra lỗi hệ thống.", 500);
}

/** Authenticates before touching request metadata/body, then maps a read-only proposal. */
export async function replanResponse(
  request: Request,
  tripId: string,
  dependencies: InTripReplanHttpDependencies,
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
    const rawBody = await readReplanJsonBody(request);
    const parsed = inTripReplanRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw validationError(
        "Nội dung yêu cầu đề xuất lại chưa hợp lệ.",
        fieldErrors(parsed.error),
      );
    }

    const result = await replanTrip(tripId, actor.userId, parsed.data, dependencies.service);
    return privateResponse(apiSuccess(result));
  } catch (error) {
    return privateResponse(handleApiError(publicError(error)));
  }
}
