import { apiSuccess, apiMutationResult } from "@/server/http/api-response";
import { handleApiError, handleMutationApiError } from "@/server/http/error-handler";
import { requireIdempotencyKey } from "@/server/http/idempotency";
import { requireActor } from "@/server/authorization/guard";
import { destinationDependencies as deps } from "@/modules/destination/destination-server";
import { listDestinations, writeDestination } from "@/modules/destination/destination-service";
import { destinationJson, destinationPageQuery, privateDestinationResponse as privateResponse } from "@/modules/destination/destination-http";
export async function GET(request: Request) {
  try { await requireActor(request.headers, deps, "admin"); return privateResponse(apiSuccess(await listDestinations(request.headers, destinationPageQuery(request), deps))); }
  catch (error) { return privateResponse(handleApiError(error)); }
}
export async function POST(request: Request) {
  try { await requireActor(request.headers, deps, "admin"); return privateResponse(apiMutationResult(await writeDestination(request.headers, await destinationJson(request), requireIdempotencyKey(request), null, deps))); }
  catch (error) { return privateResponse(handleMutationApiError(error)); }
}
