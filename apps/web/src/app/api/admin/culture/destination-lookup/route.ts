import { apiSuccess } from "@/server/http/api-response";
import { handleApiError } from "@/server/http/error-handler";
import { requireActor } from "@/server/authorization/guard";
import { cultureDependencies as deps } from "@/modules/culture/culture-server";
import { lookupCultureDestinations } from "@/modules/culture/culture-service";
import { cultureLookupQuery, privateCultureResponse } from "@/modules/culture/culture-http";
export async function GET(request: Request) {
 try { await requireActor(request.headers, deps, "admin"); const {query,page} = cultureLookupQuery(request); return privateCultureResponse(apiSuccess(await lookupCultureDestinations(request.headers, query, page, deps))); }
 catch(error) { return privateCultureResponse(handleApiError(error)); }
}
