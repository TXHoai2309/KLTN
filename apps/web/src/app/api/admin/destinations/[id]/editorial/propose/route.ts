import { apiSuccess } from "@/server/http/api-response";
import { handleApiError } from "@/server/http/error-handler";
import { requireActor } from "@/server/authorization/guard";
import { destinationDependencies as deps } from "@/modules/destination/destination-server";
import { destinationJson, privateDestinationResponse as privateResponse } from "@/modules/destination/destination-http";
import { proposeEditorial } from "@/modules/destination-editorial/editorial-ai";
import { editorialAiClient } from "@/modules/destination-editorial/editorial-server";
import { AppError } from "@/server/http/app-error";
import { editorialProposalInputSchema } from "@/modules/destination-editorial/editorial-contract";
import { createEditorialAiDiagnostics, EditorialAiError } from "@/modules/destination-editorial/editorial-ai-diagnostics";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const diagnostics = createEditorialAiDiagnostics();
  const respond = (response: Response) => { response.headers.set("X-Editorial-Ai-Request-Id", diagnostics.correlationId); return privateResponse(response); };
  try { await requireActor(request.headers, deps, "admin"); const parsed = editorialProposalInputSchema.safeParse(await destinationJson(request)); if (!parsed.success) throw new AppError("INVALID_EDITORIAL_AI", "Yêu cầu không hợp lệ.", 400);
    return respond(apiSuccess(await proposeEditorial(request.headers, (await context.params).id, deps, editorialAiClient(), { diagnostics, signal: request.signal, layout: parsed.data.layout, direction: parsed.data.direction }))); }
  catch (error) {
    diagnostics.failure("ADMISSION", new EditorialAiError("ADMISSION_REJECTED", error instanceof AppError ? error.status : null));
    return respond(handleApiError(error instanceof AppError ? error : new AppError("EDITORIAL_AI_UNAVAILABLE", "Không thể chuẩn bị đề xuất Editorial. Thử lại sau.", 503)));
  }
}
