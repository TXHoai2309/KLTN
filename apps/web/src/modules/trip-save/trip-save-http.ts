import { apiMutationResult } from "../../server/http/api-response";
import { AppError } from "../../server/http/app-error";
import { handleMutationApiError } from "../../server/http/error-handler";
import { requireIdempotencyKey } from "../../server/http/idempotency";
import { tripSaveRequestSchema } from "./trip-save-contract";
import { saveTrip, type TripSaveDependencies } from "./trip-save-service";

export async function saveTripResponse(request: Request, dependencies: TripSaveDependencies) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin) throw new AppError("INVALID_ORIGIN", "Yêu cầu không hợp lệ.", 403);
    if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") throw new AppError("INVALID_CONTENT_TYPE", "Yêu cầu phải là JSON.", 415);
    const key = requireIdempotencyKey(request);
    const body = await request.text();
    if (body.length > 64_000) throw new AppError("TRIP_INPUT_TOO_LARGE", "Hành trình quá lớn.", 413);
    let payload: unknown;
    try { payload = JSON.parse(body); } catch { throw new AppError("INVALID_TRIP_INPUT", "Dữ liệu hành trình không hợp lệ.", 400); }
    const parsed = tripSaveRequestSchema.safeParse(payload);
    if (!parsed.success) throw new AppError("INVALID_TRIP_INPUT", "Dữ liệu hành trình không hợp lệ.", 400, parsed.error.flatten());
    const response = apiMutationResult(await saveTrip(request.headers, parsed.data, key, dependencies, new Date()));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    const response = handleMutationApiError(error);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}
