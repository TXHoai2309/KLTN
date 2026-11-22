import { vietnamDateOf } from "../trip-requirement/trip-requirement-readiness";
import { enabledTripsageFeatures } from "../tripsage-chat/tripsage-features";
import { apiSuccess } from "@/server/http/api-response";
import { AppError } from "@/server/http/app-error";
import { handleApiError } from "@/server/http/error-handler";
import { generateTripCalendar } from "./trip-calendar";
import { getMyTrip, listMyTrips, type TripReadDependencies } from "./trip-read-service";

function privateResponse(response: Response) {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function listTripsResponse(request: Request, deps: TripReadDependencies, timeReference: Date) {
  try {
    if (new URL(request.url).search) throw new AppError("INVALID_TRIP_QUERY", "Danh sách chỉ dành cho tài khoản hiện tại.", 400);
    return privateResponse(apiSuccess(await listMyTrips(request.headers, deps, vietnamDateOf(timeReference))));
  } catch (error) {
    return privateResponse(handleApiError(error));
  }
}

export async function tripDetailResponse(request: Request, id: string, deps: TripReadDependencies, timeReference: Date) {
  try {
    if (new URL(request.url).search) throw new AppError("INVALID_TRIP_QUERY", "Yêu cầu không hợp lệ.", 400);
    if (!id || id.length > 128) throw new AppError("TRIP_NOT_FOUND", "Không tìm thấy chuyến đi.", 404);
    return privateResponse(apiSuccess({ trip: await getMyTrip(request.headers, id, deps, vietnamDateOf(timeReference)) }));
  } catch (error) {
    return privateResponse(handleApiError(error));
  }
}

export async function tripCalendarResponse(request: Request, id: string, deps: TripReadDependencies, timeReference: Date, calendarEnabled?: () => Promise<boolean>) {
  try {
    if (!id || id.length > 128 || !(calendarEnabled ? await calendarEnabled() : enabledTripsageFeatures().has("calendar"))) {
      throw new AppError("TRIP_NOT_FOUND", "Không tìm thấy chuyến đi.", 404);
    }
    // getMyTrip authenticates the Traveler and projects the data visible to this particular reader.
    const trip = await getMyTrip(request.headers, id, deps, vietnamDateOf(timeReference), timeReference);
    const { ics, skippedStops } = generateTripCalendar(trip, timeReference);
    const response = ics
      ? new Response(ics, {
        headers: {
          "Content-Type": "text/calendar; charset=utf-8",
          "Content-Disposition": 'attachment; filename="hanh-trinh-' + trip.startDate + '.ics"',
        },
      })
      : handleApiError(new AppError("TRIP_CALENDAR_NO_TIMED_STOPS", "Chuyến đi chưa có điểm dừng đủ giờ để thêm vào lịch.", 422));
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-ICS-Skipped-Stops", String(skippedStops));
    return privateResponse(response);
  } catch (error) {
    return privateResponse(handleApiError(error));
  }
}
