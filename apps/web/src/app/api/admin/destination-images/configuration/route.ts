import { apiSuccess } from "@/server/http/api-response";
import { handleApiError } from "@/server/http/error-handler";
import { requireActor } from "@/server/authorization/guard";
import { destinationDependencies as deps } from "@/modules/destination/destination-server";
import { cloudinaryConfiguration } from "@/modules/destination/cloudinary-provider";
import { privateDestinationResponse as privateResponse, noDestinationQuery } from "@/modules/destination/destination-http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try { await requireActor(request.headers, deps, "admin"); noDestinationQuery(request); return privateResponse(apiSuccess({ configured: Boolean(cloudinaryConfiguration()) })); }
  catch (error) { return privateResponse(handleApiError(error)); }
}
