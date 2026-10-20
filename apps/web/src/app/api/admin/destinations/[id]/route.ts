import { destinationResponseDto } from "@/modules/destination/destination-http";
import { apiSuccess, apiMutationResult } from "@/server/http/api-response";
import { handleApiError, handleMutationApiError } from "@/server/http/error-handler";
import { requireIdempotencyKey } from "@/server/http/idempotency";
import { requireActor } from "@/server/authorization/guard";
import { destinationDependencies as deps } from "@/modules/destination/destination-server";
import { getDestination, writeDestination } from "@/modules/destination/destination-service";
import { destinationJson, noDestinationQuery, privateDestinationResponse as privateResponse, requireDestinationSameOrigin } from "@/modules/destination/destination-http";
import { softDeleteDestination } from "@/modules/destination/destination-delete";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try { await requireActor(request.headers, deps, "admin"); noDestinationQuery(request); return privateResponse(apiSuccess(destinationResponseDto(await getDestination(request.headers, (await context.params).id, deps), request))); }
  catch (error) { return privateResponse(handleApiError(error)); }
}
export async function PATCH(request: Request, context: Context) {
  try { await requireActor(request.headers, deps, "admin"); const result = await writeDestination(request.headers, await destinationJson(request), requireIdempotencyKey(request), (await context.params).id, deps); if (result.status === "SUCCESS") result.data = destinationResponseDto(result.data, request); return privateResponse(apiMutationResult(result)); }
  catch (error) { return privateResponse(handleMutationApiError(error)); }
}
export async function DELETE(request: Request, context: Context) {
  try { await requireActor(request.headers, deps, "admin"); requireDestinationSameOrigin(request); const result = await softDeleteDestination(request.headers, (await context.params).id, requireIdempotencyKey(request), deps); return privateResponse(apiMutationResult(result)); }
  catch (error) { return privateResponse(handleMutationApiError(error)); }
}
