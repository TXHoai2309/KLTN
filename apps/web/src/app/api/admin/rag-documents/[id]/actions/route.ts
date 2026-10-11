import { apiMutationResult } from "@/server/http/api-response";
import { handleMutationApiError } from "@/server/http/error-handler";
import { requireIdempotencyKey } from "@/server/http/idempotency";
import { transitionRagDocument } from "@/modules/rag-document/rag-service";
import { ragDependencies } from "@/modules/rag-document/rag-server";
import { privateRagResponse, ragJson } from "@/modules/rag-document/rag-http";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return privateRagResponse(apiMutationResult(await transitionRagDocument(request.headers, id, await ragJson(request), requireIdempotencyKey(request), ragDependencies)));
  } catch (error) { return privateRagResponse(handleMutationApiError(error)); }
}
