import { fromMinute } from "../destination/destination-contract";
import type { TripJourney } from "../trip-origin/trip-origin-contract";
import { MORNING_DEPARTURE_MINUTE } from "../trip-planner/planner-engine";
import type { EditCandidate } from "./edit-candidate";
import type { PreviewLegMetric } from "./trip-edit-service";

export type PreviewJourneySummary = {
  outboundDurationSeconds: number | null;
  outboundDistanceMeters: number | null;
  outboundRestMinutes: number;
  estimatedArrivalAtFirstMinute: number | null;
  firstVisitStartMinute: number | null;
  returnDurationSeconds: number | null;
  returnDistanceMeters: number | null;
  returnRestMinutes: number;
  estimatedReturnArrivalMinute: number | null;
  returnDeadlineMinute: number | null;
};

export function createEmptyJourney(): TripJourney {
  return {
    origin: null,
    departureMinute: 480,
    returnDeadlineMinute: 1200,
    returnDepartureMinute: null,
  };
}

export function minuteClockLabel(minute: number | null | undefined): string {
  if (minute == null || !Number.isFinite(minute)) return "--:--";
  const bounded = Math.max(0, Math.min(1439, Math.round(minute)));
  return fromMinute(bounded);
}

/**
 * Explicitly recalculates visit start clocks across the itinerary from confirmed
 * Trip origin arrival timing while keeping visit membership, day assignment, and order fixed.
 */
export function rescheduleDraftFromOrigin(
  candidate: EditCandidate,
  summary: PreviewJourneySummary | null | undefined,
  legs: readonly PreviewLegMetric[] = [],
): { candidate: EditCandidate; overflowMessage: string | null } {
  if (!candidate.journey?.origin?.confirmed || summary?.estimatedArrivalAtFirstMinute == null) {
    return {
      candidate,
      overflowMessage: "Cần xác nhận nơi xuất phát và kiểm tra tuyến chặng đầu trước khi tự xếp lại giờ.",
    };
  }
  if (summary.estimatedArrivalAtFirstMinute >= 1440) {
    return {
      candidate,
      overflowMessage: "Giờ đến điểm đầu từ nơi xuất phát đã vượt quá 23:59; hãy điều chỉnh giờ khởi hành.",
    };
  }

  const legByPair = new Map<string, PreviewLegMetric>();
  for (const leg of legs) {
    legByPair.set(`${leg.fromVisitId}->${leg.toVisitId}`, leg);
  }

  let appliedOutbound = false;
  let overflowDayIndex: number | null = null;

  const days = candidate.days.map((day) => {
    if (day.visits.length === 0) return day;

    const updated = day.visits.map((v) => ({ ...v }));
    for (let i = 0; i < updated.length; i++) {
      const visit = updated[i]!;
      let targetStart: number;
      if (!appliedOutbound) {
        targetStart = summary.estimatedArrivalAtFirstMinute!;
        appliedOutbound = true;
      } else if (i === 0) {
        targetStart = MORNING_DEPARTURE_MINUTE;
      } else {
        const prev = updated[i - 1]!;
        const leg = legByPair.get(`${prev.visitId}->${visit.visitId}`);
        const travelMinutes =
          leg?.status === "VERIFIED" && leg.durationSeconds !== null
            ? Math.ceil(leg.durationSeconds / 60)
            : 15;
        targetStart = prev.startMinute + prev.plannedDurationMinutes + Math.max(15, travelMinutes);
      }

      if (targetStart > 1439 || targetStart + visit.plannedDurationMinutes > 1440) {
        overflowDayIndex ??= day.dayIndex;
        visit.startMinute = Math.min(1439, Math.max(0, 1440 - visit.plannedDurationMinutes));
      } else {
        visit.startMinute = targetStart;
      }
    }
    return { ...day, visits: updated };
  });

  return {
    candidate: { ...candidate, days },
    overflowMessage:
      overflowDayIndex !== null
        ? `Một số điểm ở Ngày ${overflowDayIndex} chạm mốc 23:59 khi tự xếp giờ; hãy kiểm tra hoặc bớt điểm.`
        : null,
  };
}
