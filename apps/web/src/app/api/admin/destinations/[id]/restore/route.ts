import { apiMutationResult } from "@/server/http/api-response";
import { handleMutationApiError } from "@/server/http/error-handler";
import { requireIdempotencyKey } from "@/server/http/idempotency";
import { requireActor } from "@/server/authorization/guard";
import { destinationDependencies as deps } from "@/modules/destination/destination-server";
import { privateDestinationResponse as privateResponse, requireDestinationSameOrigin } from "@/modules/destination/destination-http";
import { restoreDestination } from "@/modules/destination/destination-delete";

type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  try {
    await requireActor(request.headers, deps, "admin");
    requireDestinationSameOrigin(request);
    const result = await restoreDestination(request.headers, (await context.params).id, requireIdempotencyKey(request), deps);
    return privateResponse(apiMutationResult(result));
  } catch (error) { return privateResponse(handleMutationApiError(error)); }
}
