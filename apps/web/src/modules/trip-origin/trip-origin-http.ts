import { z } from "zod";
import { requireTraveler } from "@/server/auth/require-traveler";
import type { AuthorizationDependencies } from "@/server/authorization/guard";
import { apiSuccess } from "@/server/http/api-response";
import { handleApiError } from "@/server/http/error-handler";
import { AppError } from "@/server/http/app-error";
import { readBoundedJsonBody } from "@/server/http/read-json-body";
import { ORIGIN_CONTRACT_REVISION, originSelectionSchema } from "./trip-origin-contract";
import { assertJourneyCoverage } from "./trip-origin-service";
import { VIETNAM_COVERAGE } from "./vietnam-coverage";

const inputSchema = z.object({ origin: originSelectionSchema }).strict();
export async function validateOriginResponse(request: Request, authorization: AuthorizationDependencies): Promise<Response> {
  const privateResponse = (response: Response) => { response.headers.set("Cache-Control", "private, no-store"); return response; };
  try {
    await requireTraveler(request.headers, authorization);
    const site = request.headers.get("sec-fetch-site");
    if (request.headers.get("origin") !== new URL(request.url).origin || (site && !["same-origin", "same-site"].includes(site))) throw new AppError("FORBIDDEN_ORIGIN", "Yêu cầu phải được gửi từ cùng ứng dụng.", 403);
    if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") throw new AppError("INVALID_CONTENT_TYPE", "Yêu cầu phải là JSON.", 415);
    const badBody = new AppError("INVALID_ORIGIN_INPUT", "Dữ liệu nơi xuất phát không hợp lệ.", 400);
    const raw = await readBoundedJsonBody(request, { maxBytes: 4096, tooLargeError: new AppError("ORIGIN_INPUT_TOO_LARGE", "Nội dung yêu cầu quá lớn.", 413), emptyError: badBody, invalidJsonError: badBody });
    const parsed = inputSchema.safeParse(raw);
    if (!parsed.success) throw badBody;
    assertJourneyCoverage({ origin: parsed.data.origin, departureMinute: null, returnDeadlineMinute: null, returnDepartureMinute: null });
    return privateResponse(apiSuccess({ revision: ORIGIN_CONTRACT_REVISION, origin: parsed.data.origin, coverage: { status: "SUPPORTED", ...VIETNAM_COVERAGE } }));
  } catch (error) { return privateResponse(handleApiError(error)); }
}
