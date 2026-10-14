import { apiSuccess, apiMutationResult } from "@/server/http/api-response";
import { handleApiError, handleMutationApiError } from "@/server/http/error-handler";
import { requireIdempotencyKey } from "@/server/http/idempotency";
import { requireActor } from "@/server/authorization/guard";
import { cultureDependencies as deps } from "@/modules/culture/culture-server";
import { cultureJson, privateCultureResponse as privateResponse } from "@/modules/culture/culture-http";
import { listTaxonomy, createTaxonomy } from "@/modules/content-profile/taxonomy-service";
export async function GET(request: Request) { try {
    return privateResponse(apiSuccess(await listTaxonomy(request.headers, request, deps)));
}
catch (e) {
    return privateResponse(handleApiError(e));
} }
export async function POST(request: Request) { try {
    await requireActor(request.headers, deps, "admin");
    return privateResponse(apiMutationResult(await createTaxonomy(request.headers, await cultureJson(request), requireIdempotencyKey(request), deps)));
}
catch (e) {
    return privateResponse(handleMutationApiError(e));
} }
