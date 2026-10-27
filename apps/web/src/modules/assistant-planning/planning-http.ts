import type { AuthorizationDependencies } from "../../server/authorization/guard";
import { requireTraveler } from "../../server/auth/require-traveler";
import { readBoundedJsonBody } from "../../server/http/read-json-body";
import { AppError } from "../../server/http/app-error";
import { apiFailure, apiSuccess, apiMutationResult } from "../../server/http/api-response";
import { planningRequestSchema } from "./planning-contract";
import { executePlanning, type PlanningDependencies } from "./planning-service";
import { createPlanningAdmission } from "./planning-admission";
const admit = createPlanningAdmission();

export async function planningResponse(request: Request, deps: { authorization: AuthorizationDependencies; forActor: (userId: string, headers: Headers) => PlanningDependencies }) {
  const noStore = (response: Response) => { response.headers.set("Cache-Control", "private, no-store"); return response; };
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
    const parsed = planningRequestSchema.safeParse(body);
    if (!parsed.success) throw invalid;
    const work = () => executePlanning(parsed.data, key, deps.forActor(actor.userId, request.headers));
    const result = ["ANALYZE", "GENERATE", "START"].includes(parsed.data.action) ? await admit(actor.userId, work) : await work();
    if ("save" in result && result.save && result.save.status !== "SUCCESS") return noStore(apiMutationResult(result.save));
    return noStore(["READ", "ANALYZE"].includes(parsed.data.action) ? apiSuccess(result) : apiMutationResult({ status: "SUCCESS", data: result }));
  } catch (error) {
    if (error instanceof AppError) return noStore(apiFailure(error.code, error.message, error.status));
    // Never serialize provider, database or private request details.
    return noStore(apiFailure("PLANNING_UNAVAILABLE", "Chức năng lập hành trình tạm thời không khả dụng. Hãy giữ nội dung và thử lại.", 503));
  }
}
