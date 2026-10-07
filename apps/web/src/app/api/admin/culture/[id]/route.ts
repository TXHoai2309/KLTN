import { apiSuccess, apiMutationResult } from "@/server/http/api-response";
import { handleApiError, handleMutationApiError } from "@/server/http/error-handler";
import { requireIdempotencyKey } from "@/server/http/idempotency";
import { requireActor } from "@/server/authorization/guard";
import { cultureDependencies as deps } from "@/modules/culture/culture-server";
import { getCulture, writeCulture } from "@/modules/culture/culture-service";
import { cultureJson, noCultureQuery, privateCultureResponse as privateResponse } from "@/modules/culture/culture-http";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try { await requireActor(request.headers, deps, "admin"); noCultureQuery(request); return privateResponse(apiSuccess(await getCulture(request.headers, (await context.params).id, deps))); }
  catch (error) { return privateResponse(handleApiError(error)); }
}
export async function PATCH(request: Request, context: Context) {
  try { await requireActor(request.headers, deps, "admin"); return privateResponse(apiMutationResult(await writeCulture(request.headers, await cultureJson(request), requireIdempotencyKey(request), (await context.params).id, deps))); }
  catch (error) { return privateResponse(handleMutationApiError(error)); }
}
