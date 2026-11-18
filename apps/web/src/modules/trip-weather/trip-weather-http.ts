import type { AuthorizationDependencies } from "@/server/authorization/guard";
import { requireTraveler } from "@/server/auth/require-traveler";
import { readBoundedJsonBody } from "@/server/http/read-json-body";
import { AppError } from "@/server/http/app-error";
import { apiFailure, apiSuccess } from "@/server/http/api-response";
import { getTripWeather, tripWeatherRequestSchema, type TripWeatherDependencies } from "./trip-weather-service";

export type TripWeatherHttpDependencies = TripWeatherDependencies & { authorization: AuthorizationDependencies };

/**
 * Read-only weather for an itinerary the signed-in traveler already holds (proposal or own saved trip).
 * The response only carries public weather and public destination flags, so no Trip ownership lookup is needed.
 */
export async function tripWeatherResponse(request: Request, deps: TripWeatherHttpDependencies) {
  const privateResponse = (response: Response) => { response.headers.set("Cache-Control", "private, no-store"); return response; };
  try {
    await requireTraveler(request.headers, deps.authorization);
    if (request.headers.get("origin") !== new URL(request.url).origin) throw new AppError("FORBIDDEN_ORIGIN", "Yêu cầu phải được gửi từ cùng ứng dụng.", 403);
    if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") throw new AppError("VALIDATION_ERROR", "Yêu cầu phải là JSON.", 400);
    const bad = new AppError("VALIDATION_ERROR", "Lịch trình gửi lên không hợp lệ.", 400);
    const parsed = tripWeatherRequestSchema.safeParse(await readBoundedJsonBody(request, { maxBytes: 256 * 1024, tooLargeError: bad, emptyError: bad, invalidJsonError: bad }));
    if (!parsed.success) throw bad;
    return privateResponse(apiSuccess(await getTripWeather(parsed.data, deps)));
  } catch (error) {
    if (error instanceof AppError) return privateResponse(apiFailure(error.code, error.message, error.status, error.details));
    return privateResponse(apiFailure("WEATHER_UNAVAILABLE", "Không lấy được thời tiết lúc này.", 503));
  }
}
