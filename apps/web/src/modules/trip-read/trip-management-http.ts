import { z } from "zod";
import { apiMutationResult } from "@/server/http/api-response";
import { AppError } from "@/server/http/app-error";
import { handleMutationApiError } from "@/server/http/error-handler";
import { requireIdempotencyKey } from "@/server/http/idempotency";
import { deleteMyTrip, setMyTripCompletion } from "./trip-management-service";
import type { TripReadDependencies } from "./trip-read-service";

const completionInput = z.object({ completed: z.boolean() }).strict();

export async function tripManagementResponse(request: Request, id: string, deps: TripReadDependencies, timeReference: Date) {
 let response: Response;
 try {
  const url = new URL(request.url);
  if (request.headers.get("origin") !== url.origin) throw new AppError("INVALID_ORIGIN", "Yêu cầu không hợp lệ.", 403);
  if (!id || id.length > 128 || url.search) throw new AppError("INVALID_TRIP_INPUT", "Yêu cầu không hợp lệ.", 400);
  const key = requireIdempotencyKey(request);
  const body = await request.text();
  if (body.length > 1_024) throw new AppError("TRIP_INPUT_TOO_LARGE", "Yêu cầu quá lớn.", 413);
  if (request.method === "DELETE") {
   if (body.trim()) throw new AppError("INVALID_TRIP_INPUT", "Yêu cầu xóa không nhận body.", 400);
   response = apiMutationResult(await deleteMyTrip(request.headers, id, key, deps));
  } else if (request.method === "PATCH") {
   if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") throw new AppError("INVALID_CONTENT_TYPE", "Yêu cầu phải là JSON.", 415);
   let input: unknown;
   try { input = JSON.parse(body); } catch { throw new AppError("INVALID_TRIP_INPUT", "Dữ liệu không hợp lệ.", 400); }
   const parsed = completionInput.safeParse(input);
   if (!parsed.success) throw new AppError("INVALID_TRIP_INPUT", "Cần lựa chọn hoàn thành hợp lệ.", 400);
   response = apiMutationResult(await setMyTripCompletion(request.headers, id, parsed.data.completed, key, deps, timeReference));
  } else throw new AppError("METHOD_NOT_ALLOWED", "Thao tác không hợp lệ.", 405);
 } catch (error) { response = handleMutationApiError(error); }
 response.headers.set("Cache-Control", "private, no-store");
 return response;
}
