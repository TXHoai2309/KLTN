import { toMinute } from "../destination/destination-contract";
import { checkOpeningHours } from "../trip-validation/visit-constraints";
import { tripDayDate } from "../trip-validation/trip-proposal-contract";
import type { TripValidation, ValidationFinding } from "../trip-validation/trip-validation";
import type { EditCatalogDestinationMeta } from "./add-visit-helper";
import type { EditCandidate } from "./edit-candidate";
import type { EditPlaceDetail, PreviewLegMetric } from "./trip-edit-service";

export type InstantVisitWarning = {
  code:
    | "VISIT_EXCEEDS_DAY"
    | "DESTINATION_UNAVAILABLE"
    | "BELOW_MINIMUM_DURATION"
    | "SCHEDULE_OVERLAP"
    | "OPENING_HOURS";
  message: string;
};

export type UnavailableVisitEntry = {
  visitId: string;
  dayIndex: number;
  destinationId: string;
  name: string;
};

export type InstantClientChecksResult = {
  byVisitId: Record<string, InstantVisitWarning[]>;
  unavailableVisits: UnavailableVisitEntry[];
  hasAnyInstantViolation: boolean;
};

export function runInstantClientChecks(
  candidate: EditCandidate,
  placeDetails: Record<string, EditPlaceDetail>,
  catalogMeta: Record<string, EditCatalogDestinationMeta> = {},
): InstantClientChecksResult {
  const byVisitId: Record<string, InstantVisitWarning[]> = {};
  const unavailableVisits: UnavailableVisitEntry[] = [];
  let hasAnyInstantViolation = false;

  const pushWarning = (visitId: string, warning: InstantVisitWarning) => {
    hasAnyInstantViolation = true;
    (byVisitId[visitId] ??= []).push(warning);
  };

  for (const day of candidate.days) {
    const localDate = tripDayDate(candidate.startDate, day.dayIndex);
    for (let i = 0; i < day.visits.length; i++) {
      const visit = day.visits[i]!;
      const place = placeDetails[visit.destinationId];
      const meta = catalogMeta[visit.destinationId];
      const label = place?.name ?? "Điểm đến";
      const endMinute = visit.startMinute + visit.plannedDurationMinutes;

      if (endMinute > 1440) {
        pushWarning(visit.visitId, {
          code: "VISIT_EXCEEDS_DAY",
          message: "Giờ kết thúc vượt quá 23:59 trong ngày.",
        });
      }

      if (place?.availability === "UNAVAILABLE" && !place.external) {
        unavailableVisits.push({
          visitId: visit.visitId,
          dayIndex: day.dayIndex,
          destinationId: visit.destinationId,
          name: label,
        });
        pushWarning(visit.visitId, {
          code: "DESTINATION_UNAVAILABLE",
          message: "Điểm đến đã bị ẩn bởi quản trị viên — hãy xóa hoặc thay thế.",
        });
      }

      const minimumDuration = place?.minimumDurationMinutes ?? meta?.minimumDurationMinutes ?? null;
      if (minimumDuration !== null && visit.plannedDurationMinutes < minimumDuration) {
        pushWarning(visit.visitId, {
          code: "BELOW_MINIMUM_DURATION",
          message: `Thời lượng ngắn hơn mức tối thiểu (${minimumDuration} phút).`,
        });
      }

      if (localDate && meta?.openingDays?.length && endMinute <= 1440) {
        const openingResult = checkOpeningHours(
          {
            visitId: visit.visitId,
            localDate,
            startMinute: visit.startMinute,
            endMinute,
          },
          meta.openingDays.map((item) => ({
            dayOfWeek: item.dayOfWeek,
            status: item.status,
            intervals: item.intervals.map((interval) => ({
              opensAtMinute: toMinute(interval.opensAt),
              closesAtMinute: toMinute(interval.closesAt),
            })),
          })),
        );
        if (openingResult.status === "VIOLATION") {
          pushWarning(visit.visitId, {
            code: "OPENING_HOURS",
            message:
              openingResult.reason === "CLOSED_ALL_DAY"
                ? "Điểm đến đóng cửa vào ngày này."
                : "Giờ tham quan nằm ngoài giờ mở cửa dự kiến.",
          });
        }
      }

      if (i > 0) {
        const prev = day.visits[i - 1]!;
        const prevLabel = placeDetails[prev.destinationId]?.name ?? "điểm trước";
        const prevEnd = prev.startMinute + prev.plannedDurationMinutes;
        if (prevEnd > visit.startMinute) {
          pushWarning(visit.visitId, {
            code: "SCHEDULE_OVERLAP",
            message: `Chồng giờ hoặc ngược thứ tự với "${prevLabel}".`,
          });
        }
      }
    }
  }

  return { byVisitId, unavailableVisits, hasAnyInstantViolation };
}

