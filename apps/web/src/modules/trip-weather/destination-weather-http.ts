import type { Database } from "@KLTN/db";
import { apiSuccess } from "@/server/http/api-response";
import { AppError } from "@/server/http/app-error";
import { handleApiError } from "@/server/http/error-handler";
import { todayInVietnam } from "./sun-times";
import { getDestinationWeather } from "./destination-weather-service";

export async function destinationWeatherResponse(request: Request, id: string, database: Pick<Database, "destination">) {
  let response: Response;
  try {
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(key => key !== "date") || params.getAll("date").length > 1) throw new AppError("INVALID_DESTINATION_QUERY", "Tham số không hợp lệ.", 400);
    response = apiSuccess(await getDestinationWeather(id, params.get("date") ?? todayInVietnam(), database));
  } catch (error) { response = handleApiError(error); }
  // Visibility can change at any time, so the response is never cached by the browser.
  response.headers.set("Cache-Control", "no-store");
  return response;
}
