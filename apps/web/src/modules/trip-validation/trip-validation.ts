import { checkTravelTime } from "./travel-time";
import { checkMinimumVisitDuration, checkOpeningHours, type VisitCheckStatus } from "./visit-constraints";

export type ValidationVisit = {
  visitId: string;
  dayIndex: number;
  order: number;
  localDate: string | null;
  startMinute: number;
  plannedDurationMinutes: number;
  minimumDurationMinutes: number | null;
  openingDays: Parameters<typeof checkOpeningHours>[1];
};
export type RouteSnapshot = {
  fromVisitId: string;
  toVisitId: string;
  route: Parameters<typeof checkTravelTime>[1];
};
export type ValidationGroupName = "openingHours" | "minimumDuration" | "travelTime" | "scheduleConflict";
export type ValidationGroupStatus = "SATISFIED" | "VIOLATION" | "INSUFFICIENT_DATA";
export type ValidationFinding = {
  group: ValidationGroupName;
  status: "VIOLATION" | "INSUFFICIENT_DATA";
  reasonCode: string;
  message: string;
  affectedVisitId?: string;
  fromVisitId?: string;
  toVisitId?: string;
  visitIds?: [string, string];
};
export type TripValidation = {
  timeReference: string;
  groups: Record<ValidationGroupName, { status: ValidationGroupStatus; findings: ValidationFinding[] }>;
  canConfirm: boolean;
};

const groupNames = ["openingHours", "minimumDuration", "travelTime", "scheduleConflict"] as const;
const messages: Record<string, string> = {
  START_DATE_MISSING: "Cần ngày bắt đầu để kiểm tra giờ hoạt động.",
  OUTSIDE_OPENING_HOURS: "Lượt tham quan nằm ngoài giờ hoạt động.",
  CLOSED_ALL_DAY: "Điểm đến đóng cửa trong ngày này.",
  OPENING_HOURS_MISSING: "Thiếu thông tin giờ hoạt động.",
  VISIT_TIME_INVALID: "Thời gian tham quan chưa hợp lệ.",
  BELOW_MINIMUM_DURATION: "Thời lượng dự kiến ngắn hơn mức tối thiểu.",
  MINIMUM_DURATION_MISSING: "Thiếu thời lượng tham quan tối thiểu.",
  VISIT_DURATION_INVALID: "Thời lượng tham quan chưa hợp lệ.",
  TRAVEL_TIME_SHORT: "Không đủ thời gian di chuyển giữa hai lượt.",
  ROUTE_UNAVAILABLE: "Thiếu thời gian di chuyển cho chặng này.",
  VISITS_OVERLAP: "Hai lượt tham quan bị trùng thời gian.",
};

export function aggregateStatus(statuses: readonly VisitCheckStatus[]): ValidationGroupStatus {
  if (statuses.includes("VIOLATION")) return "VIOLATION";
  if (statuses.includes("INSUFFICIENT_DATA")) return "INSUFFICIENT_DATA";
  return "SATISFIED";
}

/** Caller validates proposal structure and supplies one accepted route snapshot per adjacent leg. */
export function validateItinerary(visits: readonly ValidationVisit[], routes: readonly RouteSnapshot[], timeReference: Date): TripValidation {
  if (Number.isNaN(timeReference.getTime())) throw new RangeError("timeReference must be valid");
  const ordered = [...visits].sort((a, b) => a.dayIndex - b.dayIndex || a.order - b.order || a.visitId.localeCompare(b.visitId));
  const findings: Record<ValidationGroupName, ValidationFinding[]> = {
    openingHours: [], minimumDuration: [], travelTime: [], scheduleConflict: [],
  };
  const add = (group: ValidationGroupName, status: VisitCheckStatus, reasonCode: string, affected: Pick<ValidationFinding, "affectedVisitId" | "fromVisitId" | "toVisitId" | "visitIds">) => {
    if (status !== "PASS") findings[group].push({ group, status, reasonCode, message: messages[reasonCode] ?? "Không thể kiểm tra lượt tham quan.", ...affected });
  };

  for (const current of ordered) {
    if (current.localDate === null) {
      add("openingHours", "INSUFFICIENT_DATA", "START_DATE_MISSING", { affectedVisitId: current.visitId });
    } else {
      const opening = checkOpeningHours({ visitId: current.visitId, localDate: current.localDate, startMinute: current.startMinute, endMinute: current.startMinute + current.plannedDurationMinutes }, current.openingDays);
      add("openingHours", opening.status, opening.reason, { affectedVisitId: current.visitId });
    }
    const minimum = checkMinimumVisitDuration({ visitId: current.visitId, plannedDurationMinutes: current.plannedDurationMinutes }, current);
    add("minimumDuration", minimum.status, minimum.reason, { affectedVisitId: current.visitId });
  }

  for (let index = 0; index < ordered.length; index++) {
    const first = ordered[index];
    for (let nextIndex = index + 1; nextIndex < ordered.length && ordered[nextIndex].dayIndex === first.dayIndex; nextIndex++) {
      const second = ordered[nextIndex];
      if (first.startMinute < second.startMinute + second.plannedDurationMinutes && second.startMinute < first.startMinute + first.plannedDurationMinutes) {
        add("scheduleConflict", "VIOLATION", "VISITS_OVERLAP", { visitIds: [first.visitId, second.visitId] });
      }
    }
    const next = ordered[index + 1];
    if (!next || next.dayIndex !== first.dayIndex) continue;
    const snapshot = routes.find(route => route.fromVisitId === first.visitId && route.toVisitId === next.visitId);
    const travel = checkTravelTime({ previousVisit: { visitId: first.visitId, startMinute: first.startMinute, plannedDurationMinutes: first.plannedDurationMinutes }, nextVisit: { visitId: next.visitId, startMinute: next.startMinute } }, snapshot?.route ?? { kind: "unavailable" });
    add("travelTime", travel.status, travel.reason, { fromVisitId: first.visitId, toVisitId: next.visitId });
  }

  const groups = Object.fromEntries(groupNames.map(group => [group, {
    status: aggregateStatus(findings[group].map(finding => finding.status)), findings: findings[group],
  }])) as TripValidation["groups"];
  return { timeReference: timeReference.toISOString(), groups, canConfirm: groupNames.every(group => groups[group].status === "SATISFIED") };
}
