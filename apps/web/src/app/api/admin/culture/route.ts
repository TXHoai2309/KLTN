import { apiSuccess, apiMutationResult } from "@/server/http/api-response";
import { handleApiError, handleMutationApiError } from "@/server/http/error-handler";
import { requireIdempotencyKey } from "@/server/http/idempotency";
import { requireActor } from "@/server/authorization/guard";
import { cultureDependencies as deps } from "@/modules/culture/culture-server";
import { listCulture, writeCulture } from "@/modules/culture/culture-service";
import { cultureJson, culturePageQuery, privateCultureResponse as privateResponse } from "@/modules/culture/culture-http";
export async function GET(request: Request) {
  try { await requireActor(request.headers, deps, "admin"); return privateResponse(apiSuccess(await listCulture(request.headers, culturePageQuery(request), deps))); }
  catch (error) { return privateResponse(handleApiError(error)); }
}
export async function POST(request: Request) {
  try { await requireActor(request.headers, deps, "admin"); return privateResponse(apiMutationResult(await writeCulture(request.headers, await cultureJson(request), requireIdempotencyKey(request), null, deps))); }
  catch (error) { return privateResponse(handleMutationApiError(error)); }
}
