import { apiMutationResult, apiSuccess } from "@/server/http/api-response";
import { handleApiError, handleMutationApiError } from "@/server/http/error-handler";
import { requireIdempotencyKey } from "@/server/http/idempotency";
import { ragDependencies } from "@/modules/rag-document/rag-server";
import { finalizeRagUpload, listRagDocuments } from "@/modules/rag-document/rag-service";
import { privateRagResponse, ragJson } from "@/modules/rag-document/rag-http";

export async function GET(request: Request) {
  try { return privateRagResponse(apiSuccess(await listRagDocuments(request.headers, ragDependencies))); }
  catch (error) { return privateRagResponse(handleApiError(error)); }
}

export async function POST(request: Request) {
  try { return privateRagResponse(apiMutationResult(await finalizeRagUpload(request.headers, await ragJson(request), requireIdempotencyKey(request), ragDependencies))); }
  catch (error) { return privateRagResponse(handleMutationApiError(error)); }
}
