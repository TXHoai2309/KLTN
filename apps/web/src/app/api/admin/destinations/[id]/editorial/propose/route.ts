import { apiSuccess } from "@/server/http/api-response";
import { handleApiError } from "@/server/http/error-handler";
import { requireActor } from "@/server/authorization/guard";
import { destinationDependencies as deps } from "@/modules/destination/destination-server";
import { destinationJson, privateDestinationResponse as privateResponse } from "@/modules/destination/destination-http";
import { proposeEditorial } from "@/modules/destination-editorial/editorial-ai";
import { editorialAiClient } from "@/modules/destination-editorial/editorial-server";
import { AppError } from "@/server/http/app-error";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { await requireActor(request.headers, deps, "admin"); const body = await destinationJson(request); if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length) throw new AppError("INVALID_EDITORIAL_AI", "Yêu cầu không hợp lệ.", 400);
    return privateResponse(apiSuccess(await proposeEditorial(request.headers, (await context.params).id, deps, editorialAiClient()))); }
  catch (error) { return privateResponse(handleApiError(error)); }
}
