import type { AuthorizationDependencies } from "@/server/authorization/guard";
import { requireTraveler } from "@/server/auth/require-traveler";
import { readBoundedJsonBody } from "@/server/http/read-json-body";
import { AppError } from "@/server/http/app-error";
import { apiFailure, apiSuccess } from "@/server/http/api-response";
import type { PlannerResult } from "./planner-contract";

export type PlannerHttpDependencies = { authorization: AuthorizationDependencies; propose: (userId: string, key: string, requirement: unknown) => Promise<PlannerResult> };
export async function plannerResponse(request: Request, deps: PlannerHttpDependencies) {
  const privateResponse = (response: Response) => { response.headers.set("Cache-Control", "private, no-store"); return response; };
  try {
    const actor = await requireTraveler(request.headers, deps.authorization);
    const site = request.headers.get("sec-fetch-site");
    if (request.headers.get("origin") !== new URL(request.url).origin || (site && !["same-origin", "same-site"].includes(site))) throw new AppError("FORBIDDEN_ORIGIN", "Yêu cầu phải được gửi từ cùng ứng dụng.", 403);
    if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") throw new AppError("VALIDATION_ERROR", "Yêu cầu phải là JSON.", 400);
    const key = request.headers.get("Idempotency-Key") ?? "";
    if (!/^[a-zA-Z0-9_-]{8,128}$/.test(key)) throw new AppError("INVALID_IDEMPOTENCY_KEY", "Thiếu mã yêu cầu hợp lệ.", 400);
    const badBody = new AppError("VALIDATION_ERROR", "Nội dung yêu cầu lập lịch trình chưa hợp lệ.", 400);
    const body = await readBoundedJsonBody(request, { maxBytes: 8192, tooLargeError: badBody, emptyError: badBody, invalidJsonError: badBody });
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || !Object.hasOwn(body, "requirement")) throw badBody;
    return privateResponse(apiSuccess(await deps.propose(actor.userId, key, (body as { requirement: unknown }).requirement)));
  } catch (error) {
    if (error instanceof AppError) return privateResponse(apiFailure(error.code, error.message, error.status, error.details));
    // Never log provider/DB exceptions, connection strings or private requirement notes.
    return privateResponse(apiFailure("PLANNER_UNAVAILABLE", "Dịch vụ lập lịch trình tạm thời không khả dụng.", 503));
  }
}
