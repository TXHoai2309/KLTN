import { randomUUID } from "node:crypto";
import type { Database, Prisma } from "@KLTN/db";
import { z } from "zod";

import { AppError } from "@/server/http/app-error";
import { visibleDestinationWhere } from "../destination/destination-eligibility";
import type { StructuredLlmClient } from "../preference-extraction/preference-extraction-client";
import type { TripValidation } from "../trip-validation/trip-validation";
import {
  type EditIntentClarificationReason,
  type EditIntentResult,
  type VerifiedEditVisitId,
} from "./edit-intent-contract";
import {
  assertResolutionReferencesServerData,
  createEditClarification,
  resolveEditIntent,
  type EditClarification,
  type EditClarificationContext,
  type EditResolution,
} from "./edit-clarification";
import { recognizeEditIntent } from "./edit-intent-service";
import {
  addVisit,
  createEditCandidate,
  diffEditCandidate,
  EditCandidateOperationError,
  moveVisit,
  removeVisit,
  replaceVisit,
  setVisitDuration,
  setVisitTime,
  type EditCandidate,
  type EditCandidateDiff,
} from "./edit-candidate";
import {
  MAX_EDIT_INTENT_DESTINATIONS,
  MAX_EDIT_INTENT_MESSAGE_LENGTH,
} from "./edit-intent-prompt";
import {
  previewEdit,
  type TripEditRouteProvider,
} from "./trip-edit-service";

const aiEditTripSelect = {
  id: true,
  userId: true,
  startDate: true,
  durationDays: true,
  transport: true,
  updatedAt: true,
  days: {
    orderBy: [{ dayIndex: "asc" }, { id: "asc" }],
    select: {
      dayIndex: true,
      visits: {
        orderBy: [{ order: "asc" }, { id: "asc" }],
        select: {
          id: true,
          order: true,
          startMinute: true,
          plannedDurationMinutes: true,
          destination: { select: { id: true, name: true, visibility: true } },
        },
      },
    },
  },
} satisfies Prisma.TripSelect;

type OwnedTrip = Prisma.TripGetPayload<{ select: typeof aiEditTripSelect }>;

const eligibleDestinationSelect = {
  id: true,
  name: true,
  suggestedDurationMinutes: true,
} satisfies Prisma.DestinationSelect;

type EligibleDestination = Prisma.DestinationGetPayload<{
  select: typeof eligibleDestinationSelect;
}>;

export type AiEditServiceDependencies = {
  database: Database;
  llm: StructuredLlmClient;
  getRoute: TripEditRouteProvider;
  /** Injectable only to make generated visit identifiers deterministic in tests. */
  createVisitId?: () => string;
};

export type AiEditRequest = {
  baseRevision: string;
  message: string;
  resolution?: EditResolution;
};

export type AiEditClarificationResult = {
  status: "NEEDS_CLARIFICATION";
  intent: EditIntentResult;
  reason: EditIntentClarificationReason;
  clarification: EditClarification;
};

type AiEditClarificationDraft = Omit<AiEditClarificationResult, "clarification">;

export type AiEditProposalResult = {
  status: "PROPOSED";
  candidate: EditCandidate;
  intent: EditIntentResult;
  diff: EditCandidateDiff;
  validation: TripValidation;
};

export type AiEditServiceResult = AiEditClarificationResult | AiEditProposalResult;

function tripNotFound(): AppError {
  return new AppError("TRIP_NOT_FOUND", "Không tìm thấy chuyến đi.", 404);
}

function revisionConflict(): AppError {
  return new AppError(
    "TRIP_REVISION_CONFLICT",
    "Hành trình đã thay đổi. Hãy tải lại trước khi tạo đề xuất chỉnh sửa.",
    409,
  );
}

function clarification(
  intent: EditIntentResult,
  reason: EditIntentClarificationReason,
): AiEditClarificationDraft {
  return {
    status: "NEEDS_CLARIFICATION",
    intent: { ...intent, needsClarification: true, clarificationReason: reason },
    reason,
  };
}

