import { apiSuccess, apiMutationResult } from "@/server/http/api-response";
import { handleApiError, handleMutationApiError } from "@/server/http/error-handler";
import { requireIdempotencyKey } from "@/server/http/idempotency";
import { requireActor } from "@/server/authorization/guard";
import { destinationDependencies as deps } from "@/modules/destination/destination-server";
import { getDestination, writeDestination } from "@/modules/destination/destination-service";
import { destinationJson, noDestinationQuery, privateDestinationResponse as privateResponse } from "@/modules/destination/destination-http";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try { await requireActor(request.headers, deps, "admin"); noDestinationQuery(request); return privateResponse(apiSuccess(await getDestination(request.headers, (await context.params).id, deps))); }
  catch (error) { return privateResponse(handleApiError(error)); }
}
export async function PATCH(request: Request, context: Context) {
  try { await requireActor(request.headers, deps, "admin"); return privateResponse(apiMutationResult(await writeDestination(request.headers, await destinationJson(request), requireIdempotencyKey(request), (await context.params).id, deps))); }
  catch (error) { return privateResponse(handleMutationApiError(error)); }
}
