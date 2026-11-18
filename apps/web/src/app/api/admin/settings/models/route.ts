import { authorizationDependencies } from "@/server/authorization/server";
import { requireActor } from "@/server/authorization/guard";
import { apiSuccess } from "@/server/http/api-response";
import { handleApiError } from "@/server/http/error-handler";
import { availableConfigurableChatModels } from "@/modules/runtime-config/openai-model-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireActor(request.headers, authorizationDependencies, "admin");
    const response = apiSuccess({ models: await availableConfigurableChatModels() });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) { return handleApiError(error); }
}
