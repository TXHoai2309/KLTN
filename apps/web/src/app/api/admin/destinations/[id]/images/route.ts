import { apiSuccess } from "@/server/http/api-response";
import { handleApiError } from "@/server/http/error-handler";
import { requireActor } from "@/server/authorization/guard";
import { destinationDependencies as deps } from "@/modules/destination/destination-server";
import { effectiveCloudinaryConfiguration } from "@/modules/destination/cloudinary-provider";
import { privateDestinationResponse as privateResponse, noDestinationQuery } from "@/modules/destination/destination-http";
import { getDestination } from "@/modules/destination/destination-service";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireActor(request.headers, deps, "admin"); noDestinationQuery(request);
    await getDestination(request.headers, (await context.params).id, deps);
    return privateResponse(apiSuccess({ configured: Boolean(await effectiveCloudinaryConfiguration()) }));
  } catch (error) { return privateResponse(handleApiError(error)); }
}
