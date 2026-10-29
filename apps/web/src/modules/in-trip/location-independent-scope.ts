import { AppError } from "../../server/http/app-error";
import type { EditCandidate } from "../trip-edit/edit-candidate";
import { tripDayDate } from "../trip-validation/trip-proposal-contract";
import { vietnamDateOf } from "../trip-requirement/trip-requirement-readiness";

/** No-location integration is limited to future-day edits. Never substitute an
 * itinerary stop for current position or skip an origin check for today's edit. */
export function assertLocationIndependentScope(original: EditCandidate, candidate: EditCandidate, now: Date) {
  const today = vietnamDateOf(now);
  if (original.startDate !== candidate.startDate || original.durationDays !== candidate.durationDays || original.transport !== candidate.transport
    || candidate.days.some((day, i) => {
      const date = tripDayDate(candidate.startDate, day.dayIndex);
      return !date || date <= today && JSON.stringify(day) !== JSON.stringify(original.days[i]);
    })) throw new AppError("IN_TRIP_LOCATION_REQUIRED", "Thay đổi hôm nay cần vị trí hiện tại hoặc vị trí thủ công trước khi kiểm tra.", 422);
}
