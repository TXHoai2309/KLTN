import { requireActor } from "@/server/authorization/guard";
import { apiSuccess, apiMutationResult } from "@/server/http/api-response";
import { AppError } from "@/server/http/app-error";
import { handleApiError, handleMutationApiError } from "@/server/http/error-handler";
import { requireIdempotencyKey } from "@/server/http/idempotency";
import { readBoundedJsonBody } from "@/server/http/read-json-body";
import { mutateAdminUser, readAdminUsers, type AdminUserDependencies, type UserAction } from "./admin-user-service";

function query(request: Request) {
  const result: Record<string, string> = {};
  for (const [key, value] of new URL(request.url).searchParams) {
    if (Object.hasOwn(result, key)) throw new AppError("INVALID_USER_QUERY", "Tham số truy vấn bị lặp.", 400);
    Object.defineProperty(result, key, { value, enumerable: true });
  }
  return result;
}
const privateResponse = (response: Response) => { response.headers.set("Cache-Control", "private, no-store"); return response; };
export async function adminUserReadResponse(request: Request, deps: AdminUserDependencies, kind: "list" | "statistics" | "detail" | "audit", id?: string) {
  try { await requireActor(request.headers, deps, "admin"); return privateResponse(apiSuccess(await readAdminUsers(request.headers, deps, kind, query(request), id))); }
  catch (error) { return privateResponse(handleApiError(error)); }
}
export async function adminUserMutationResponse(request: Request, deps: AdminUserDependencies, id: string, action: UserAction) {
  try {
    await requireActor(request.headers, deps, "admin");
    if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") throw new AppError("FORBIDDEN_ORIGIN", "Yêu cầu phải đến từ cùng ứng dụng.", 403);
    if (new URL(request.url).search) throw new AppError("INVALID_USER_QUERY", "Thao tác không nhận tham số query.", 400);
    if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") throw new AppError("INVALID_CONTENT_TYPE", "Yêu cầu phải là JSON.", 415);
    const key = requireIdempotencyKey(request);
    const error = new AppError("INVALID_USER_REQUEST", "Nội dung yêu cầu không hợp lệ hoặc vượt 4KB.", 400);
    const body = await readBoundedJsonBody(request, { maxBytes: 4096, emptyError: error, invalidJsonError: error, tooLargeError: error });
    return privateResponse(apiMutationResult(await mutateAdminUser(request.headers, deps, id, action, body, key)));
  } catch (error) { return privateResponse(handleMutationApiError(error)); }
}
