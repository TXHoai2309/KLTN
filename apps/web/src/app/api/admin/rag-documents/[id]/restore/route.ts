import { apiMutationResult } from "@/server/http/api-response";
import { handleMutationApiError } from "@/server/http/error-handler";
import { requireIdempotencyKey } from "@/server/http/idempotency";
import { ragDependencies } from "@/modules/rag-document/rag-server";
import { restoreRagDocument } from "@/modules/rag-document/rag-service";
import { privateRagResponse, ragJson } from "@/modules/rag-document/rag-http";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    return privateRagResponse(apiMutationResult(await restoreRagDocument(
      request.headers, (await context.params).id, await ragJson(request), requireIdempotencyKey(request), ragDependencies,
    )));
  } catch (error) { return privateRagResponse(handleMutationApiError(error)); }
}
