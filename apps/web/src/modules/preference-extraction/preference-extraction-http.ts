import { z } from "zod";

import { requireTraveler } from "@/server/auth/require-traveler";
import { apiSuccess } from "@/server/http/api-response";
import { AppError } from "@/server/http/app-error";
import { handleApiError } from "@/server/http/error-handler";
import { readBoundedJsonBody } from "@/server/http/read-json-body";

import {
  isPreferenceExtractionError,
  toPreferenceExtractionAppError,
} from "./preference-extraction-errors";
import {
  extractPreferences,
  type PreferenceExtractionDependencies,
} from "./preference-extraction-service";
import type { PreferenceExtractionServerDependencies } from "./preference-extraction-server";

export const MAX_ANALYZE_BODY_BYTES = 8 * 1024;

export const preferenceAnalyzeBodySchema = z
  .object({ text: z.string() })
  .strict();

export type PreferenceAnalyzeDependencies = PreferenceExtractionServerDependencies & {
  /** Test-only instrumentation; production dependencies do not set it. */
  onBodyRead?: () => void;
};

function privateResponse<T extends Response>(response: T): T {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function validationError(
  message: string,
  fieldErrors: Record<string, string>,
): AppError {
  return new AppError("VALIDATION_ERROR", message, 400, { fieldErrors });
}

function requestBodyError(): AppError {
  return validationError("Nội dung yêu cầu phải là JSON hợp lệ.", {
    _form: "Vui lòng gửi JSON có đúng trường text.",
  });
}

const readAnalyzeJsonBody = (request: Request) =>
  readBoundedJsonBody(request, {
    maxBytes: MAX_ANALYZE_BODY_BYTES,
    tooLargeError: validationError("Nội dung yêu cầu vượt quá giới hạn cho phép.", {
      _form: "Nội dung yêu cầu không được vượt quá 8KB.",
    }),
    emptyError: requestBodyError(),
    invalidJsonError: requestBodyError(),
  });

function bodyFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path[0] === "text" ? "text" : "_form";
    fieldErrors[field] ??=
      field === "text"
        ? "Vui lòng nhập văn bản nhu cầu chuyến đi."
        : "Chỉ được gửi trường text trong nội dung JSON.";
  }
  if (Object.keys(fieldErrors).length === 0) {
    fieldErrors._form = "Vui lòng gửi JSON có đúng trường text.";
  }
  return fieldErrors;
}

function assertSameOriginPost(request: Request): void {
  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (origin !== requestOrigin) {
    throw new AppError("INVALID_ORIGIN", "Yêu cầu không hợp lệ.", 403);
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "same-site") {
    throw new AppError("INVALID_ORIGIN", "Yêu cầu không hợp lệ.", 403);
  }
}

function inputLengthOf(value: unknown): number {
  return typeof value === "string" ? [...value].length : 0;
}

function clockMs(dependencies: PreferenceAnalyzeDependencies): number {
  return dependencies.nowMs?.() ?? Date.now();
}

function publicError(error: unknown): AppError {
  if (isPreferenceExtractionError(error)) {
    return toPreferenceExtractionAppError(error);
  }
  if (error instanceof AppError) return error;
  return new AppError(
    "INTERNAL_SERVER_ERROR",
    "Đã xảy ra lỗi hệ thống.",
    500,
  );
}

function logSafeError(code: string, latencyMs: number, inputLength: number): void {
  // Never pass the request, prompt, provider response or original error to the
  // logger. Those values may contain sensitive trip preferences.
  console.error("Preference extraction request failed", {
    code,
    latencyMs,
    inputLength,
  });
}

export async function analyzePreferencesResponse(
  request: Request,
  dependencies: PreferenceAnalyzeDependencies,
): Promise<Response> {
  let startedAt: number | null = null;
  let inputLength = 0;

  try {
    // Auth is deliberately first: denied callers must not read body bytes,
    // validate Content-Type, invoke the LLM or touch any persistence layer.
    await requireTraveler(request.headers, dependencies.authorization);
    startedAt = clockMs(dependencies);
    assertSameOriginPost(request);
    if (
      request.headers.get("content-type")?.split(";")[0]?.trim() !==
      "application/json"
    ) {
      throw validationError("Yêu cầu phải là JSON.", {
        _form: "Content-Type phải là application/json.",
      });
    }

    dependencies.onBodyRead?.();
    const rawBody = await readAnalyzeJsonBody(request);
    if (
      rawBody !== null &&
      typeof rawBody === "object" &&
      !Array.isArray(rawBody) &&
      typeof (rawBody as { text?: unknown }).text === "string"
    ) {
      inputLength = inputLengthOf((rawBody as { text: string }).text);
    }

    const parsed = preferenceAnalyzeBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      throw validationError(
        "Văn bản nhu cầu chuyến đi chưa hợp lệ.",
        bodyFieldErrors(parsed.error),
      );
    }

    const result = await extractPreferences(parsed.data.text, dependencies);
    return privateResponse(apiSuccess({ result }));
  } catch (error) {
    const safeError = publicError(error);
    logSafeError(
      safeError.code,
      startedAt === null
        ? 0
        : Math.max(0, Math.round(clockMs(dependencies) - startedAt)),
      inputLength,
    );
    return privateResponse(handleApiError(safeError));
  }
}

/** Keep the service dependency shape visible to route-level tests and callers. */
export type { PreferenceExtractionDependencies };
