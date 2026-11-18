import { apiMutationResult } from "@/server/http/api-response";
import { handleMutationApiError } from "@/server/http/error-handler";
import { requireIdempotencyKey } from "@/server/http/idempotency";
import { bulkSetRagPublicQa } from "@/modules/rag-document/rag-service";
import { ragDependencies } from "@/modules/rag-document/rag-server";
import { privateRagResponse, ragJson } from "@/modules/rag-document/rag-http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const result = await bulkSetRagPublicQa(
      request.headers,
      await ragJson(request),
      requireIdempotencyKey(request),
      ragDependencies,
    );
    return privateRagResponse(apiMutationResult(result));
  } catch (error) {
    return privateRagResponse(handleMutationApiError(error));
  }
}
