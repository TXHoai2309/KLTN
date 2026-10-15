import { apiSuccess, apiMutationResult } from "@/server/http/api-response";
import { handleApiError, handleMutationApiError } from "@/server/http/error-handler";
import { requireIdempotencyKey } from "@/server/http/idempotency";
import { requireActor } from "@/server/authorization/guard";
import { destinationDependencies as deps } from "@/modules/destination/destination-server";
import { destinationJson, noDestinationQuery, privateDestinationResponse as privateResponse } from "@/modules/destination/destination-http";
import { getEditorial, writeEditorial } from "@/modules/destination-editorial/editorial-service";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try { await requireActor(request.headers, deps, "admin"); noDestinationQuery(request); return privateResponse(apiSuccess(await getEditorial(request.headers, (await context.params).id, deps))); }
  catch (error) { return privateResponse(handleApiError(error)); }
}
export async function PATCH(request: Request, context: Context) {
  try { await requireActor(request.headers, deps, "admin"); return privateResponse(apiMutationResult(await writeEditorial(request.headers, await destinationJson(request), requireIdempotencyKey(request), (await context.params).id, deps))); }
  catch (error) { return privateResponse(handleMutationApiError(error)); }
}
