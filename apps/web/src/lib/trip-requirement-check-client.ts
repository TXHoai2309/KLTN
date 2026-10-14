import { z } from "zod";

import {
  CHECK_FIELD_ORDER,
  type CheckIssue,
  type CheckResult,
} from "@/modules/trip-requirement/trip-requirement-check";
import {
  clarificationRequestsSchema,
  type ClarificationRequest,
} from "@/modules/trip-requirement/trip-clarification-rules";
import {
  tripRequirementInputSchema,
  type TripRequirementInput,
} from "@/modules/trip-requirement/trip-requirement-contract";
import type { TripRequirementCandidate } from "@/modules/trip-requirement/trip-requirement-review";
import {
  type TripRequirementReadiness,
  type TripRequirementField,
  type StartDateIssue,
} from "@/modules/trip-requirement/trip-requirement-readiness";

export type TripRequirementCheckResponseInput =
  | { kind: "http"; status: number; body: unknown }
  | { kind: "network" };

export type TripRequirementCheckResult = CheckResult & {
  clarificationRequests: ClarificationRequest[];
};

export type TripRequirementCheckOutcome =
  | { kind: "CHECKED"; result: TripRequirementCheckResult }
  | {
      kind: "FAILED";
      status: number;
      code: string;
      message: string;
    }
  | { kind: "NETWORK_ERROR" };

const INVALID_RESPONSE_MESSAGE = "Phản hồi kiểm tra nhu cầu không hợp lệ.";
const TECHNICAL_ERROR_MESSAGE = "Hệ thống chưa thể kiểm tra nhu cầu lúc này. Dữ liệu vẫn được giữ lại, hãy thử lại.";
const LOGIN_MESSAGE = "Phiên đăng nhập không còn hiệu lực. Vui lòng đăng nhập lại.";
const FORBIDDEN_MESSAGE = "Bạn không có quyền kiểm tra nhu cầu chuyến đi.";
const VALIDATION_MESSAGE = "Thông tin nhu cầu chuyến đi chưa hợp lệ. Vui lòng kiểm tra lại các mục cần sửa.";

const issueCodeSchema = z.enum([
  "MISSING_REQUIRED",
  "INVALID_VALUE",
  "INVALID_BODY",
  "TRANSPORT_UNSUPPORTED",
  "START_DATE_INVALID",
  "START_DATE_IN_PAST",
  "COMPANIONS_CONFLICT_CHILDREN",
  "PACE_MOBILITY_MISMATCH",
]);
const issueFieldSchema = z.enum(CHECK_FIELD_ORDER);
const issueSchema = z.object({
  code: issueCodeSchema,
  field: issueFieldSchema,
  severity: z.enum(["ERROR", "WARNING"]),
  message: z.string(),
}).strict() satisfies z.ZodType<CheckIssue>;

const readinessSchema = z.object({
  preliminary: z.boolean(),
  finalConfirmation: z.boolean(),
  missing: z.array(z.enum(["durationDays", "transport", "startDate"] satisfies readonly TripRequirementField[])),
  startDateIssue: z.enum(["MISSING", "INVALID_FORMAT", "IN_PAST"]).nullable() as z.ZodType<StartDateIssue>,
  usesRelativeDays: z.boolean(),
}).strict() satisfies z.ZodType<TripRequirementReadiness>;

const checkResultSchema = z.object({
  requirement: tripRequirementInputSchema.nullable(),
  issues: z.array(issueSchema),
  confirmable: z.boolean(),
  readiness: readinessSchema.nullable(),
  usesRelativeDays: z.boolean(),
  // Additive US-27 field: old US-26 responses default to no requests.
  clarificationRequests: clarificationRequestsSchema.default([]),
}).strict() satisfies z.ZodType<TripRequirementCheckResult>;

const successEnvelopeSchema = z.object({
  success: z.literal(true),
  data: checkResultSchema,
}).strict();

const errorEnvelopeSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }).strict(),
}).strict();

function safeFailure(status: number, code: string, message: string): TripRequirementCheckOutcome {
  return { kind: "FAILED", status, code, message };
}

function failureFromHttp(status: number, body: unknown): TripRequirementCheckOutcome {
  const parsed = errorEnvelopeSchema.safeParse(body);
  if (!parsed.success) {
    return safeFailure(status >= 400 ? status : 502, "INVALID_RESPONSE", INVALID_RESPONSE_MESSAGE);
  }

  if (status === 401 || parsed.data.error.code === "UNAUTHENTICATED") {
    return safeFailure(401, "UNAUTHENTICATED", LOGIN_MESSAGE);
  }
  if (status === 403 || parsed.data.error.code === "FORBIDDEN") {
    return safeFailure(403, "FORBIDDEN", FORBIDDEN_MESSAGE);
  }
  if (status === 400 && parsed.data.error.code === "VALIDATION_ERROR") {
    return safeFailure(400, "VALIDATION_ERROR", VALIDATION_MESSAGE);
  }
  if (status >= 500) {
    return safeFailure(status, parsed.data.error.code, TECHNICAL_ERROR_MESSAGE);
  }
  return safeFailure(status, parsed.data.error.code, TECHNICAL_ERROR_MESSAGE);
}

/** Purely maps a server/network response and rejects untrusted success data. */
export function decideTripRequirementCheckResponse(
  input: TripRequirementCheckResponseInput,
): TripRequirementCheckOutcome {
  if (input.kind === "network") return { kind: "NETWORK_ERROR" };

  if (input.status === 200) {
    const parsed = successEnvelopeSchema.safeParse(input.body);
    if (parsed.success) return { kind: "CHECKED", result: parsed.data.data };
    return safeFailure(502, "INVALID_RESPONSE", INVALID_RESPONSE_MESSAGE);
  }

  return failureFromHttp(input.status, input.body);
}

/**
 * Calls the read-only authoritative check endpoint. The candidate is sent as
 * canonical form data only; review provenance never crosses this boundary.
 */
export async function checkTripRequirement(
  candidate: TripRequirementInput | TripRequirementCandidate,
  signal?: AbortSignal,
): Promise<TripRequirementCheckOutcome> {
  try {
    const response = await fetch("/api/trip-requirements/check", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(candidate),
      signal,
    });

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return decideTripRequirementCheckResponse({ kind: "http", status: response.status, body });
  } catch {
    return { kind: "NETWORK_ERROR" };
  }
}

export function shouldApplyCheckResponse(
  requestSequence: number,
  currentSequence: number,
  mounted: boolean,
): boolean {
  return mounted && requestSequence === currentSequence;
}

