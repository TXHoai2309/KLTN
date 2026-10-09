import { apiSuccess } from "@/server/http/api-response";
import { handleApiError } from "@/server/http/error-handler";
import { getRagDocument } from "@/modules/rag-document/rag-service";
import { ragDependencies } from "@/modules/rag-document/rag-server";
import { privateRagResponse } from "@/modules/rag-document/rag-http";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try { return privateRagResponse(apiSuccess(await getRagDocument(request.headers, (await context.params).id, ragDependencies))); }
  catch (error) { return privateRagResponse(handleApiError(error)); }
}
