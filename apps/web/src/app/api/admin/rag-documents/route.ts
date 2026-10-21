import { apiMutationResult, apiSuccess } from "@/server/http/api-response";
import { handleApiError, handleMutationApiError } from "@/server/http/error-handler";
import { requireIdempotencyKey } from "@/server/http/idempotency";
import { ragDependencies } from "@/modules/rag-document/rag-server";
import { finalizeRagUpload, listRagDocuments, type RagDocumentListView } from "@/modules/rag-document/rag-service";
import { privateRagResponse, ragJson } from "@/modules/rag-document/rag-http";
import { AppError } from "@/server/http/app-error";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const view = url.searchParams.get("view") ?? "active";
    if (url.searchParams.size > 1 || (view !== "active" && view !== "deleted")) {
      throw new AppError("INVALID_RAG_QUERY", "Tham số danh sách tài liệu không hợp lệ.", 400);
    }
    return privateRagResponse(apiSuccess(await listRagDocuments(request.headers, ragDependencies, view as RagDocumentListView)));
  }
  catch (error) { return privateRagResponse(handleApiError(error)); }
}

export async function POST(request: Request) {
  try { return privateRagResponse(apiMutationResult(await finalizeRagUpload(request.headers, await ragJson(request), requireIdempotencyKey(request), ragDependencies))); }
  catch (error) { return privateRagResponse(handleMutationApiError(error)); }
}