export type AutoShiftResult = {
  candidate: EditCandidate;
  shiftedVisitIds: string[];
  overflowDayIndex: number | null;
  overflowMessage: string | null;
};

const DEFAULT_GAP_MINUTES = 15;
const MAX_START_MINUTE = 1439;
const END_OF_DAY_MINUTE = 1440;

/**
 * Chain-shifts visits sequentially forward within a single day after `startFromIndex`
 * without ever spilling any visit into another day.
 */
export function autoShiftDayVisits(input: {
  candidate: EditCandidate;
  dayIndex: number;
  startFromIndex: number;
  legMetrics?: readonly PreviewLegMetric[];
  defaultBufferMinutes?: number;
  lockedVisitIds?: ReadonlySet<string>;
}): AutoShiftResult {
  const defaultBuffer = input.defaultBufferMinutes ?? DEFAULT_GAP_MINUTES;
  const legByPair = new Map<string, PreviewLegMetric>();
  for (const leg of input.legMetrics ?? []) {
    legByPair.set(`${leg.fromVisitId}->${leg.toVisitId}`, leg);
  }

  const shiftedVisitIds: string[] = [];
  let overflowDayIndex: number | null = null;
  let overflowMessage: string | null = null;

  const days = input.candidate.days.map((day) => {
    if (day.dayIndex !== input.dayIndex || day.visits.length <= 1) {
      return day;
    }

    const updatedVisits = day.visits.map((v) => ({ ...v }));
    const anchorIdx = Math.max(0, Math.min(input.startFromIndex, updatedVisits.length - 1));

    for (let i = anchorIdx + 1; i < updatedVisits.length; i++) {
      const prev = updatedVisits[i - 1]!;
      const curr = updatedVisits[i]!;
      if (input.lockedVisitIds?.has(curr.visitId)) {
        continue;
      }
      const leg = legByPair.get(`${prev.visitId}->${curr.visitId}`);
      const legMinutes =
        leg?.status === "VERIFIED" && leg.durationSeconds !== null
          ? Math.ceil(leg.durationSeconds / 60)
          : defaultBuffer;
      const requiredGap = Math.max(defaultBuffer, legMinutes);
      const minNextStart = prev.startMinute + prev.plannedDurationMinutes + requiredGap;

      if (curr.startMinute < minNextStart) {
        if (minNextStart > MAX_START_MINUTE || minNextStart + curr.plannedDurationMinutes > END_OF_DAY_MINUTE) {
          overflowDayIndex = day.dayIndex;
          overflowMessage =
            `Không thể dời giờ các điểm cuối Ngày ${day.dayIndex} vì sẽ vượt quá 23:59 trong ngày.`;
          if (minNextStart <= MAX_START_MINUTE) {
            curr.startMinute = minNextStart;
            shiftedVisitIds.push(curr.visitId);
          }
          break;
        }
        curr.startMinute = minNextStart;
        shiftedVisitIds.push(curr.visitId);
      }
    }

    return { ...day, visits: updatedVisits };
  });

  return {
    candidate: { ...input.candidate, days },
    shiftedVisitIds,
    overflowDayIndex,
    overflowMessage,
  };
}

