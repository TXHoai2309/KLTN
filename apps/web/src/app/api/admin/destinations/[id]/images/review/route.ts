import { apiMutationResult } from "@/server/http/api-response";
import { handleMutationApiError } from "@/server/http/error-handler";
import { requireIdempotencyKey } from "@/server/http/idempotency";
import { requireActor } from "@/server/authorization/guard";
import { destinationDependencies as deps } from "@/modules/destination/destination-server";
import { reviewDestinationImage } from "@/modules/destination/destination-image-service";
import { destinationJson, privateDestinationResponse as privateResponse } from "@/modules/destination/destination-http";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { await requireActor(request.headers, deps, "admin"); return privateResponse(apiMutationResult(await reviewDestinationImage(request.headers, await destinationJson(request), requireIdempotencyKey(request), (await context.params).id, deps))); }
  catch (error) { return privateResponse(handleMutationApiError(error)); }
}