function clarificationContext(
  trip: OwnedTrip,
  destinations: readonly EligibleDestination[],
): EditClarificationContext {
  return {
    visits: trip.days.flatMap((day) =>
      day.visits.map((visit) => ({
        visitId: visit.id,
        destinationId: visit.destination.id,
        destinationName:
          visit.destination.visibility === "VISIBLE"
            ? visit.destination.name
            : "Điểm đến đã ẩn",
        dayIndex: day.dayIndex,
        startMinute: visit.startMinute,
      })),
    ),
    eligibleDestinations: destinations.map((destination) => ({
      id: destination.id,
      name: destination.name,
    })),
  };
}

function completeClarification(
  draft: AiEditClarificationDraft,
  context: EditClarificationContext,
): AiEditClarificationResult {
  return {
    ...draft,
    clarification: createEditClarification(draft.reason, draft.intent, context),
  };
}

function applySuggestedAddDuration(
  intent: EditIntentResult,
  destinations: readonly EligibleDestination[],
): EditIntentResult {
  if (
    intent.intentType !== "ADD_VISIT" ||
    !intent.needsClarification ||
    intent.clarificationReason !== "MISSING_TIME" ||
    intent.params.durationMinutes !== null ||
    intent.params.startTime === null ||
    intent.destinationId === null
  ) {
    return intent;
  }
  const destination = destinations.find((item) => item.id === intent.destinationId);
  const suggestedDurationMinutes = destination?.suggestedDurationMinutes;
  if (
    suggestedDurationMinutes === null ||
    suggestedDurationMinutes === undefined ||
    !Number.isSafeInteger(suggestedDurationMinutes) ||
    suggestedDurationMinutes < 1 ||
    suggestedDurationMinutes > 1440
  ) {
    return intent;
  }

  // Task 272 correctly marks a missing duration for clarification. Here the
  // server may satisfy that one missing value using authoritative metadata.
  return {
    ...intent,
    params: { ...intent.params, durationMinutes: suggestedDurationMinutes },
    needsClarification: false,
    clarificationReason: null,
  };
}