export type ValidationJumpItem = {
  id: string;
  targetDomId: string;
  status: "VIOLATION" | "INSUFFICIENT_DATA";
  group: ValidationFinding["group"];
  label: string;
  message: string;
};

export type MappedWorkspaceValidation = {
  byVisitId: Record<string, ValidationFinding[]>;
  byLegKey: Record<string, ValidationFinding[]>;
  jumpItems: ValidationJumpItem[];
};

export function mapValidationToWorkspace(
  validation: TripValidation | null,
  candidate: EditCandidate,
  placeDetails: Record<string, EditPlaceDetail>,
): MappedWorkspaceValidation {
  const byVisitId: Record<string, ValidationFinding[]> = {};
  const byLegKey: Record<string, ValidationFinding[]> = {};
  const jumpItems: ValidationJumpItem[] = [];
  if (!validation) return { byVisitId, byLegKey, jumpItems };

  const visitDayMap = new Map<string, { dayIndex: number; name: string }>();
  for (const day of candidate.days) {
    for (const visit of day.visits) {
      visitDayMap.set(visit.visitId, {
        dayIndex: day.dayIndex,
        name: placeDetails[visit.destinationId]?.name ?? "Điểm đến",
      });
    }
  }

  const allFindings = [
    ...validation.groups.openingHours.findings,
    ...validation.groups.minimumDuration.findings,
    ...validation.groups.travelTime.findings,
    ...validation.groups.scheduleConflict.findings,
  ];

  allFindings.forEach((finding, idx) => {
    if (finding.affectedVisitId) {
      (byVisitId[finding.affectedVisitId] ??= []).push(finding);
      const info = visitDayMap.get(finding.affectedVisitId);
      jumpItems.push({
        id: `jump-${idx}-${finding.affectedVisitId}`,
        targetDomId: `visit-card-${finding.affectedVisitId}`,
        status: finding.status,
        group: finding.group,
        label: info ? `Ngày ${info.dayIndex} · ${info.name}` : "Điểm dừng",
        message: finding.message,
      });
    }
    if (finding.visitIds) {
      for (const vid of finding.visitIds) {
        (byVisitId[vid] ??= []).push(finding);
      }
      const primaryId = finding.visitIds[0];
      const info = visitDayMap.get(primaryId);
      jumpItems.push({
        id: `jump-${idx}-${primaryId}`,
        targetDomId: `visit-card-${primaryId}`,
        status: finding.status,
        group: finding.group,
        label: info ? `Ngày ${info.dayIndex} · ${info.name}` : "Trùng lịch",
        message: finding.message,
      });
    }
    if (finding.fromVisitId && finding.toVisitId) {
      const legKey = `${finding.fromVisitId}->${finding.toVisitId}`;
      (byLegKey[legKey] ??= []).push(finding);
      const fromInfo = visitDayMap.get(finding.fromVisitId);
      const toInfo = visitDayMap.get(finding.toVisitId);
      jumpItems.push({
        id: `jump-${idx}-${legKey}`,
        targetDomId: `leg-${finding.fromVisitId}-${finding.toVisitId}`,
        status: finding.status,
        group: finding.group,
        label:
          fromInfo && toInfo
            ? `Ngày ${fromInfo.dayIndex} · ${fromInfo.name} → ${toInfo.name}`
            : "Chặng di chuyển",
        message: finding.message,
      });
    }
  });

  return { byVisitId, byLegKey, jumpItems };
}

export function formatLegMetricLabel(leg: PreviewLegMetric | undefined): string {
  if (!leg) return "Đang chờ tính lộ trình…";
  if (leg.status !== "VERIFIED" || leg.durationSeconds === null) {
    return "Chưa đủ dữ liệu thời gian di chuyển";
  }
  const mins = Math.max(1, Math.round(leg.durationSeconds / 60));
  if (leg.distanceMeters === null) {
    return `Di chuyển khoảng ${mins} phút`;
  }
  const km = (leg.distanceMeters / 1000).toFixed(1).replace(".", ",");
  return `Di chuyển ${mins} phút (${km} km)`;
}
