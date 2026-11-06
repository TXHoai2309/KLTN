import { requireTraveler } from "@/server/auth/require-traveler";
import type { AuthorizationDependencies } from "@/server/authorization/guard";
import { apiSuccess, apiFailure } from "@/server/http/api-response";
import { AppError } from "@/server/http/app-error";
import { readBoundedJsonBody } from "@/server/http/read-json-body";
import { ORIGIN_SEARCH_REVISION, OSM_ATTRIBUTION, originSearchRequestSchema, type OriginSearchOutcome } from "./origin-search-contract";

export async function originSearchResponse(request: Request, deps: { authorization: AuthorizationDependencies; search: (input: unknown, signal?: AbortSignal) => Promise<OriginSearchOutcome> }): Promise<Response> {
  const privateResponse = (response: Response) => { response.headers.set("Cache-Control", "private, no-store"); return response; };
  try {
    await requireTraveler(request.headers, deps.authorization);
    const site = request.headers.get("sec-fetch-site");
    if (request.headers.get("origin") !== new URL(request.url).origin || (site && !["same-origin", "same-site"].includes(site))) throw new AppError("FORBIDDEN_ORIGIN", "Yêu cầu phải được gửi từ cùng ứng dụng.", 403);
    if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") throw new AppError("INVALID_CONTENT_TYPE", "Yêu cầu phải là JSON.", 415);
    const invalid = new AppError("INVALID_ORIGIN_QUERY", "Chỉ nhập tên địa điểm công khai; không gửi thông tin cá nhân hoặc ghi chú riêng.", 400);
    const body = await readBoundedJsonBody(request, { maxBytes: 2048, tooLargeError: new AppError("ORIGIN_INPUT_TOO_LARGE", "Nội dung tìm kiếm quá lớn.", 413), emptyError: invalid, invalidJsonError: invalid });
    const parsed = originSearchRequestSchema.safeParse(body);
    if (!parsed.success) throw invalid;
    const result = await deps.search(parsed.data, request.signal);
    if (result.status === "BUSY") {
      const response = privateResponse(apiFailure("ORIGIN_SEARCH_BUSY", "Dịch vụ tìm nơi xuất phát đang bận. Bạn có thể chọn ghim thủ công hoặc thử lại.", 429, { retryAfterSeconds: result.retryAfterSeconds }));
      response.headers.set("Retry-After", String(result.retryAfterSeconds));
      return response;
    }
    if (result.status === "UNAVAILABLE") throw new AppError("ORIGIN_SEARCH_UNAVAILABLE", "Chưa thể tìm nơi xuất phát. Bạn vẫn có thể chọn ghim hoặc nhập tọa độ.", 503);
    return privateResponse(apiSuccess({ revision: ORIGIN_SEARCH_REVISION, ...result, attribution: OSM_ATTRIBUTION }));
  } catch (error) {
    if (error instanceof AppError) return privateResponse(apiFailure(error.code, error.message, error.status, error.details));
    // Never forward or log raw provider/DB exceptions or private query input.
    return privateResponse(apiFailure("ORIGIN_SEARCH_UNAVAILABLE", "Chưa thể tìm nơi xuất phát. Bạn vẫn có thể chọn thủ công.", 503));
  }
}
