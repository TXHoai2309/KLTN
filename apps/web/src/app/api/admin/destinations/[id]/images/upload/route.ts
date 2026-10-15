import { apiMutationResult } from "@/server/http/api-response";
import { handleMutationApiError } from "@/server/http/error-handler";
import { requireIdempotencyKey } from "@/server/http/idempotency";
import { requireActor } from "@/server/authorization/guard";
import { destinationDependencies as deps } from "@/modules/destination/destination-server";
import { destinationImageProvider } from "@/modules/destination/cloudinary-provider";
import { uploadDestinationImage } from "@/modules/destination/destination-image-service";
import { imageBytes } from "@/modules/destination/destination-image-http";
import { privateDestinationResponse as privateResponse } from "@/modules/destination/destination-http";
import {createImageUploadDiagnostics} from "@/modules/destination/destination-image-diagnostics";
import {AppError} from "@/server/http/app-error";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const diagnostics=createImageUploadDiagnostics();
  const respond=(response:Response)=>{response.headers.set("X-Image-Upload-Request-Id",diagnostics.correlationId);return privateResponse(response);};
  try {
    await requireActor(request.headers, deps, "admin");
    const key=requireIdempotencyKey(request);const {id}=await context.params;
    diagnostics.setContext(id,key);diagnostics.setPhase("PROVIDER_CONFIGURATION");
    const provider=destinationImageProvider(diagnostics);
    diagnostics.setPhase("READ_BODY");const bytes=await imageBytes(request);
    const result=await uploadDestinationImage(request.headers,bytes,key,id,deps,provider,undefined,diagnostics);
    const response=apiMutationResult(result);
    diagnostics.complete(response.status,result.status,result.status!=="SUCCESS"?result.error.code:undefined);
    return respond(response);
  } catch (error) {
    // The shared UNKNOWN mapper must never receive a raw SDK/request/DB object.
    const response=handleMutationApiError(error instanceof AppError?error:new Error("Destination image upload failed"));
    diagnostics.failure(error,response.status);return respond(response);
  }
}
