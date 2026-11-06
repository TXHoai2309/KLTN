import { requireTraveler } from "@/server/auth/require-traveler";
import { AppError } from "@/server/http/app-error";
import { apiSuccess, apiFailure, apiMutationResult, apiMutationFailure, apiMutationUnknown } from "@/server/http/api-response";
import { requireIdempotencyKey } from "@/server/http/idempotency";
import { readBoundedJsonBody } from "@/server/http/read-json-body";
import { journeyEditApplySchema, journeyEditPreviewSchema } from "./journey-edit-contract";
import { applyJourneyEdit, previewJourneyEdit, type JourneyEditDependencies } from "./journey-edit-service";

export async function journeyEditResponse(request: Request, id: string, mode: "PREVIEW" | "APPLY", deps: JourneyEditDependencies): Promise<Response> {
  const privateResponse = (response: Response) => { response.headers.set("Cache-Control", "private, no-store"); return response; };
  try {
    await requireTraveler(request.headers, deps);
    const site = request.headers.get("sec-fetch-site");
    if (request.headers.get("origin") !== new URL(request.url).origin || (site && !["same-origin", "same-site"].includes(site))) throw new AppError("FORBIDDEN_ORIGIN", "Yêu cầu không được phép.", 403);
    if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") throw new AppError("INVALID_CONTENT_TYPE", "Yêu cầu phải là JSON.", 415);
    const key = mode === "APPLY" ? requireIdempotencyKey(request) : "";
    const invalid = new AppError("INVALID_JOURNEY_EDIT", "Dữ liệu thay đổi đi/về chưa hợp lệ.", 400);
    const body = await readBoundedJsonBody(request, { maxBytes: 64_000, tooLargeError: new AppError("TRIP_INPUT_TOO_LARGE", "Nội dung yêu cầu quá lớn.", 413), emptyError: invalid, invalidJsonError: invalid });
    if (mode === "PREVIEW") {
      const input = journeyEditPreviewSchema.safeParse(body); if (!input.success) throw invalid;
      return privateResponse(apiSuccess(await previewJourneyEdit(request.headers, id, input.data, deps)));
    }
    const input = journeyEditApplySchema.safeParse(body); if (!input.success) throw invalid;
    return privateResponse(apiMutationResult(await applyJourneyEdit(request.headers, id, input.data, key, deps)));
  } catch (error) {
    if (error instanceof AppError) return privateResponse(mode === "APPLY" ? apiMutationFailure(error.code, error.message, error.status, error.details) : apiFailure(error.code, error.message, error.status, error.details));
    return privateResponse(mode === "APPLY" ? apiMutationUnknown() : apiFailure("JOURNEY_EDIT_UNAVAILABLE", "Chưa thể tính lại phương án đi/về.", 503));
  }
}
