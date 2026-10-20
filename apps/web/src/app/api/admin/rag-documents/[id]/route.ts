import { apiMutationResult, apiSuccess } from "@/server/http/api-response";
import { handleApiError, handleMutationApiError } from "@/server/http/error-handler";
import { requireIdempotencyKey } from "@/server/http/idempotency";
import { getRagDocument, softDeleteRagDocument } from "@/modules/rag-document/rag-service";
import { ragDependencies } from "@/modules/rag-document/rag-server";
import { privateRagResponse, ragJson } from "@/modules/rag-document/rag-http";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try { return privateRagResponse(apiSuccess(await getRagDocument(request.headers, (await context.params).id, ragDependencies))); }
  catch (error) { return privateRagResponse(handleApiError(error)); }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    return privateRagResponse(apiMutationResult(await softDeleteRagDocument(
      request.headers, (await context.params).id, await ragJson(request), requireIdempotencyKey(request), ragDependencies,
    )));
  } catch (error) { return privateRagResponse(handleMutationApiError(error)); }
}
