import { z } from "zod";

import {
  EDIT_INTENT_CLARIFICATION_REASON_VALUES,
  type EditIntentClarificationReason,
} from "../trip-edit/edit-intent-contract";
import { MAX_EDIT_VISITS_PER_DAY } from "../trip-edit/edit-candidate";
import {
  MAX_REPLAN_OPERATIONS,
  REPLAN_OPERATION_TYPES,
  modelOutputSchema,
  type ReplanClarificationReason,
  type ReplanIntentResult,
  type ReplanModelOutput,
  type ReplanOperation,
  type ReplanServerIds,
  type VerifiedReplanDestinationId,
  type VerifiedReplanOperation,
  type VerifiedReplanVisitId,
} from "./replan-contract";
import { MAX_REPLAN_OUTPUT_CHARS } from "./replan-contract";
import type { ReplanPromptServerContext } from "./replan-prompt";
import { PreferenceExtractionError } from "../preference-extraction/preference-extraction-errors";

const recoverableOperationSchema = z
  .object({
    operationType: z.enum(REPLAN_OPERATION_TYPES),
    targetVisitId: z.string().min(1).max(128).nullable(),
    destinationId: z.string().min(1).max(128).nullable(),
    params: z
      .object({
        dayIndex: z.number().int().nullable(),
        position: z.number().int().nullable(),
        startTime: z.string().max(16).nullable(),
        durationMinutes: z.number().int().nullable(),
      })
      .strict(),
  })
  .strict();

const recoverableOutputSchema = z
  .object({
    operations: z.array(recoverableOperationSchema).max(MAX_REPLAN_OPERATIONS),
    mandatoryEndpoint: z
      .object({
        destinationId: z.string().min(1).max(128).nullable(),
        deadline: z.string().max(16).nullable(),
      })
      .strict()
      .nullable(),
    needsClarification: z.boolean(),
    clarificationReason: z.enum(EDIT_INTENT_CLARIFICATION_REASON_VALUES).nullable(),
  })
  .strict();

type RecoverableOutput = z.infer<typeof recoverableOutputSchema>;
type ServerVisit = ReplanPromptServerContext["remainingVisits"][number];

export type ReplanVerificationResult =
  | { status: "PROPOSED"; intent: ReplanIntentResult }
  | {
      status: "NEEDS_CLARIFICATION";
      clarificationReason: ReplanClarificationReason;
      operations: [];
      mandatoryEndpoint: null;
    }
  | {
      status: "REJECTED_COMPLETED_VISIT";
      reason: "COMPLETED_VISIT_TARGET";
      message: string;
    };

const completedVisitRejectionMessage =
  "Đề xuất bị từ chối vì có thao tác nhắm tới lượt đã qua giờ theo lịch.";

function invalidProviderResponse(): PreferenceExtractionError {
  return new PreferenceExtractionError("INVALID_PROVIDER_RESPONSE", false);
}

function validTime(value: string): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(value);
}

function normalizeTime(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  const colonMatch = /^(\d{1,2}):(\d{2})$/u.exec(trimmed);
  if (colonMatch) {
    const hours = Number(colonMatch[1]);
    const minutes = Number(colonMatch[2]);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
    }
  }
  const hMatch = /^(\d{1,2})h(\d{2})?$/ui.exec(trimmed);
  if (hMatch) {
    const hours = Number(hMatch[1]);
    const minutes = hMatch[2] ? Number(hMatch[2]) : 0;
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
    }
  }
  const singleHourMatch = /^(\d{1,2})$/u.exec(trimmed);
  if (singleHourMatch) {
    const hours = Number(singleHourMatch[1]);
    if (hours >= 0 && hours <= 23) {
      return `${hours.toString().padStart(2, "0")}:00`;
    }
  }
  return trimmed;
}

