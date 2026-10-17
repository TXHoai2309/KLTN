import { z } from "zod";

import {
  EDIT_INTENT_CLARIFICATION_REASON_VALUES,
  EDIT_INTENT_TYPE_VALUES,
  MAX_EDIT_INTENT_AFFECTED_DAYS,
  MAX_EDIT_INTENT_AFFECTED_VISITS,
  MAX_EDIT_INTENT_TARGETS,
  modelOutputSchema,
  type EditIntentClarificationReason,
  type EditIntentModelOutput,
  type EditIntentResult,
  type EditIntentType,
  type VerifiedEditDestinationId,
  type VerifiedEditVisitId,
} from "./edit-intent-contract";
import {
  MAX_EDIT_INTENT_OUTPUT_CHARS,
  type EditIntentPromptServerContext,
} from "./edit-intent-prompt";
import { MAX_EDIT_VISITS_PER_DAY } from "./edit-candidate";
import { PreferenceExtractionError } from "../preference-extraction/preference-extraction-errors";

// Keep semantically out-of-range integers recoverable so they can become a
// clarification instead of being mistaken for malformed JSON structure.
const integer = z.number().int();
const recoverableModelOutputSchema = z
  .object({
    intentType: z.enum(EDIT_INTENT_TYPE_VALUES),
    targetVisitIds: z.array(z.string().min(1).max(128)).max(MAX_EDIT_INTENT_TARGETS),
    destinationId: z.string().min(1).max(128).nullable(),
    params: z
      .object({
        dayIndex: integer.nullable(),
        position: integer.nullable(),
        startTime: z.string().max(MAX_EDIT_INTENT_OUTPUT_CHARS).nullable(),
        durationMinutes: integer.nullable(),
      })
      .strict(),
    affected: z
      .object({
        visitIds: z.array(z.string().min(1).max(128)).max(MAX_EDIT_INTENT_AFFECTED_VISITS),
        dayIndexes: z.array(integer).max(MAX_EDIT_INTENT_AFFECTED_DAYS),
      })
      .strict(),
    needsClarification: z.boolean(),
    clarificationReason: z.enum(EDIT_INTENT_CLARIFICATION_REASON_VALUES).nullable(),
  })
  .strict();

type RecoverableModelOutput = z.infer<typeof recoverableModelOutputSchema>;

type ServerVisit = {
  visitId: string;
  dayIndex: number;
  startTime: string;
  durationMinutes: number;
};

function invalidProviderResponse(): PreferenceExtractionError {
  return new PreferenceExtractionError("INVALID_PROVIDER_RESPONSE", false);
}

