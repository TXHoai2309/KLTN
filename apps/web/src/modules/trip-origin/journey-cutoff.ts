import { AppError } from "@/server/http/app-error";
import { savedJourneySchema } from "./journey-saved-contract";

export function assertJourneyBeforeDeparture(trip: { startDate: Date; manuallyCompletedAt: Date | null; journeySnapshot: unknown }, now: Date): void {
  const saved = trip.journeySnapshot == null ? null : savedJourneySchema.safeParse(trip.journeySnapshot);
  if (saved && !saved.success) throw new AppError("TRIP_JOURNEY_DATA_UNAVAILABLE", "Chưa thể kiểm tra thông tin khởi hành.", 503);
  const minute = saved?.success ? saved.data.journey.departureMinute ?? 0 : 0;
  const cutoff = new Date(`${trip.startDate.toISOString().slice(0, 10)}T00:00:00+07:00`).getTime() + minute * 60_000;
  if (!Number.isFinite(cutoff) || !Number.isFinite(now.getTime())) throw new AppError("TRIP_JOURNEY_DATA_UNAVAILABLE", "Chưa thể kiểm tra thời điểm khởi hành.", 503);
  if (trip.manuallyCompletedAt || now.getTime() >= cutoff) throw new AppError("JOURNEY_CHANGE_CLOSED", "Chỉ được đổi nơi và giờ đi/về trước khi khởi hành và khi chưa đánh dấu hoàn tất.", 409);
}
