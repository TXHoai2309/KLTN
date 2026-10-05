import { apiFailure, apiMutationResult, apiSuccess } from "@/server/http/api-response";
import { AppError } from "@/server/http/app-error";
import { handleApiError, handleMutationApiError } from "@/server/http/error-handler";
import { requireIdempotencyKey } from "@/server/http/idempotency";
import { accountDependencies } from "@/modules/account/account-server";
import { getAccount, updateAccount } from "@/modules/account/account-service";

function privateResponse<T extends Response>(response: T): T {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export async function GET(request: Request) {
  try {
    if (new URL(request.url).search) return privateResponse(apiFailure("INVALID_ACCOUNT_QUERY", "Endpoint chỉ đọc tài khoản hiện tại.", 400));
    return privateResponse(apiSuccess(await getAccount(request.headers, accountDependencies)));
  } catch (error) { return privateResponse(handleApiError(error)); }
}
export async function PATCH(request: Request) {
  try {
    // Cookie authentication requires same-origin CSRF protection for this
    // application-owned endpoint; do not rely on the provider's middleware.
    if (request.headers.get("origin") !== new URL(request.url).origin) throw new AppError("INVALID_ORIGIN", "Yêu cầu không hợp lệ.", 403);
    if (new URL(request.url).search) throw new AppError("INVALID_ACCOUNT_QUERY", "Endpoint chỉ cập nhật tài khoản hiện tại.", 400);
    if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") throw new AppError("INVALID_CONTENT_TYPE", "Yêu cầu phải là JSON.", 415);
    const body: unknown = await request.json().catch(() => { throw new AppError("INVALID_JSON", "Yêu cầu không hợp lệ.", 400); });
    return privateResponse(apiMutationResult(await updateAccount(request.headers, body, requireIdempotencyKey(request), accountDependencies)));
  } catch (error) { return privateResponse(handleMutationApiError(error)); }
}
