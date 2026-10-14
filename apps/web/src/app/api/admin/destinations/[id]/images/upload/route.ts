import { apiMutationResult } from "@/server/http/api-response";
import { handleMutationApiError } from "@/server/http/error-handler";
import { requireIdempotencyKey } from "@/server/http/idempotency";
import { requireActor } from "@/server/authorization/guard";
import { destinationDependencies as deps } from "@/modules/destination/destination-server";
import { destinationImageProvider } from "@/modules/destination/cloudinary-provider";
import { uploadDestinationImage } from "@/modules/destination/destination-image-service";
import { imageBytes } from "@/modules/destination/destination-image-http";
import { privateDestinationResponse as privateResponse } from "@/modules/destination/destination-http";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { await requireActor(request.headers, deps, "admin"); const key = requireIdempotencyKey(request); const provider = destinationImageProvider();
    return privateResponse(apiMutationResult(await uploadDestinationImage(request.headers, await imageBytes(request), key, (await context.params).id, deps, provider)));
  } catch (error) { return privateResponse(handleMutationApiError(error)); }
}
