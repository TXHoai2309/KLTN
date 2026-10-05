import { apiMutationResult } from "@/server/http/api-response";
import { handleMutationApiError } from "@/server/http/error-handler";
import { requireIdempotencyKey } from "@/server/http/idempotency";
import { requireActor } from "@/server/authorization/guard";
import { cultureDependencies as deps } from "@/modules/culture/culture-server";
import { setCultureVisibility } from "@/modules/culture/culture-service";
import { cultureJson, privateCultureResponse as privateResponse } from "@/modules/culture/culture-http";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireActor(request.headers, deps, "admin");
    return privateResponse(apiMutationResult(await setCultureVisibility(request.headers, (await context.params).id, await cultureJson(request), requireIdempotencyKey(request), deps)));
  } catch (error) { return privateResponse(handleMutationApiError(error)); }
}
