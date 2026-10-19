import type { TripRequirementInput } from "../trip-requirement/trip-requirement-contract";
import { CHECK_KEYS, travelLegSchema, type CheckStatus, type PlannerCheck, type PlannerDay } from "./planner-contract";
import type { PlannerCandidate } from "./planner-candidates";
import { openingFor, PLANNING_WINDOW } from "./planner-engine";

export function validatePlannerDays(requirement: TripRequirementInput, days: readonly PlannerDay[], candidates: readonly PlannerCandidate[]) {
  const checks: PlannerCheck[] = CHECK_KEYS.map(key => ({ key, status: "PASS", issues: [] }));
  const stopStatuses = new Map<string, CheckStatus>();
  const data = new Map(candidates.map(candidate => [candidate.id, candidate]));
  const rank = { PASS: 0, INSUFFICIENT_DATA: 1, VIOLATION: 2 } as const;
  const add = (key: PlannerCheck["key"], status: CheckStatus, code: string, message: string, day: number | null, destinationId: string | null) => {
    const check = checks.find(check => check.key === key)!;
    if (rank[status] > rank[check.status]) check.status = status;
    check.issues.push({ code, message, day, destinationId });
    if (destinationId && rank[status] > rank[stopStatuses.get(destinationId) ?? "PASS"]) stopStatuses.set(destinationId, status);
  };
  let previousId: string | null = null;
  const seen = new Set<string>();
  for (const day of days) {
    if (!day.stops.length) add("SCHEDULE_CONFLICTS", "INSUFFICIENT_DATA", "EMPTY_DAY", "Chưa có đủ điểm đến phù hợp cho ngày này.", day.day, null);
    let departure: number | null = null;
    for (const stop of day.stops) {
      const id = stop.destination.id, candidate = data.get(id);
      stopStatuses.set(id, stopStatuses.get(id) ?? "PASS");
      if (!candidate || candidate.visibility !== "VISIBLE" || seen.has(id)) add("SCHEDULE_CONFLICTS", "VIOLATION", "INELIGIBLE_OR_DUPLICATE", "Điểm đến không hợp lệ hoặc bị lặp.", day.day, id);
      seen.add(id);
      if (!candidate?.minimumDurationMinutes || !Number.isInteger(candidate.minimumDurationMinutes)) add("MINIMUM_DURATION", "INSUFFICIENT_DATA", "MINIMUM_UNKNOWN", "Chưa có thời lượng tham quan tối thiểu đã xác minh.", day.day, id);
      else if (stop.visitDurationMinutes < candidate.minimumDurationMinutes) add("MINIMUM_DURATION", "VIOLATION", "VISIT_TOO_SHORT", "Thời lượng tham quan ngắn hơn mức tối thiểu.", day.day, id);
      const hours = candidate && openingFor(candidate, day.date);
      if (hours?.status === "CLOSED") add("OPENING_HOURS", "VIOLATION", "CLOSED", "Điểm đến đóng cửa vào ngày đã chọn.", day.day, id);
      else if (!day.date || !hours || hours.status !== "OPEN" || !hours.intervals.length || stop.arrivalMinute === null || stop.departureMinute === null)
        add("OPENING_HOURS", "INSUFFICIENT_DATA", "OPENING_UNKNOWN", "Cần ngày cụ thể, giờ tham quan và lịch mở cửa để kiểm tra.", day.day, id);
      else if (!hours.intervals.some(interval => interval.opensAtMinute >= 0 && interval.closesAtMinute <= 1440 && interval.opensAtMinute < interval.closesAtMinute && stop.arrivalMinute! >= interval.opensAtMinute && stop.departureMinute! <= interval.closesAtMinute))
        add("OPENING_HOURS", "VIOLATION", "OUTSIDE_OPENING_HOURS", "Khung tham quan nằm ngoài giờ mở cửa.", day.day, id);
      if (previousId) {
        if (!stop.inbound || !travelLegSchema.safeParse(stop.inbound).success || stop.inbound.status !== "VERIFIED" || stop.inbound.fromDestinationId !== previousId || stop.inbound.toDestinationId !== id)
          add("TRAVEL_TIME", "INSUFFICIENT_DATA", "ROUTE_UNKNOWN", "Chưa có thời gian di chuyển đã xác minh giữa hai điểm dừng.", day.day, id);
        else if (stop.arrivalMinute !== null && stop.arrivalMinute < (departure ?? PLANNING_WINDOW.startMinute) + Math.ceil(stop.inbound.durationSeconds! / 60))
          add("TRAVEL_TIME", "VIOLATION", "TRANSFER_TOO_SHORT", "Khoảng thời gian giữa hai điểm dừng không đủ để di chuyển.", day.day, id);
      }
      if (stop.scheduleState === "UNSCHEDULED") add("SCHEDULE_CONFLICTS", "VIOLATION", "NO_TIME_SLOT", "Không thể bố trí điểm dừng trong khung ngày đề xuất.", day.day, id);
      else if (stop.arrivalMinute === null || stop.departureMinute === null) add("SCHEDULE_CONFLICTS", "INSUFFICIENT_DATA", "TIME_UNKNOWN", "Chưa thể xác định giờ đến/rời vì thiếu dữ liệu di chuyển.", day.day, id);
      else if (stop.arrivalMinute < PLANNING_WINDOW.startMinute || stop.departureMinute > PLANNING_WINDOW.endMinute || stop.departureMinute - stop.arrivalMinute !== stop.visitDurationMinutes || (departure !== null && stop.arrivalMinute < departure))
        add("SCHEDULE_CONFLICTS", "VIOLATION", "SCHEDULE_CONFLICT", "Các khung tham quan chồng lấn hoặc vượt khung ngày đề xuất.", day.day, id);
      departure = stop.departureMinute;
      previousId = id;
    }
  }
  if (!seen.size) for (const key of CHECK_KEYS.filter(key => key !== "MOBILITY")) add(key, "INSUFFICIENT_DATA", "NO_STOPS", "Chưa có điểm dừng để kiểm tra.", null, null);
  if (requirement.mobilityConstraints) add("MOBILITY", "INSUFFICIENT_DATA", "ACCESSIBILITY_UNKNOWN", "Nhu cầu di chuyển đã được ghi nhận; dữ liệu điểm đến chưa đủ để xác minh khả năng tiếp cận và mức vận động phù hợp.", null, null);
  return { checks, stopStatuses };
}
