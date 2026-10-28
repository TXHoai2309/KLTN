import { apiMutationResult, apiSuccess } from "@/server/http/api-response";
import { AppError } from "@/server/http/app-error";
import { handleApiError, handleMutationApiError } from "@/server/http/error-handler";
import { requireIdempotencyKey } from "@/server/http/idempotency";
import { readBoundedJsonBody } from "@/server/http/read-json-body";
import {
  getCompanionFormContext, getPublicCompanion, previewCompanion, publishCompanion,
  type CompanionDependencies,
} from "./companion-service";

function checkUrl(request: Request) {
  const url = new URL(request.url);
  if (url.search) throw new AppError("INVALID_COMPANION_INPUT", "Yêu cầu không nhận tham số query.", 400);
  return url;
}
async function jsonInput(request: Request) {
  if (request.headers.get("origin") !== checkUrl(request).origin) {
    throw new AppError("INVALID_ORIGIN", "Yêu cầu không hợp lệ.", 403);
  }
  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
    throw new AppError("INVALID_CONTENT_TYPE", "Yêu cầu phải là JSON.", 415);
  }
  return readBoundedJsonBody(request, {
    maxBytes: 24_576,
    tooLargeError: new AppError("COMPANION_INPUT_TOO_LARGE", "Yêu cầu quá lớn.", 413),
    emptyError: new AppError("INVALID_COMPANION_INPUT", "Thiếu thông tin công khai.", 400),
    invalidJsonError: new AppError("INVALID_COMPANION_INPUT", "JSON không hợp lệ.", 400),
  });
}
function noStore(response: Response) {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function companionPublicationResponse(request: Request, tripId: string, deps: CompanionDependencies) {
  try {
    checkUrl(request);
    if (request.method === "GET") return noStore(apiSuccess(await getCompanionFormContext(request.headers, tripId, deps)));
    if (request.method !== "POST") throw new AppError("METHOD_NOT_ALLOWED", "Thao tác không hợp lệ.", 405);
    const key = requireIdempotencyKey(request);
    return noStore(apiMutationResult(await publishCompanion(request.headers, tripId, await jsonInput(request), key, deps)));
  } catch (error) {
    return noStore(request.method === "GET" ? handleApiError(error) : handleMutationApiError(error));
  }
}

export async function companionPreviewResponse(request: Request, tripId: string, deps: CompanionDependencies) {
  try {
    if (request.method !== "POST") throw new AppError("METHOD_NOT_ALLOWED", "Thao tác không hợp lệ.", 405);
    return noStore(apiSuccess(await previewCompanion(request.headers, tripId, await jsonInput(request), deps)));
  } catch (error) { return noStore(handleApiError(error)); }
}

export async function publicCompanionResponse(request: Request, id: string, database: CompanionDependencies["database"]) {
  try {
    checkUrl(request);
    return noStore(apiSuccess(await getPublicCompanion(id, database)));
  } catch (error) { return noStore(handleApiError(error)); }
}
