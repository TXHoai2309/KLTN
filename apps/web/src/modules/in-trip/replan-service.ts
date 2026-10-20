import { randomUUID } from "node:crypto";
import type { Database, Prisma } from "@KLTN/db";

import { AppError } from "@/server/http/app-error";
import { visibleDestinationWhere } from "../destination/destination-eligibility";
import type { StructuredLlmClient } from "../preference-extraction/preference-extraction-client";
import {
  assertResolutionReferencesServerData,
  type EditClarificationContext,
  type EditClarification,
  type EditResolution,
} from "../trip-edit/edit-clarification";
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
  type SavedTripForEdit,
} from "../trip-edit/edit-candidate";
import { MAX_REPLAN_CONTEXT_DESTINATIONS } from "./replan-prompt";
import { createInTripReplanIntent } from "./replan-ai-service";
import type {
  ReplanClarificationReason,
  VerifiedReplanOperation,
} from "./replan-contract";
import {
  applyMandatoryEndpoint,
  type MandatoryEndpoint,
  type MandatoryEndpointInfeasibleCode,
} from "./mandatory-endpoint";
import { createReplanClarification } from "./replan-clarification";
import type { InTripLocation } from "./in-trip-location";
import { preserveCompleted, ReplanCompletedVisitError } from "./preserve-completed";
import { splitCompletedRemaining } from "./split-trip";

export const inTripReplanTripSelect = {
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
      localDate: true,
      visits: {
        orderBy: [{ order: "asc" }, { id: "asc" }],
        select: {
          id: true,
          destinationId: true,
          order: true,
          startMinute: true,
          plannedDurationMinutes: true,
          destination: { select: { id: true, name: true, visibility: true, deletedAt: true } },
        },
      },
    },
  },
} satisfies Prisma.TripSelect;

type OwnedTrip = Prisma.TripGetPayload<{ select: typeof inTripReplanTripSelect }>;

const eligibleDestinationSelect = {
  id: true,
  name: true,
  latitude: true,
  longitude: true,
  suggestedDurationMinutes: true,
} satisfies Prisma.DestinationSelect;

type EligibleDestination = Prisma.DestinationGetPayload<{
  select: typeof eligibleDestinationSelect;
}>;

export type ReplanRequest = {
  baseRevision: string;
  location: InTripLocation;
  need: string;
  resolution?: EditResolution;
};

export type ReplanServiceDependencies = {
  database: Database;
  llm: StructuredLlmClient;
  /** Injected server clock; request bodies never supply the reference time. */
  now: () => Date;
  /** Injectable to keep generated candidate IDs deterministic in tests. */
  createVisitId?: () => string;
};

export type ReplanServiceResult =
  | { status: "ALL_COMPLETED" }
  | {
      status: "NEEDS_CLARIFICATION";
      clarificationReason: ReplanClarificationReason;
      clarification: EditClarification;
    }
  | {
      status: "PROPOSED";
      candidate: EditCandidate;
      diff: EditCandidateDiff;
      completedVisitIds: string[];
      mandatoryEndpoint: MandatoryEndpoint | null;
    };

function tripNotFound(): AppError {
  return new AppError("TRIP_NOT_FOUND", "Không tìm thấy chuyến đi.", 404);
}

function revisionConflict(): AppError {
  return new AppError(
    "TRIP_REVISION_CONFLICT",
    "Hành trình đã thay đổi. Hãy tải lại trước khi đề xuất lại.",
    409,
  );
}

function touchedCompleted(): AppError {
  return new AppError(
    "REPLAN_TOUCHED_COMPLETED",
    "Đề xuất có thay đổi lượt đã qua giờ theo lịch.",
    422,
  );
}

function invalidOperation(message = "Không thể áp dụng thao tác vào phương án hiện tại."): AppError {
  return new AppError("REPLAN_INVALID_OPERATION", message, 422);
}

const ENDPOINT_INFEASIBLE_MESSAGES: Record<MandatoryEndpointInfeasibleCode, string> = {
  REPLAN_ENDPOINT_INELIGIBLE: "Điểm kết thúc bắt buộc hiện không khả dụng.",
  REPLAN_ENDPOINT_ALREADY_COMPLETED: "Điểm kết thúc bắt buộc đã qua giờ theo lịch.",
  REPLAN_ENDPOINT_DEADLINE_INFEASIBLE: "Thời hạn phải nằm trong thời gian còn lại của hôm nay.",
  REPLAN_ENDPOINT_NOT_IN_CANDIDATE: "Đề xuất chưa có điểm bắt buộc để làm điểm cuối.",
  REPLAN_ENDPOINT_CANNOT_BE_LAST: "Không thể đưa điểm bắt buộc xuống cuối phương án.",
};

function endpointInfeasible(code: MandatoryEndpointInfeasibleCode): AppError {
  return new AppError(code, ENDPOINT_INFEASIBLE_MESSAGES[code], 422);
}

