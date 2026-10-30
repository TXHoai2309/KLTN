import type { AuthorizationDependencies } from "../../server/authorization/guard";
import { requireTraveler } from "../../server/auth/require-traveler";
import { readBoundedJsonBody } from "../../server/http/read-json-body";
import { AppError } from "../../server/http/app-error";
import { apiFailure, apiSuccess } from "../../server/http/api-response";
import { createPlanningAdmission } from "./planning-admission";
import { assistantV2RequestSchema, type AssistantV2Request } from "../assistant-agent-v2/http-contract";
import { createQaDiagnostics } from "../ai/qa-diagnostics";
const admit = createPlanningAdmission();

export async function planningResponse(request: Request, deps: { authorization: AuthorizationDependencies; v2?: (input: AssistantV2Request, key: string, actorId: string, headers: Headers) => Promise<unknown> }) {
  const noStore = (response: Response) => { response.headers.set("Cache-Control", "private, no-store"); response.headers.set("X-Assistant-Runtime", "v2"); return response; };
  try {
    const actor = await requireTraveler(request.headers, deps.authorization);
    if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") throw new AppError("FORBIDDEN", "Yêu cầu không được phép.", 403);
    if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") throw new AppError("INVALID_INPUT", "Yêu cầu phải là JSON.", 415);
    const key = request.headers.get("Idempotency-Key") ?? "";
    if (!/^[a-zA-Z0-9_-]{8,128}$/.test(key)) throw new AppError("INVALID_IDEMPOTENCY_KEY", "Thiếu mã yêu cầu hợp lệ.", 400);
    const invalid = new AppError("INVALID_INPUT", "Nội dung yêu cầu chưa hợp lệ.", 400);
    // A 28-stop preview can contain 27 verified geometries of 512 points each.
    // Preserve the bound without rejecting that legitimate save projection.
    const body = await readBoundedJsonBody(request, { maxBytes: 1_048_576, tooLargeError: invalid, emptyError: invalid, invalidJsonError: invalid });
    // One assistant: only the V2 action is served. Any other action (including the retired V1 planning actions) is rejected.
    if (!body || typeof body !== "object" || !("action" in body) || body.action !== "ASSISTANT_V2") throw invalid;
    const parsed = assistantV2RequestSchema.safeParse(body);
    if (!parsed.success) throw invalid;
    if (!deps.v2) throw new AppError("ASSISTANT_UNAVAILABLE", "Phiên trợ lý tạm thời không khả dụng.", 503);
    const diagnostics = createQaDiagnostics({ nodeEnv: process.env.NODE_ENV, vercelEnv: process.env.VERCEL_ENV });
    const result = await admit(actor.userId, () => diagnostics.run(() => deps.v2!(parsed.data, key, actor.userId, request.headers)));
    return noStore(apiSuccess(result));
  } catch (error) {
    if (error instanceof AppError) return noStore(apiFailure(error.code, error.message, error.status));
    // Never serialize provider, database or private request details.
    return noStore(apiFailure("PLANNING_UNAVAILABLE", "Chức năng lập hành trình tạm thời không khả dụng. Hãy giữ nội dung và thử lại.", 503));
  }
}
