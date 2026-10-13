import { AppError } from "@/server/http/app-error";

import {
  deriveClarificationsFromCheck,
  type ClarificationField,
  type ClarificationKind,
} from "./trip-clarification-rules";
import {
  checkTripRequirement,
  type CheckIssue,
} from "./trip-requirement-check";
import type { TripRequirementInput } from "./trip-requirement-contract";

export type TripRequirementBlocker = {
  id: string;
  field: ClarificationField | "_form";
  kind: ClarificationKind;
  question: string;
};

const INVALID_BODY_BLOCKER: TripRequirementBlocker = {
  id: "_form:INVALID",
  field: "_form",
  kind: "INVALID",
  question: "Thông tin nhu cầu chuyến đi chưa đủ rõ để lập hành trình; vui lòng kiểm tra lại các mục đã nhập.",
};

function fallbackBlocker(issue: CheckIssue): TripRequirementBlocker {
  if (issue.field === "_form") return INVALID_BODY_BLOCKER;
  return {
    id: `${issue.field}:INVALID`,
    field: issue.field,
    kind: issue.code === "MISSING_REQUIRED" ? "MISSING" : "INVALID",
    question: "Vui lòng bổ sung hoặc chỉnh sửa mục này để thông tin chuyến đi rõ ràng hơn.",
  };
}

/**
 * Server-only planner gate. US-28 MUST call this immediately before planning
 * and call assertStartDateForFinalConfirmation again before official save.
 */
export function assertTripRequirementClear(
  candidate: unknown,
  now: Date,
): TripRequirementInput {
  const check = checkTripRequirement(candidate, now);
  const requests = deriveClarificationsFromCheck(check);
  const blockers = requests
    .filter((request) => request.severity === "BLOCKING")
    .map(({ id, field, kind, question }) => ({ id, field, kind, question }));
  const errorIssues = check.issues.filter((issue) => issue.severity === "ERROR");

  if (check.requirement === null || errorIssues.length > 0 || blockers.length > 0) {
    const safeBlockers = blockers.length > 0 ? blockers : errorIssues.map(fallbackBlocker);
    throw new AppError(
      "TRIP_REQUIREMENT_UNCLEAR",
      "Thông tin chuyến đi chưa đủ rõ để lập hành trình. Vui lòng bổ sung hoặc chỉnh sửa các mục được nêu.",
      422,
      { blockers: safeBlockers },
    );
  }

  return check.requirement;
}