function formatTimeMinutes(minutesTotal: number): string {
  const bounded = Math.max(0, Math.min(1439, minutesTotal));
  const hours = Math.floor(bounded / 60);
  const minutes = bounded % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

function timeMinutes(value: string): number | null {
  const match = /^(?:([01]\d|2[0-3])):([0-5]\d)$/u.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function clarification(
  reason: EditIntentClarificationReason,
): ReplanVerificationResult {
  return {
    status: "NEEDS_CLARIFICATION",
    clarificationReason: reason,
    operations: [],
    mandatoryEndpoint: null,
  };
}

function verifyOutput(
  output: RecoverableOutput,
  context: ReplanPromptServerContext,
): ReplanVerificationResult {
  const completed = new Set(context.completedVisitIds);
  const remaining = new Map<string, ServerVisit>(
    context.remainingVisits.map((visit) => [visit.visitId, visit]),
  );
  const destinations = new Set(context.eligibleDestinations.map((destination) => destination.id));
  const dayIndexes = new Set(context.dayIndexes);

  if (output.operations.some((operation) =>
    operation.targetVisitId !== null && completed.has(operation.targetVisitId),
  )) {
    return {
      status: "REJECTED_COMPLETED_VISIT",
      reason: "COMPLETED_VISIT_TARGET",
      message: completedVisitRejectionMessage,
    };
  }

  if (output.needsClarification || output.clarificationReason !== null) {
    return clarification(output.clarificationReason ?? "MISSING_TARGET");
  }

  let issue: EditIntentClarificationReason | null = null;
  const mark = (reason: EditIntentClarificationReason) => {
    issue ??= reason;
  };
  const normalized: ReplanOperation[] = output.operations.map((operation) => {
    const params = { ...operation.params };
    let targetVisitId = operation.targetVisitId;
    let destinationId = operation.destinationId;
    const targetRequired = operation.operationType !== "ADD_VISIT";
    const destinationRequired =
      operation.operationType === "ADD_VISIT" || operation.operationType === "REPLACE_VISIT";

    if (targetVisitId !== null && !remaining.has(targetVisitId)) {
      targetVisitId = null;
      mark("MISSING_TARGET");
    }
    if (targetRequired && targetVisitId === null) mark("MISSING_TARGET");
    if (!targetRequired && targetVisitId !== null) {
      targetVisitId = null;
      mark("MISSING_TARGET");
    }

    if (destinationId !== null && !destinations.has(destinationId)) {
      destinationId = null;
      mark("AMBIGUOUS_DESTINATION");
    }
    if (destinationRequired && destinationId === null) mark("AMBIGUOUS_DESTINATION");

    if (params.dayIndex !== null && !dayIndexes.has(params.dayIndex)) {
      params.dayIndex = null;
      mark("MISSING_DAY");
    }
    const dayRequired =
      operation.operationType === "ADD_VISIT" || operation.operationType === "MOVE_VISIT";
    if (dayRequired && params.dayIndex === null) {
      if (
        context.resolution?.selectedDayIndex !== undefined &&
        dayIndexes.has(context.resolution.selectedDayIndex)
      ) {
        params.dayIndex = context.resolution.selectedDayIndex;
      } else if (dayIndexes.size === 1) {
        params.dayIndex = [...dayIndexes][0]!;
      } else {
        mark("MISSING_DAY");
      }
    }

    if (
      params.position !== null &&
      (!Number.isSafeInteger(params.position) ||
        params.position < 1 ||
        params.position > MAX_EDIT_VISITS_PER_DAY)
    ) {
      params.position = null;
    }

    if (operation.operationType === "ADD_VISIT") {
      params.startTime = normalizeTime(params.startTime);
      if (params.startTime !== null && !validTime(params.startTime)) {
        params.startTime = null;
      }
      if (
        params.durationMinutes === null ||
        !Number.isSafeInteger(params.durationMinutes) ||
        params.durationMinutes < 1 ||
        params.durationMinutes > 1440
      ) {
        params.durationMinutes = 60;
      }

      if (params.startTime === null && params.dayIndex !== null) {
        const dayVisits = context.remainingVisits.filter((v) => v.dayIndex === params.dayIndex);
        let scheduleMinute = 9 * 60;
        for (const v of dayVisits) {
          const sm = timeMinutes(v.startTime);
          if (sm !== null) {
            scheduleMinute = Math.max(scheduleMinute, sm + v.durationMinutes + 30);
          }
        }
        if (scheduleMinute + params.durationMinutes > 1440) {
          scheduleMinute = Math.max(0, 1440 - params.durationMinutes);
        }
        params.startTime = formatTimeMinutes(scheduleMinute);
        params.position ??= dayVisits.length + 1;
      }
    } else {
      if (params.startTime !== null) {
        params.startTime = normalizeTime(params.startTime);
      }
      if (params.startTime !== null && !validTime(params.startTime)) {
        params.startTime = null;
        mark("MISSING_TIME");
      }
      if (
        params.durationMinutes !== null &&
        (!Number.isSafeInteger(params.durationMinutes) ||
          params.durationMinutes < 1 ||
          params.durationMinutes > 1440)
      ) {
        params.durationMinutes = null;
        mark("MISSING_TIME");
      }
    }

    const startRequired =
      operation.operationType === "ADD_VISIT" || operation.operationType === "CHANGE_TIME";
    const durationRequired =
      operation.operationType === "ADD_VISIT" || operation.operationType === "CHANGE_DURATION";
    if (startRequired && params.startTime === null) mark("MISSING_TIME");
    if (durationRequired && params.durationMinutes === null) mark("MISSING_TIME");

    const target = targetVisitId === null ? undefined : remaining.get(targetVisitId);
    if (
      operation.operationType === "ADD_VISIT" &&
      params.startTime !== null &&
      params.durationMinutes !== null &&
      timeMinutes(params.startTime)! + params.durationMinutes > 1440
    ) {
      params.durationMinutes = null;
      mark("MISSING_TIME");
    }
    if (
      operation.operationType === "CHANGE_TIME" &&
      params.startTime !== null &&
      target &&
      timeMinutes(params.startTime)! + target.durationMinutes > 1440
    ) {
      params.startTime = null;
      mark("MISSING_TIME");
    }
    if (
      operation.operationType === "CHANGE_DURATION" &&
      params.durationMinutes !== null &&
      target &&
      timeMinutes(target.startTime) !== null &&
      timeMinutes(target.startTime)! + params.durationMinutes > 1440
    ) {
      params.durationMinutes = null;
      mark("MISSING_TIME");
    }

    const allowedParams = {
      ADD_VISIT: new Set(["dayIndex", "position", "startTime", "durationMinutes"]),
      REMOVE_VISIT: new Set<string>(),
      MOVE_VISIT: new Set(["dayIndex", "position"]),
      CHANGE_TIME: new Set(["startTime"]),
      CHANGE_DURATION: new Set(["durationMinutes"]),
      REPLACE_VISIT: new Set<string>(),
    }[operation.operationType];
    for (const key of Object.keys(params) as (keyof typeof params)[]) {
      if (!allowedParams.has(key) && params[key] !== null) {
        params[key] = null;
      }
    }
    if (operation.operationType === "REPLACE_VISIT" && params.dayIndex !== null) {
      params.dayIndex = null;
    }
    if (
      operation.operationType !== "ADD_VISIT" &&
      operation.operationType !== "REPLACE_VISIT" &&
      destinationId !== null
    ) {
      destinationId = null;
    }

    return {
      operationType: operation.operationType,
      targetVisitId,
      destinationId,
      params,
    };
  });

  let mandatoryEndpoint: ReplanModelOutput["mandatoryEndpoint"] = output.mandatoryEndpoint;
  if (mandatoryEndpoint !== null) {
    const selectedDestinationId = context.resolution?.selectedDestinationId;
    const matchesOperation = normalized.some(
      (operation) => operation.destinationId === selectedDestinationId,
    );
    if (
      mandatoryEndpoint.destinationId === null &&
      selectedDestinationId !== undefined &&
      destinations.has(selectedDestinationId) &&
      !matchesOperation
    ) {
      mandatoryEndpoint = { ...mandatoryEndpoint, destinationId: selectedDestinationId };
    } else if (
      mandatoryEndpoint.destinationId === null ||
      !destinations.has(mandatoryEndpoint.destinationId)
    ) {
      mandatoryEndpoint = null;
      mark("AMBIGUOUS_DESTINATION");
    } else if (
      selectedDestinationId !== undefined &&
      mandatoryEndpoint.destinationId !== selectedDestinationId &&
      !matchesOperation
    ) {
      mandatoryEndpoint = null;
      mark("AMBIGUOUS_DESTINATION");
    }
    if (mandatoryEndpoint !== null && mandatoryEndpoint.deadline !== null) {
      mandatoryEndpoint.deadline = normalizeTime(mandatoryEndpoint.deadline);
    }
    if (
      mandatoryEndpoint !== null &&
      (mandatoryEndpoint.deadline === null || !validTime(mandatoryEndpoint.deadline))
    ) {
      mandatoryEndpoint = null;
      mark("MISSING_TIME");
    }
  }

  if (context.resolution?.selectedVisitId !== undefined) {
    const selectedVisitId = context.resolution.selectedVisitId;
    if (!normalized.some((operation) => operation.targetVisitId === selectedVisitId)) {
      mark("MISSING_TARGET");
    }
  }
  if (context.resolution?.selectedDestinationId !== undefined) {
    const selectedDestinationId = context.resolution.selectedDestinationId;
    const matchesMandatoryEndpoint = mandatoryEndpoint?.destinationId === selectedDestinationId;
    const matchesOperation = normalized.some(
      (operation) => operation.destinationId === selectedDestinationId,
    );
    if (!matchesMandatoryEndpoint && !matchesOperation) {
      mark("AMBIGUOUS_DESTINATION");
    }
  }
  if (context.resolution?.selectedDayIndex !== undefined) {
    const selectedDayIndex = context.resolution.selectedDayIndex;
    const matchesOperation = normalized.some(
      (operation) => operation.params.dayIndex === selectedDayIndex,
    );
    if (!matchesOperation) {
      const targetOp = normalized.find(
        (operation) =>
          operation.operationType === "ADD_VISIT" || operation.operationType === "MOVE_VISIT",
      );
      if (targetOp && dayIndexes.has(selectedDayIndex)) {
        targetOp.params.dayIndex = selectedDayIndex;
      } else {
        mark("MISSING_DAY");
      }
    }
  }

  if (issue !== null) return clarification(issue);
  if (normalized.length === 0 && mandatoryEndpoint === null) {
    return clarification("MISSING_TARGET");
  }

  const checked = modelOutputSchema.safeParse({
    operations: normalized,
    mandatoryEndpoint,
    needsClarification: false,
    clarificationReason: null,
  });
  if (!checked.success) throw invalidProviderResponse();

  const verifiedOperations: VerifiedReplanOperation[] = checked.data.operations.map((operation) => ({
    ...operation,
    targetVisitId: operation.targetVisitId as VerifiedReplanVisitId | null,
    destinationId: operation.destinationId as VerifiedReplanDestinationId | null,
  }));
  const verifiedIntent: ReplanIntentResult = {
    operations: verifiedOperations,
    mandatoryEndpoint:
      checked.data.mandatoryEndpoint === null
        ? null
        : {
            destinationId: checked.data.mandatoryEndpoint.destinationId as VerifiedReplanDestinationId,
            deadline: checked.data.mandatoryEndpoint.deadline!,
          },
  };

  return { status: "PROPOSED", intent: verifiedIntent };
}

/** Verify provider output using only the allowlisted server context. */
export function verifyReplanOutput(
  rawOutput: unknown,
  context: ReplanPromptServerContext,
): ReplanVerificationResult {
  if (typeof rawOutput === "string") {
    if (rawOutput.length === 0 || rawOutput.length > MAX_REPLAN_OUTPUT_CHARS) {
      throw invalidProviderResponse();
    }
    try {
      rawOutput = JSON.parse(rawOutput) as unknown;
    } catch {
      throw invalidProviderResponse();
    }
  }

  const parsed = recoverableOutputSchema.safeParse(rawOutput);
  if (!parsed.success) throw invalidProviderResponse();

  try {
    return verifyOutput(parsed.data, context);
  } catch (error) {
    if (error instanceof PreferenceExtractionError) throw error;
    throw invalidProviderResponse();
  }
}

/** IDs used in the provider schema are restricted to server-owned context. */
export function replanServerIds(context: ReplanPromptServerContext): ReplanServerIds {
  return {
    remainingVisitIds: context.remainingVisitIds,
    eligibleDestinationIds: context.eligibleDestinations.map((destination) => destination.id),
    dayIndexes: context.dayIndexes,
  };
}