function savedTripForEdit(trip: OwnedTrip): SavedTripForEdit {
  return {
    startDate: trip.startDate,
    durationDays: trip.durationDays,
    transport: trip.transport,
    days: trip.days.map((day) => ({
      dayIndex: day.dayIndex,
      visits: day.visits.map((visit) => ({
        id: visit.id,
        destinationId: visit.destinationId,
        startMinute: visit.startMinute,
        plannedDurationMinutes: visit.plannedDurationMinutes,
        order: visit.order,
      })),
    })),
  };
}

function candidateFromTrip(trip: OwnedTrip): EditCandidate {
  return createEditCandidate(savedTripForEdit(trip));
}

function formatStartTime(startMinute: number): string {
  const hours = Math.floor(startMinute / 60).toString().padStart(2, "0");
  const minutes = (startMinute % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function parseStartMinute(value: string | null): number | null {
  if (value === null) return null;
  const match = /^(?:([01]\d|2[0-3])):([0-5]\d)$/u.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function clarificationContext(
  trip: OwnedTrip,
  remainingVisitIds: ReadonlySet<string>,
  eligibleDestinations: readonly EligibleDestination[],
): EditClarificationContext {
  return {
    visits: trip.days.flatMap((day) =>
      day.visits.flatMap((visit) =>
        remainingVisitIds.has(visit.id)
          ? [{
              visitId: visit.id,
              destinationId: visit.destination.id,
              destinationName:
                visit.destination.visibility === "VISIBLE" && !visit.destination.deletedAt
                  ? visit.destination.name
                  : "Điểm đến không còn khả dụng",
              dayIndex: day.dayIndex,
              startMinute: visit.startMinute,
            }]
          : [],
      ),
    ),
    eligibleDestinations: eligibleDestinations.map(({ id, name }) => ({ id, name })),
  };
}

function applyOperations(
  original: EditCandidate,
  operations: readonly VerifiedReplanOperation[],
  destinations: readonly EligibleDestination[],
  createVisitId: () => string,
): EditCandidate {
  const destinationById = new Map(destinations.map((destination) => [destination.id, destination]));
  let candidate = original;

  for (const operation of operations) {
    switch (operation.operationType) {
      case "ADD_VISIT": {
        const destinationId = operation.destinationId;
        const dayIndex = operation.params.dayIndex;
        const startMinute = parseStartMinute(operation.params.startTime);
        const duration = operation.params.durationMinutes;
        if (
          destinationId === null ||
          !destinationById.has(destinationId) ||
          dayIndex === null ||
          startMinute === null ||
          duration === null
        ) {
          throw invalidOperation();
        }
        candidate = addVisit(
          candidate,
          dayIndex,
          {
            visitId: createVisitId(),
            destinationId,
            startMinute,
            plannedDurationMinutes: duration,
          },
          operation.params.position ?? undefined,
        );
        break;
      }
      case "REMOVE_VISIT": {
        if (operation.targetVisitId === null) throw invalidOperation();
        candidate = removeVisit(candidate, operation.targetVisitId);
        break;
      }
      case "MOVE_VISIT": {
        if (operation.targetVisitId === null || operation.params.dayIndex === null) {
          throw invalidOperation();
        }
        candidate = moveVisit(
          candidate,
          operation.targetVisitId,
          operation.params.dayIndex,
          operation.params.position ?? undefined,
        );
        break;
      }
      case "CHANGE_TIME": {
        const startMinute = parseStartMinute(operation.params.startTime);
        if (operation.targetVisitId === null || startMinute === null) {
          throw invalidOperation();
        }
        candidate = setVisitTime(candidate, operation.targetVisitId, startMinute);
        break;
      }
      case "CHANGE_DURATION": {
        if (
          operation.targetVisitId === null ||
          operation.params.durationMinutes === null
        ) {
          throw invalidOperation();
        }
        candidate = setVisitDuration(
          candidate,
          operation.targetVisitId,
          operation.params.durationMinutes,
        );
        break;
      }
      case "REPLACE_VISIT": {
        const destinationId = operation.destinationId;
        const current = operation.targetVisitId === null
          ? undefined
          : candidate.days.flatMap((day) => day.visits).find(
              (visit) => visit.visitId === operation.targetVisitId,
            );
        if (
          !current ||
          destinationId === null ||
          !destinationById.has(destinationId)
        ) {
          throw invalidOperation();
        }
        candidate = replaceVisit(candidate, current.visitId, {
          destinationId,
          startMinute: current.startMinute,
          plannedDurationMinutes: current.plannedDurationMinutes,
        });
        break;
      }
    }
  }

  return candidate;
}

function operationFailure(error: unknown): AppError {
  if (error instanceof EditCandidateOperationError) {
    if (error.code === "VISIT_NOT_FOUND" || error.code === "DAY_NOT_FOUND") {
      return new AppError("VALIDATION_ERROR", "Thao tác không khớp với phần hành trình còn lại.", 400);
    }
    return invalidOperation();
  }
  return error instanceof AppError ? error : invalidOperation();
}

/** Create a read-only in-trip proposal from an owner-scoped Trip snapshot. */
export async function replanTrip(
  tripId: string,
  userId: string,
  request: ReplanRequest,
  dependencies: ReplanServiceDependencies,
): Promise<ReplanServiceResult> {
  const trip = await dependencies.database.trip.findFirst({
    where: { id: tripId, userId },
    select: inTripReplanTripSelect,
  });
  if (!trip) throw tripNotFound();

  const baseRevision = trip.updatedAt.toISOString();
  if (request.baseRevision !== baseRevision) throw revisionConflict();

  // Capture time only after ownership/revision checks, from the server clock.
  const now = dependencies.now();
  const persisted = savedTripForEdit(trip);
  const split = splitCompletedRemaining(
    {
      startDate: trip.startDate,
      durationDays: trip.durationDays,
      days: trip.days.map((day) => ({
        dayIndex: day.dayIndex,
        localDate: day.localDate,
        visits: day.visits.map((visit) => ({
          id: visit.id,
          destinationId: visit.destinationId,
          startMinute: visit.startMinute,
          plannedDurationMinutes: visit.plannedDurationMinutes,
          order: visit.order,
        })),
      })),
    },
    now,
  );

  if (split.status === "ALL_COMPLETED") return { status: "ALL_COMPLETED" };

  const original = candidateFromTrip(trip);
  const remainingIds = new Set(split.remaining.map((visit) => visit.visitId));
  const destinations = await dependencies.database.destination.findMany({
    where: visibleDestinationWhere,
    select: eligibleDestinationSelect,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: MAX_REPLAN_CONTEXT_DESTINATIONS,
  });

  const context = clarificationContext(trip, remainingIds, destinations);
  assertResolutionReferencesServerData(request.resolution, context);

  const intent = await createInTripReplanIntent(
    {
      need: request.need,
      location: request.location,
      completedVisitIds: split.completed.map((visit) => visit.visitId),
      remainingVisits: split.remaining.map((visit) => {
        const persistedVisit = trip.days
          .flatMap((day) => day.visits)
          .find((candidateVisit) => candidateVisit.id === visit.visitId);
        return {
          visitId: visit.visitId,
          destinationName:
            persistedVisit?.destination.visibility === "VISIBLE" && !persistedVisit.destination.deletedAt
              ? persistedVisit.destination.name
              : "Điểm đến không còn khả dụng",
          dayIndex: visit.dayIndex,
          startTime: formatStartTime(visit.startMinute),
          durationMinutes: visit.plannedDurationMinutes,
        };
      }),
      dayIndexes: trip.days.map((day) => day.dayIndex),
      remainingMinutesToday: split.remainingMinutesToday,
      eligibleDestinations: destinations.map((destination) => ({
        id: destination.id,
        name: destination.name,
        latitude: destination.latitude,
        longitude: destination.longitude,
      })),
      ...(request.resolution !== undefined ? { resolution: request.resolution } : {}),
    },
    { llm: dependencies.llm },
  );

  if (intent.status === "NEEDS_CLARIFICATION") {
    return {
      status: "NEEDS_CLARIFICATION",
      clarificationReason: intent.clarificationReason,
      clarification: createReplanClarification(intent.clarificationReason, context),
    };
  }
  if (intent.status === "REJECTED_COMPLETED_VISIT") throw touchedCompleted();

  let candidate: EditCandidate;
  try {
    candidate = intent.intent.operations.length === 0
      ? original
      : applyOperations(
          original,
          intent.intent.operations,
          destinations,
          dependencies.createVisitId ?? randomUUID,
        );
  } catch (error) {
    throw operationFailure(error);
  }

  let mandatoryEndpoint: MandatoryEndpoint | null = null;
  if (intent.intent.mandatoryEndpoint !== null) {
    const endpointResult = applyMandatoryEndpoint({
      verifiedEndpoint: intent.intent.mandatoryEndpoint,
      candidate,
      completedVisitIds: split.completed.map((visit) => visit.visitId),
      eligibleDestinationIds: destinations.map((destination) => destination.id),
      now,
      remainingMinutesToday: split.remainingMinutesToday,
    });
    if (endpointResult.status === "NEEDS_CLARIFICATION") {
      return {
        status: "NEEDS_CLARIFICATION",
        clarificationReason: endpointResult.reason,
        clarification: createReplanClarification(endpointResult.reason, context),
      };
    }
    if (endpointResult.status === "INFEASIBLE") {
      throw endpointInfeasible(endpointResult.code);
    }
    candidate = endpointResult.candidate;
    mandatoryEndpoint = endpointResult.mandatoryEndpoint;
  } else if (intent.intent.operations.length === 0) {
    return {
      status: "NEEDS_CLARIFICATION",
      clarificationReason: "MISSING_TARGET",
      clarification: createReplanClarification("MISSING_TARGET", context),
    };
  }

  try {
    preserveCompleted(persisted, candidate, split.completed.map((visit) => visit.visitId));
  } catch (error) {
    if (error instanceof ReplanCompletedVisitError) throw touchedCompleted();
    throw error;
  }

  return {
    status: "PROPOSED",
    candidate,
    diff: diffEditCandidate(original, candidate),
    completedVisitIds: split.completed.map((visit) => visit.visitId),
    mandatoryEndpoint,
  };
}
