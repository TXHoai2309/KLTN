import { apiMutationResult } from "@/server/http/api-response";
import { AppError } from "@/server/http/app-error";
import { handleMutationApiError } from "@/server/http/error-handler";
import { requireIdempotencyKey } from "@/server/http/idempotency";
import { pinRequestSchema } from "../trip-save/trip-pin-contract";
import { pinItemsToMyTrip } from "./trip-management-service";
import type { TripReadDependencies } from "./trip-read-service";

/** POST /api/trips/[id]/pins: thin parse and auth boundary; rules and ownership live in the service (ADR-47). */
export async function tripPinResponse(request: Request, id: string, deps: TripReadDependencies) {
 let response: Response;
 try {
  const url = new URL(request.url);
  if (request.headers.get("origin") !== url.origin) throw new AppError("INVALID_ORIGIN", "Yêu cầu không hợp lệ.", 403);
  if (!id || id.length > 128 || url.search) throw new AppError("INVALID_TRIP_INPUT", "Yêu cầu không hợp lệ.", 400);
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") throw new AppError("INVALID_CONTENT_TYPE", "Yêu cầu phải là JSON.", 415);
  const key = requireIdempotencyKey(request);
  const body = await request.text();
  if (body.length > 64 * 1024) throw new AppError("TRIP_INPUT_TOO_LARGE", "Yêu cầu quá lớn.", 413);
  let input: unknown;
  try { input = JSON.parse(body); } catch { throw new AppError("INVALID_TRIP_INPUT", "Dữ liệu không hợp lệ.", 400); }
  const parsed = pinRequestSchema.safeParse(input);
  if (!parsed.success || parsed.data.items.length === 0) throw new AppError("INVALID_TRIP_INPUT", "Không có mục hợp lệ để ghim.", 400);
  response = apiMutationResult(await pinItemsToMyTrip(request.headers, id, parsed.data.items, key, deps));
 } catch (error) { response = handleMutationApiError(error); }
 response.headers.set("Cache-Control", "private, no-store");
 return response;
}
