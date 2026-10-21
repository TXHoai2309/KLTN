import { apiSuccess, apiMutationResult, apiMutationUnknown } from "@/server/http/api-response";
import { handleApiError, handleMutationApiError } from "@/server/http/error-handler";
import { requireIdempotencyKey } from "@/server/http/idempotency";
import { requireActor } from "@/server/authorization/guard";
import { AppError } from "@/server/http/app-error";
import { destinationDependencies as deps } from "@/modules/destination/destination-server";
import { destinationJson, noDestinationQuery, privateDestinationResponse as privateResponse } from "@/modules/destination/destination-http";
import { getEditorial, writeEditorial } from "@/modules/destination-editorial/editorial-service";
import { recordEditorialApiFailure } from "@/modules/destination-editorial/editorial-ai-diagnostics";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try { await requireActor(request.headers, deps, "admin"); noDestinationQuery(request); return privateResponse(apiSuccess(await getEditorial(request.headers, (await context.params).id, deps))); }
  catch (error) {
    if (!(error instanceof AppError)) {
      recordEditorialApiFailure("EDITORIAL_GET", "INTERNAL_SERVER_ERROR");
      return privateResponse(handleApiError(new AppError("INTERNAL_SERVER_ERROR", "Đã xảy ra lỗi hệ thống", 500)));
    }
    return privateResponse(handleApiError(error));
  }
}
export async function PATCH(request: Request, context: Context) {
  try { await requireActor(request.headers, deps, "admin"); return privateResponse(apiMutationResult(await writeEditorial(request.headers, await destinationJson(request), requireIdempotencyKey(request), (await context.params).id, deps))); }
  catch (error) {
    if (error instanceof AppError) {
      if (error.code !== "INVALID_EDITORIAL") recordEditorialApiFailure("EDITORIAL_SAVE", error.code);
      return privateResponse(handleMutationApiError(error));
    }
    recordEditorialApiFailure("EDITORIAL_SAVE", "OPERATION_STATUS_UNKNOWN");
    return privateResponse(apiMutationUnknown());
  }
}
