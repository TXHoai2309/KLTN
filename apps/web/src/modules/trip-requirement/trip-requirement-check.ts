import {
  tripRequirementFieldErrors,
  tripRequirementInputSchema,
  type TripRequirementInput,
} from "./trip-requirement-contract";
import { evaluateTripRequirement, type TripRequirementReadiness } from "./trip-requirement-readiness";
import { TRANSPORT_UNSUPPORTED_ERROR_MESSAGE } from "./trip-transport-policy";

export const CHECK_FIELD_ORDER = [
  "durationDays",
  "transport",
  "startDate",
  "companions",
  "interests",
  "pace",
  "mobilityConstraints",
  "_form",
] as const;

export type CheckIssueField =
  | "startDate"
  | "durationDays"
  | "companions"
  | "interests"
  | "pace"
  | "transport"
  | "mobilityConstraints"
  | "_form";

export type CheckIssue = {
  code:
    | "MISSING_REQUIRED"
    | "INVALID_VALUE"
    | "INVALID_BODY"
    | "TRANSPORT_UNSUPPORTED"
    | "START_DATE_INVALID"
    | "START_DATE_IN_PAST"
    | "COMPANIONS_CONFLICT_CHILDREN"
    | "PACE_MOBILITY_MISMATCH";
  field: CheckIssueField;
  severity: "ERROR" | "WARNING";
  message: string;
};

export type CheckResult = {
  requirement: TripRequirementInput | null;
  issues: CheckIssue[];
  confirmable: boolean;
  readiness: TripRequirementReadiness | null;
  usesRelativeDays: boolean;
};

export type TripRequirementCheckResult = CheckResult;

