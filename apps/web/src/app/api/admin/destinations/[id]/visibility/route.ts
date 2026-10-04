import { apiMutationResult } from "@/server/http/api-response";
import { handleMutationApiError } from "@/server/http/error-handler";
import { requireIdempotencyKey } from "@/server/http/idempotency";
import { requireActor } from "@/server/authorization/guard";
import { destinationDependencies as deps } from "@/modules/destination/destination-server";
import { setDestinationVisibility } from "@/modules/destination/destination-visibility";
import { destinationJson, privateDestinationResponse as privateResponse } from "@/modules/destination/destination-http";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireActor(request.headers, deps, "admin");
    return privateResponse(apiMutationResult(await setDestinationVisibility(request.headers, (await context.params).id, await destinationJson(request), requireIdempotencyKey(request), deps)));
  } catch (error) { return privateResponse(handleMutationApiError(error)); }
}
