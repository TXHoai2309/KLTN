import { apiSuccess } from "@/server/http/api-response";
import { handleApiError } from "@/server/http/error-handler";
import { ragDependencies } from "@/modules/rag-document/rag-server";
import { createRagUploadUrl } from "@/modules/rag-document/rag-service";
import { privateRagResponse, ragJson } from "@/modules/rag-document/rag-http";

export async function POST(request: Request) {
  try { return privateRagResponse(apiSuccess(await createRagUploadUrl(request.headers, await ragJson(request), ragDependencies))); }
  catch (error) { return privateRagResponse(handleApiError(error)); }
}