const INVALID_BODY_MESSAGE = "Dữ liệu nhu cầu chuyến đi phải là một đối tượng JSON hợp lệ.";
const START_DATE_IN_PAST_MESSAGE = "Ngày bắt đầu không được ở trong quá khứ.";
const ROOT_KEYS = new Set([
  "startDate",
  "durationDays",
  "transport",
  "companions",
  "interests",
  "pace",
  "mobilityConstraints",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingRequiredValue(value: unknown): boolean {
  return value === null || value === undefined;
}

function usesRelativeDaysForRaw(rawCandidate: Record<string, unknown>): boolean {
  const value = rawCandidate.startDate;
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

function mapFieldPath(fieldPath: string): CheckIssueField | null {
  const root = fieldPath.split(".")[0];
  if ((CHECK_FIELD_ORDER as readonly string[]).includes(root)) {
    return root as CheckIssueField;
  }
  return null;
}

function sortIssues(issues: CheckIssue[]): CheckIssue[] {
  return issues
    .map((issue, index) => ({ issue, index }))
    .sort((left, right) => {
      const leftIndex = CHECK_FIELD_ORDER.indexOf(left.issue.field);
      const rightIndex = CHECK_FIELD_ORDER.indexOf(right.issue.field);
      return leftIndex - rightIndex || left.index - right.index;
    })
    .map(({ issue }) => issue);
}

function schemaIssues(
  rawCandidate: Record<string, unknown>,
  error: Parameters<typeof tripRequirementFieldErrors>[0],
): CheckIssue[] {
  const fieldErrors = tripRequirementFieldErrors(error);
  const issues: CheckIssue[] = [];

  for (const [fieldPath, message] of Object.entries(fieldErrors)) {
    const field = mapFieldPath(fieldPath);
    if (!field || field === "_form") {
      issues.push({
        code: "INVALID_BODY",
        field: "_form",
        severity: "ERROR",
        message: "Dữ liệu chứa trường không được hỗ trợ.",
      });
      continue;
    }

    const missing =
      (field === "durationDays" || field === "transport") &&
      isMissingRequiredValue(rawCandidate[field]);
    if (missing) {
      issues.push({
        code: "MISSING_REQUIRED",
        field,
        severity: "ERROR",
        message,
      });
      continue;
    }

    if (field === "startDate") {
      issues.push({
        code: "START_DATE_INVALID",
        field,
        severity: "ERROR",
        message,
      });
      continue;
    }

    if (field === "transport") {
      issues.push({
        code: "TRANSPORT_UNSUPPORTED",
        field,
        severity: "ERROR",
        message: TRANSPORT_UNSUPPORTED_ERROR_MESSAGE,
      });
      continue;
    }

    issues.push({
      code: "INVALID_VALUE",
      field,
      severity: "ERROR",
      message,
    });
  }

  return issues;
}

function unknownRootKeyIssues(rawCandidate: Record<string, unknown>): CheckIssue[] {
  return Object.keys(rawCandidate)
    .filter((key) => !ROOT_KEYS.has(key))
    .map(() => ({
      code: "INVALID_BODY" as const,
      field: "_form" as const,
      severity: "ERROR" as const,
      message: "Dữ liệu chứa trường không được hỗ trợ.",
    }));
}

function consistencyIssues(requirement: TripRequirementInput): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const companions = requirement.companions;
  const mobility = requirement.mobilityConstraints;

  if (
    companions?.type === "SOLO" &&
    mobility?.flags.includes("YOUNG_CHILDREN")
  ) {
    issues.push({
      code: "COMPANIONS_CONFLICT_CHILDREN",
      field: "companions",
      severity: "ERROR",
      message: "Nhóm Một mình không thể đồng thời có ràng buộc đi cùng trẻ nhỏ.",
    });
  }

  if (
    requirement.pace === "PACKED" &&
    mobility?.flags.some((flag) =>
      flag === "AVOID_LONG_WALKING" || flag === "WHEELCHAIR_OR_MOBILITY_AID",
    )
  ) {
    issues.push({
      code: "PACE_MOBILITY_MISMATCH",
      field: "pace",
      severity: "WARNING",
      message: "Nhịp độ nhiều trải nghiệm có thể chưa phù hợp với ràng buộc di chuyển đã chọn.",
    });
  }

  return issues;
}

function invalidBodyResult(): CheckResult {
  return {
    requirement: null,
    issues: [{
      code: "INVALID_BODY",
      field: "_form",
      severity: "ERROR",
      message: INVALID_BODY_MESSAGE,
    }],
    confirmable: false,
    readiness: null,
    usesRelativeDays: false,
  };
}

/**
 * Authoritative, isomorphic server-check domain function. It never mutates the
 * caller's object and returns every contract/consistency issue in stable order.
 * The caller still has to run this again immediately before any future save.
 */
export function checkTripRequirement(
  rawCandidate: unknown,
  now: Date,
): TripRequirementCheckResult {
  if (!isRecord(rawCandidate)) return invalidBodyResult();

  const usesRelativeDays = usesRelativeDaysForRaw(rawCandidate);
  const parsed = tripRequirementInputSchema.safeParse(rawCandidate);
  if (!parsed.success) {
    const bodyIssues = unknownRootKeyIssues(rawCandidate);
    return {
      requirement: null,
      issues: sortIssues([...schemaIssues(rawCandidate, parsed.error), ...bodyIssues]),
      confirmable: false,
      readiness: null,
      usesRelativeDays,
    };
  }

  const readiness = evaluateTripRequirement(parsed.data, now);
  const issues: CheckIssue[] = [];
  if (readiness.startDateIssue === "IN_PAST") {
    issues.push({
      code: "START_DATE_IN_PAST",
      field: "startDate",
      severity: "ERROR",
      message: START_DATE_IN_PAST_MESSAGE,
    });
  }
  issues.push(...consistencyIssues(parsed.data));

  const orderedIssues = sortIssues(issues);
  return {
    requirement: parsed.data,
    issues: orderedIssues,
    confirmable: !orderedIssues.some((issue) => issue.severity === "ERROR"),
    readiness,
    usesRelativeDays: readiness.usesRelativeDays,
  };
}
