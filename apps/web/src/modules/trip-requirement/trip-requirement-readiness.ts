import { AppError } from "@/server/http/app-error";

import {
  isValidCalendarDate,
  MAX_DURATION_DAYS,
  MIN_DURATION_DAYS,
  TRANSPORT_VALUES,
  type TripRequirementInput,
} from "./trip-requirement-contract";

export const VIETNAM_TIME_ZONE = "Asia/Ho_Chi_Minh";

export type TripRequirementField = "durationDays" | "transport" | "startDate";
export type StartDateIssue = null | "MISSING" | "INVALID_FORMAT" | "IN_PAST";

export type TripRequirementReadiness = {
  preliminary: boolean;
  finalConfirmation: boolean;
  missing: TripRequirementField[];
  startDateIssue: StartDateIssue;
  usesRelativeDays: boolean;
};

function vietnamDateOf(now: Date): string {
  if (Number.isNaN(now.getTime())) {
    throw new RangeError("now must be a valid Date");
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: VIETNAM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function isValidDuration(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= MIN_DURATION_DAYS &&
    value <= MAX_DURATION_DAYS
  );
}

function isValidTransport(value: unknown): boolean {
  return typeof value === "string" && (TRANSPORT_VALUES as readonly string[]).includes(value);
}

function startDateIssueOf(startDate: unknown, now: Date): StartDateIssue {
  if (typeof startDate !== "string" || startDate.length === 0) return "MISSING";
  if (!isValidCalendarDate(startDate)) return "INVALID_FORMAT";
  if (startDate < vietnamDateOf(now)) return "IN_PAST";
  return null;
}

export function evaluateTripRequirement(
  input: TripRequirementInput,
  now: Date,
): TripRequirementReadiness {
  const durationValid = isValidDuration(input.durationDays);
  const transportValid = isValidTransport(input.transport);
  const startDateIssue = startDateIssueOf(input.startDate, now);
  const preliminary = durationValid && transportValid;
  const missing: TripRequirementField[] = [];

  if (!durationValid) missing.push("durationDays");
  if (!transportValid) missing.push("transport");
  if (startDateIssue !== null) missing.push("startDate");

  return {
    preliminary,
    finalConfirmation: preliminary && startDateIssue === null,
    missing,
    startDateIssue,
    usesRelativeDays: startDateIssue === "MISSING",
  };
}

/**
 * Guard required by the future server-side confirmation/save story.
 *
 * The save story MUST call this guard on the server immediately before final
 * confirmation/save. A client readiness result is only presentation state and
 * is not an authorization or persistence decision.
 */
export function assertStartDateForFinalConfirmation(
  input: TripRequirementInput,
  now: Date,
): void {
  const readiness = evaluateTripRequirement(input, now);
  if (readiness.startDateIssue === "IN_PAST") {
    throw new AppError(
      "TRIP_START_DATE_IN_PAST",
      "Ngày bắt đầu không được ở trong quá khứ.",
      422,
    );
  }
  if (readiness.startDateIssue !== null) {
    throw new AppError(
      "TRIP_START_DATE_REQUIRED",
      "Cần chọn ngày bắt đầu trước khi xác nhận và lưu chính thức hành trình.",
      422,
    );
  }
}
