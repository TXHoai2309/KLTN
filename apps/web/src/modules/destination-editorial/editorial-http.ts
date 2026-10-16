import { apiSuccess, apiFailure } from "@/server/http/api-response";
import { handleApiError } from "@/server/http/error-handler";
import { requireActor } from "@/server/authorization/guard";
import type { DestinationDependencies } from "../destination/destination-service";
import type { StructuredLlmClient } from "../preference-extraction/preference-extraction-client";
import { destinationJson, privateDestinationResponse as privateResponse } from "@/modules/destination/destination-http";
import { proposeEditorial } from "@/modules/destination-editorial/editorial-ai";
import { AppError } from "@/server/http/app-error";
import { editorialProposalInputSchema } from "@/modules/destination-editorial/editorial-contract";
import { createEditorialAiDiagnostics } from "@/modules/destination-editorial/editorial-ai-diagnostics";
export function createEditorialProposalHandler(deps: DestinationDependencies, client: () => StructuredLlmClient | null) {
return async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const diagnostics = createEditorialAiDiagnostics();
  diagnostics.received();
  const respond = (response: Response) => { response.headers.set("X-Editorial-Ai-Request-Id", diagnostics.correlationId); return privateResponse(response); };
  try { await requireActor(request.headers, deps, "admin"); const parsed = editorialProposalInputSchema.safeParse(await destinationJson(request)); if (!parsed.success) throw new AppError("INVALID_EDITORIAL_AI", "Yêu cầu không hợp lệ.", 400);
    const result = await proposeEditorial(request.headers, (await context.params).id, deps, client(), { diagnostics, signal: request.signal, layout: parsed.data.layout, direction: parsed.data.direction, mode: parsed.data.mode, expectedRevision: parsed.data.expectedRevision, version: parsed.data.version, timeoutMs: parsed.data.timeoutMs });
    if ("httpStatus" in result && result.httpStatus === 429) {
      const response = apiFailure(result.providerLimitCode === "QUOTA_EXCEEDED" ? "EDITORIAL_AI_PROVIDER_QUOTA" : "EDITORIAL_AI_PROVIDER_RATE_LIMIT", result.reason || "Lỗi giới hạn lượt gọi từ nhà cung cấp AI", 429, { source: "PROVIDER", providerCode: result.providerCode });
      if (result.retryAfterSeconds !== undefined) response.headers.set("Retry-After", String(result.retryAfterSeconds));
      return respond(response);
    }
    return respond(apiSuccess(result)); }
  catch (error) {
    const safe = error instanceof AppError ? error : new AppError("EDITORIAL_AI_UNAVAILABLE", "Không thể chuẩn bị đề xuất Editorial. Thử lại sau.", 503);
    diagnostics.admissionRejected(safe.status, ["EDITORIAL_AI_IN_PROGRESS", "EDITORIAL_AI_BUSY"].includes(safe.code) ? "CONCURRENCY" : safe.status >= 500 ? "PREPARATION_FAILED" : "AUTH_OR_INPUT");
    const response = handleApiError(safe);
    return respond(response);
  }
}

}
