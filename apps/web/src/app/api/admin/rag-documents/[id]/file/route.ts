import { handleApiError } from "@/server/http/error-handler";
import { ragDependencies } from "@/modules/rag-document/rag-server";
import { getRagOriginal } from "@/modules/rag-document/rag-service";
import { privateRagResponse } from "@/modules/rag-document/rag-http";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { row, stream } = await getRagOriginal(request.headers, id, ragDependencies);
    return privateRagResponse(new Response(stream, { headers: {
      "Content-Type": row.mimeType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.originalFileName)}`,
      "X-Content-Type-Options": "nosniff",
    } }));
  } catch (error) { return privateRagResponse(handleApiError(error)); }
}
