import { apiMutationResult, apiSuccess } from "@/server/http/api-response";
import { handleApiError, handleMutationApiError } from "@/server/http/error-handler";
import { requireIdempotencyKey } from "@/server/http/idempotency";
import { authorizationDependencies } from "@/server/authorization/server";
import { db } from "@/services";
import { parseIndexAction, processIndexRequest, readIndexProgress } from "@/modules/rag-index/rag-index-request-service";
import { privateRagResponse, ragJson } from "@/modules/rag-document/rag-http";
export const runtime = "nodejs";
// Request-scoped, never durable. Deployment must support this function limit.
export const maxDuration = 300;
type Context = { params: Promise<{ id: string }> };
const deps = { ...authorizationDependencies, database: db };
export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const input = parseIndexAction(await ragJson(request));
    return privateRagResponse(apiMutationResult(await processIndexRequest(request.headers, id,
      requireIdempotencyKey(request), input, deps, { signal: request.signal })));
  } catch (error) { return privateRagResponse(handleMutationApiError(error)); }
}
export async function GET(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    return privateRagResponse(apiSuccess(await readIndexProgress(request.headers, id, deps)));
  } catch (error) { return privateRagResponse(handleApiError(error)); }
}
