import { authorizationDependencies } from "@/server/authorization/server";
import { requireActor } from "@/server/authorization/guard";
import { apiSuccess, apiMutationResult, apiMutationFailure, apiMutationUnknown } from "@/server/http/api-response";
import { handleApiError } from "@/server/http/error-handler";
import { requireIdempotencyKey } from "@/server/http/idempotency";
import { AppError } from "@/server/http/app-error";
import { configurationHistory, configurationOverview, rewrapConfiguration, updateConfiguration } from "@/modules/runtime-config/runtime-config-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireActor(request.headers, authorizationDependencies, "admin");
    const response = apiSuccess({ ...(await configurationOverview()), history: await configurationHistory() });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) { return handleApiError(error); }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireActor(request.headers, authorizationDependencies, "admin");
    const key = requireIdempotencyKey(request);
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) throw new AppError("FORBIDDEN", "Nguồn yêu cầu không hợp lệ.", 403);
    if (Number(request.headers.get("content-length") ?? 0) > 4096) throw new AppError("CONFIG_INPUT_INVALID", "Yêu cầu quá lớn.", 413);
    const raw = await request.text();
    if (raw.length > 4096) throw new AppError("CONFIG_INPUT_INVALID", "Yêu cầu quá lớn.", 413);
    let input: unknown;
    try { input = JSON.parse(raw); } catch { throw new AppError("CONFIG_INPUT_INVALID", "JSON không hợp lệ.", 400); }
    return apiMutationResult(await updateConfiguration(actor.id, key, input));
  } catch (error) {
    if (error instanceof AppError) return apiMutationFailure(error.code, error.message, error.status);
    return apiMutationUnknown();
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request.headers, authorizationDependencies, "admin");
    const key = requireIdempotencyKey(request);
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) throw new AppError("FORBIDDEN", "Nguồn yêu cầu không hợp lệ.", 403);
    return apiMutationResult(await rewrapConfiguration(actor.id, key));
  } catch (error) {
    if (error instanceof AppError) return apiMutationFailure(error.code, error.message, error.status);
    return apiMutationUnknown();
  }
}