function minutesOfDay(value: string): number | null {
  const match = /^(?:([01]\d|2[0-3])):([0-5]\d)$/u.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function reasonForIntent(intentType: EditIntentType): EditIntentClarificationReason {
  if (intentType === "UNSUPPORTED") return "OUT_OF_SCOPE";
  if (intentType === "UNCLEAR") return "MISSING_TARGET";
  return "MISSING_TARGET";
}

function isSingleTargetIntent(intentType: EditIntentType): boolean {
  return intentType !== "REMOVE_VISIT" && intentType !== "UNSUPPORTED" && intentType !== "UNCLEAR";
}

function verifyAndNormalize(
  output: RecoverableModelOutput,
  context: EditIntentPromptServerContext,
): EditIntentResult {
  const daysByIndex = new Map(context.itinerary.map((day) => [day.dayIndex, day]));
  const visitsById = new Map<string, ServerVisit>();
  for (const day of context.itinerary) {
    for (const visit of day.visits) {
      visitsById.set(visit.visitId, {
        visitId: visit.visitId,
        dayIndex: day.dayIndex,
        startTime: visit.startTime,
        durationMinutes: visit.durationMinutes,
      });
    }
  }
  const eligibleDestinationIds = new Set(
    context.eligibleDestinations?.map((destination) => destination.id) ?? [],
  );
  const reasons: EditIntentClarificationReason[] = [];
  const mark = (reason: EditIntentClarificationReason) => reasons.push(reason);

  const targetVisitIds = unique(output.targetVisitIds).filter((visitId) => {
    if (visitsById.has(visitId)) return true;
    mark("MISSING_TARGET");
    return false;
  });
  if (isSingleTargetIntent(output.intentType) && targetVisitIds.length > 1) {
    mark("AMBIGUOUS_TARGET");
  }

  let destinationId = output.destinationId;
  if (destinationId !== null && !eligibleDestinationIds.has(destinationId)) {
    destinationId = null;
    mark("AMBIGUOUS_DESTINATION");
  }

  const targetRequired = [
    "REMOVE_VISIT",
    "MOVE_VISIT",
    "CHANGE_TIME",
    "CHANGE_DURATION",
    "REPLACE_VISIT",
  ].includes(output.intentType);
  if (targetRequired && targetVisitIds.length === 0) mark("MISSING_TARGET");

  const destinationRequired = output.intentType === "ADD_VISIT" || output.intentType === "REPLACE_VISIT";
  if (destinationRequired && destinationId === null) mark("AMBIGUOUS_DESTINATION");

  const params = { ...output.params };
  const dayIndexIsValid = (dayIndex: number) => daysByIndex.has(dayIndex);
  if (params.dayIndex !== null && !dayIndexIsValid(params.dayIndex)) {
    params.dayIndex = null;
    mark("MISSING_DAY");
  }
  const needsTargetDay = output.intentType === "ADD_VISIT" || output.intentType === "MOVE_VISIT";
  if (needsTargetDay && params.dayIndex === null) mark("MISSING_DAY");

  if (params.position !== null) {
    const targetDay = params.dayIndex === null ? undefined : daysByIndex.get(params.dayIndex);
    const movingVisit =
      output.intentType === "MOVE_VISIT" && targetVisitIds.length === 1
        ? visitsById.get(targetVisitIds[0]!)
        : undefined;
    const targetCount =
      (targetDay?.visits.length ?? 0) -
      (movingVisit?.dayIndex === params.dayIndex ? 1 : 0);
    const maximumPosition = Math.min(targetCount + 1, MAX_EDIT_VISITS_PER_DAY);
    if (
      params.dayIndex === null ||
      !Number.isInteger(params.position) ||
      params.position < 1 ||
      params.position > maximumPosition
    ) {
      params.position = null;
      mark("OUT_OF_SCOPE");
    }
  }

  if (output.intentType === "ADD_VISIT" && params.dayIndex !== null) {
    const day = daysByIndex.get(params.dayIndex);
    if (day && day.visits.length >= MAX_EDIT_VISITS_PER_DAY) mark("OUT_OF_SCOPE");
  }
  if (output.intentType === "MOVE_VISIT" && params.dayIndex !== null && targetVisitIds.length === 1) {
    const target = visitsById.get(targetVisitIds[0]!);
    const day = daysByIndex.get(params.dayIndex);
    const countAfterMove = (day?.visits.length ?? 0) - (target?.dayIndex === params.dayIndex ? 1 : 0);
    if (countAfterMove >= MAX_EDIT_VISITS_PER_DAY) mark("OUT_OF_SCOPE");
  }

  if (params.startTime !== null && minutesOfDay(params.startTime) === null) {
    params.startTime = null;
    mark("MISSING_TIME");
  }
  if (
    params.durationMinutes !== null &&
    (!Number.isInteger(params.durationMinutes) || params.durationMinutes < 1 || params.durationMinutes > 1440)
  ) {
    params.durationMinutes = null;
    mark("MISSING_TIME");
  }

  const timeRequired = output.intentType === "ADD_VISIT" || output.intentType === "CHANGE_TIME";
  if (timeRequired && params.startTime === null) mark("MISSING_TIME");
  const durationRequired = output.intentType === "ADD_VISIT" || output.intentType === "CHANGE_DURATION";
  if (durationRequired && params.durationMinutes === null) mark("MISSING_TIME");

  const timingTargets = targetVisitIds
    .map((visitId) => visitsById.get(visitId))
    .filter((visit): visit is ServerVisit => visit !== undefined);
  if (output.intentType === "CHANGE_TIME" && params.startTime !== null) {
    const newStart = minutesOfDay(params.startTime)!;
    if (timingTargets.some((visit) => newStart + visit.durationMinutes > 1440)) {
      params.startTime = null;
      mark("MISSING_TIME");
    }
  }
  if (output.intentType === "CHANGE_DURATION" && params.durationMinutes !== null) {
    if (
      timingTargets.some((visit) => {
        const currentStart = minutesOfDay(visit.startTime);
        return currentStart === null || currentStart + params.durationMinutes! > 1440;
      })
    ) {
      params.durationMinutes = null;
      mark("MISSING_TIME");
    }
  }
  if (
    output.intentType === "ADD_VISIT" &&
    params.startTime !== null &&
    params.durationMinutes !== null &&
    minutesOfDay(params.startTime)! + params.durationMinutes > 1440
  ) {
    params.durationMinutes = null;
    mark("MISSING_TIME");
  }

  const affectedVisitIds = unique(output.affected.visitIds).filter((visitId) => {
    if (visitsById.has(visitId)) return true;
    mark("MISSING_TARGET");
    return false;
  });
  const affectedDayIndexes = unique(output.affected.dayIndexes).filter((dayIndex) => {
    if (dayIndexIsValid(dayIndex)) return true;
    mark("MISSING_DAY");
    return false;
  });
  const normalizedAffectedVisitIds = unique([...affectedVisitIds, ...targetVisitIds]);
  const normalizedAffectedDayIndexes = unique([
    ...affectedDayIndexes,
    ...targetVisitIds.flatMap((visitId) => {
      const visit = visitsById.get(visitId);
      return visit ? [visit.dayIndex] : [];
    }),
    ...(params.dayIndex !== null && (output.intentType === "ADD_VISIT" || output.intentType === "MOVE_VISIT")
      ? [params.dayIndex]
      : []),
  ]).sort((left, right) => left - right);

  if (output.intentType === "UNSUPPORTED") mark("OUT_OF_SCOPE");
  if (output.intentType === "UNCLEAR") mark(reasonForIntent(output.intentType));
  if (output.needsClarification && output.clarificationReason !== null) {
    mark(output.clarificationReason);
  }
  if (output.needsClarification && output.clarificationReason === null && reasons.length === 0) {
    mark(reasonForIntent(output.intentType));
  }
  if (output.clarificationReason !== null) mark(output.clarificationReason);

  const clarificationReason = reasons[0] ?? null;
  const normalized: EditIntentModelOutput = {
    intentType: output.intentType,
    targetVisitIds,
    destinationId,
    params,
    affected: {
      visitIds: normalizedAffectedVisitIds,
      dayIndexes: normalizedAffectedDayIndexes,
    },
    needsClarification: output.needsClarification || clarificationReason !== null,
    clarificationReason:
      output.needsClarification || clarificationReason !== null
        ? clarificationReason ?? reasonForIntent(output.intentType)
        : null,
  };

  // The broad recovery parser only exists to turn semantic errors into safe
  // clarification. The final object must still satisfy the Task 271 contract.
  const checked = modelOutputSchema.safeParse(normalized);
  if (!checked.success) throw invalidProviderResponse();

  return {
    ...checked.data,
    targetVisitIds: checked.data.targetVisitIds as VerifiedEditVisitId[],
    destinationId: checked.data.destinationId as VerifiedEditDestinationId | null,
    affected: {
      ...checked.data.affected,
      visitIds: checked.data.affected.visitIds as VerifiedEditVisitId[],
    },
  };
}

/** Validate model output against server-owned visit/day/destination data. */
export function verifyEditIntentOutput(
  rawOutput: unknown,
  context: EditIntentPromptServerContext,
): EditIntentResult {
  if (typeof rawOutput === "string") {
    if (rawOutput.length === 0 || rawOutput.length > MAX_EDIT_INTENT_OUTPUT_CHARS) {
      throw invalidProviderResponse();
    }
    try {
      rawOutput = JSON.parse(rawOutput) as unknown;
    } catch {
      throw invalidProviderResponse();
    }
  }

  const parsed = recoverableModelOutputSchema.safeParse(rawOutput);
  if (!parsed.success) throw invalidProviderResponse();

  try {
    return verifyAndNormalize(parsed.data, context);
  } catch (error) {
    if (error instanceof PreferenceExtractionError) throw error;
    throw invalidProviderResponse();
  }
}