function formatStartTime(startMinute: number): string {
  const hours = Math.floor(startMinute / 60).toString().padStart(2, "0");
  const minutes = (startMinute % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function parseStartMinute(value: string | null): number | null {
  if (value === null) return null;
  const match = /^(?:([01]\d|2[0-3])):([0-5]\d)$/u.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function candidateFromTrip(trip: OwnedTrip): EditCandidate {
  return createEditCandidate({
    startDate: trip.startDate,
    durationDays: trip.durationDays,
    transport: trip.transport,
    days: trip.days.map((day) => ({
      dayIndex: day.dayIndex,
      visits: day.visits.map((visit) => ({
        id: visit.id,
        destinationId: visit.destination.id,
        startMinute: visit.startMinute,
        plannedDurationMinutes: visit.plannedDurationMinutes,
        order: visit.order,
      })),
    })),
  });
}

async function readEligibleDestinations(
  database: Pick<Database, "destination">,
): Promise<EligibleDestination[]> {
  return database.destination.findMany({
    where: visibleDestinationWhere,
    select: eligibleDestinationSelect,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: MAX_EDIT_INTENT_DESTINATIONS,
  });
}

function operationClarificationReason(
  error: EditCandidateOperationError,
): EditIntentClarificationReason {
  switch (error.code) {
    case "DAY_NOT_FOUND":
      return "MISSING_DAY";
    case "VISIT_NOT_FOUND":
    case "VISIT_ID_CONFLICT":
      return "MISSING_TARGET";
    case "POSITION_INVALID":
    case "VISIT_LIMIT_EXCEEDED":
      return "OUT_OF_SCOPE";
  }
}

function applyVerifiedIntent(
  original: EditCandidate,
  intent: EditIntentResult,
  destinations: readonly EligibleDestination[],
  createVisitId: () => string,
): EditCandidate | AiEditClarificationDraft {
  if (intent.needsClarification) {
    return clarification(intent, intent.clarificationReason ?? "MISSING_TARGET");
  }

  const eligibleById = new Map(destinations.map((destination) => [destination.id, destination]));
  let candidate = original;

  try {
    switch (intent.intentType) {
      case "ADD_VISIT": {
        const destination = intent.destinationId
          ? eligibleById.get(intent.destinationId)
          : undefined;
        const startMinute = parseStartMinute(intent.params.startTime);
        if (!destination) return clarification(intent, "AMBIGUOUS_DESTINATION");
        if (intent.params.dayIndex === null) return clarification(intent, "MISSING_DAY");
        if (startMinute === null) return clarification(intent, "MISSING_TIME");
        const durationMinutes =
          intent.params.durationMinutes ?? destination.suggestedDurationMinutes;
        if (
          durationMinutes === null ||
          durationMinutes === undefined ||
          !Number.isSafeInteger(durationMinutes) ||
          durationMinutes < 1 ||
          durationMinutes > 1440
        ) {
          return clarification(intent, "MISSING_TIME");
        }
        candidate = addVisit(
          candidate,
          intent.params.dayIndex,
          {
            visitId: createVisitId(),
            destinationId: destination.id,
            startMinute,
            plannedDurationMinutes: durationMinutes,
          },
          intent.params.position ?? undefined,
        );
        break;
      }
      case "REMOVE_VISIT": {
        if (intent.targetVisitIds.length === 0) return clarification(intent, "MISSING_TARGET");
        for (const visitId of intent.targetVisitIds) candidate = removeVisit(candidate, visitId);
        break;
      }
      case "MOVE_VISIT": {
        const visitId = intent.targetVisitIds[0];
        if (!visitId) return clarification(intent, "MISSING_TARGET");
        if (intent.params.dayIndex === null) return clarification(intent, "MISSING_DAY");
        candidate = moveVisit(
          candidate,
          visitId,
          intent.params.dayIndex,
          intent.params.position ?? undefined,
        );
        break;
      }
      case "CHANGE_TIME": {
        const visitId = intent.targetVisitIds[0];
        const startMinute = parseStartMinute(intent.params.startTime);
        if (!visitId) return clarification(intent, "MISSING_TARGET");
        if (startMinute === null) return clarification(intent, "MISSING_TIME");
        candidate = setVisitTime(candidate, visitId, startMinute);
        break;
      }
      case "CHANGE_DURATION": {
        const visitId = intent.targetVisitIds[0];
        if (!visitId) return clarification(intent, "MISSING_TARGET");
        if (intent.params.durationMinutes === null) return clarification(intent, "MISSING_TIME");
        candidate = setVisitDuration(candidate, visitId, intent.params.durationMinutes);
        break;
      }
      case "REPLACE_VISIT": {
        const visitId = intent.targetVisitIds[0];
        const destination = intent.destinationId
          ? eligibleById.get(intent.destinationId)
          : undefined;
        if (!visitId) return clarification(intent, "MISSING_TARGET");
        if (!destination) return clarification(intent, "AMBIGUOUS_DESTINATION");
        const current = candidate.days
          .flatMap((day) => day.visits)
          .find((visit) => visit.visitId === visitId);
        if (!current) return clarification(intent, "MISSING_TARGET");
        candidate = replaceVisit(candidate, visitId, {
          destinationId: destination.id,
          startMinute: current.startMinute,
          plannedDurationMinutes: current.plannedDurationMinutes,
        });
        break;
      }
      case "UNSUPPORTED":
        return clarification(intent, "OUT_OF_SCOPE");
      case "UNCLEAR":
        return clarification(intent, intent.clarificationReason ?? "MISSING_TARGET");
    }
  } catch (error) {
    if (error instanceof EditCandidateOperationError) {
      return clarification(intent, operationClarificationReason(error));
    }
    if (error instanceof z.ZodError) {
      return clarification(intent, "MISSING_TIME");
    }
    throw error;
  }

  return candidate;
}

function withServerAffectedScope(
  intent: EditIntentResult,
  diff: EditCandidateDiff,
): EditIntentResult {
  const visitIds = [
    ...diff.added.map((visit) => visit.visitId),
    ...diff.removed.map((visit) => visit.visitId),
    ...diff.updated.map((visit) => visit.visitId),
  ] as VerifiedEditVisitId[];
  const dayIndexes = new Set<number>();
  for (const visit of diff.added) dayIndexes.add(visit.dayIndex);
  for (const visit of diff.removed) dayIndexes.add(visit.dayIndex);
  for (const visit of diff.updated) {
    dayIndexes.add(visit.before.dayIndex);
    dayIndexes.add(visit.after.dayIndex);
  }

  return {
    ...intent,
    affected: {
      visitIds: [...new Set(visitIds)],
      dayIndexes: [...dayIndexes].sort((left, right) => left - right),
    },
  };
}

function validateRequest(request: AiEditRequest): void {
  if ([...request.message].length > MAX_EDIT_INTENT_MESSAGE_LENGTH) {
    throw new AppError("VALIDATION_ERROR", "Yêu cầu chỉnh sửa quá dài.", 400, {
      fieldErrors: { message: `Tối đa ${MAX_EDIT_INTENT_MESSAGE_LENGTH} ký tự.` },
    });
  }
  if (!request.message.trim()) {
    throw new AppError("VALIDATION_ERROR", "Hãy nhập yêu cầu chỉnh sửa hành trình.", 400, {
      fieldErrors: { message: "Yêu cầu không được để trống." },
    });
  }
}

/** Build a verified AI proposal from an owner-scoped Trip snapshot without writing. */
export async function createAiEditProposal(
  tripId: string,
  userId: string,
  request: AiEditRequest,
  dependencies: AiEditServiceDependencies,
  timeReference: Date,
): Promise<AiEditServiceResult> {
  validateRequest(request);

  const trip = await dependencies.database.trip.findFirst({
    where: { id: tripId, userId },
    select: aiEditTripSelect,
  });
  if (!trip) throw tripNotFound();

  const baseRevision = trip.updatedAt.toISOString();
  if (request.baseRevision !== baseRevision) throw revisionConflict();

  const original = candidateFromTrip(trip);
  const destinations = await readEligibleDestinations(dependencies.database);
  const clarificationData = clarificationContext(trip, destinations);
  assertResolutionReferencesServerData(request.resolution, clarificationData);
  const recognizedIntent = await recognizeEditIntent({
    message: request.message,
    itinerary: trip.days.map((day) => ({
      dayIndex: day.dayIndex,
      visits: day.visits.map((visit) => ({
        visitId: visit.id,
        destinationName:
          visit.destination.visibility === "VISIBLE"
            ? visit.destination.name
            : "Điểm đến đã ẩn",
        startTime: formatStartTime(visit.startMinute),
        durationMinutes: visit.plannedDurationMinutes,
      })),
    })),
    eligibleDestinations: destinations.map((destination) => ({
      id: destination.id,
      name: destination.name,
    })),
  }, { llm: dependencies.llm });
  const resolvedIntent = resolveEditIntent(recognizedIntent, request.resolution, clarificationData);
  const intent = applySuggestedAddDuration(resolvedIntent, destinations);

  if (
    intent.needsClarification ||
    intent.intentType === "UNSUPPORTED" ||
    intent.intentType === "UNCLEAR"
  ) {
    return completeClarification(
      clarification(
        intent,
        intent.clarificationReason ??
          (intent.intentType === "UNSUPPORTED" ? "OUT_OF_SCOPE" : "MISSING_TARGET"),
      ),
      clarificationData,
    );
  }

  const changed = applyVerifiedIntent(
    original,
    intent,
    destinations,
    dependencies.createVisitId ?? randomUUID,
  );
  if ("status" in changed) return completeClarification(changed, clarificationData);

  const diff = diffEditCandidate(original, changed);
  const verifiedIntent = withServerAffectedScope(intent, diff);
  const validationPreview = await previewEdit(
    tripId,
    userId,
    request.baseRevision,
    changed,
    {
      database: dependencies.database,
      getRoute: async (input) => {
        try {
          return await dependencies.getRoute(input);
        } catch {
          // Route timeouts/failures are unavailable snapshots; the shared Validator
          // represents them as INSUFFICIENT_DATA instead of losing the proposal.
          return { kind: "unavailable" };
        }
      },
    },
    timeReference,
  );

  return {
    status: "PROPOSED",
    candidate: changed,
    intent: verifiedIntent,
    diff,
    validation: validationPreview.validation,
  };
}
