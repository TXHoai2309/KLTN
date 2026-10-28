import { apiSuccess, apiMutationResult } from "@/server/http/api-response";
import { handleApiError, handleMutationApiError } from "@/server/http/error-handler";
import { requireIdempotencyKey } from "@/server/http/idempotency";
import { AppError } from "@/server/http/app-error";
import { readBoundedJsonBody } from "@/server/http/read-json-body";
import type { CompanionDependencies } from "./companion-service";
import { getCompanionGroup, joinCompanion } from "./companion-group-service";

export const companionNoStore = (response: Response) => { response.headers.set("Cache-Control", "private, no-store"); return response; };
export async function companionJson(request: Request) {
  const url = new URL(request.url);
  if (url.search) throw new AppError("INVALID_COMPANION_INPUT", "Thao tác không nhận query.", 400);
  if (request.headers.get("origin") !== url.origin) throw new AppError("INVALID_ORIGIN", "Yêu cầu không hợp lệ.", 403);
  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") throw new AppError("INVALID_CONTENT_TYPE", "Yêu cầu phải là JSON.", 415);
  return readBoundedJsonBody(request, { maxBytes: 24576,
    tooLargeError: new AppError("COMPANION_INPUT_TOO_LARGE", "Yêu cầu quá lớn.", 413),
    emptyError: new AppError("INVALID_COMPANION_INPUT", "Thiếu thông tin.", 400),
    invalidJsonError: new AppError("INVALID_COMPANION_INPUT", "JSON không hợp lệ.", 400),
  });
}
export async function companionReadResponse(request: Request, read: () => Promise<unknown>) {
  try {
    if (new URL(request.url).search) throw new AppError("INVALID_COMPANION_INPUT", "Yêu cầu không nhận query.", 400);
    return companionNoStore(apiSuccess(await read()));
  } catch (error) { return companionNoStore(handleApiError(error)); }
}
export async function companionWriteResponse(request: Request, write: (input: unknown, key: string) => Promise<Parameters<typeof apiMutationResult>[0]>) {
  try { const key = requireIdempotencyKey(request); return companionNoStore(apiMutationResult(await write(await companionJson(request), key))); }
  catch (error) { return companionNoStore(handleMutationApiError(error)); }
}
export const companionGroupResponse = (request: Request, id: string, deps: CompanionDependencies) =>
  companionReadResponse(request, () => getCompanionGroup(request.headers, id, deps));
export const companionJoinResponse = (request: Request, id: string, deps: CompanionDependencies) =>
  companionWriteResponse(request, (input, key) => joinCompanion(request.headers, id, input, key, deps));
