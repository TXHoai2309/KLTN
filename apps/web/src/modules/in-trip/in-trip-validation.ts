import type { Database, Prisma } from "@KLTN/db";

import { AppError } from "@/server/http/app-error";
import { findEligibleDestinationIds, visibleDestinationWhere } from "../destination/destination-eligibility";
import { type EditCandidate, type SavedTripForEdit } from "../trip-edit/edit-candidate";
import {
  assertCandidateMatchesTrip,
  previewEdit,
  type PreviewEditResult,
  type TripEditRouteProvider,
} from "../trip-edit/trip-edit-service";
import { tripDayDate } from "../trip-validation/trip-proposal-contract";
import {
  validateInTripContext,
  type InTripEndpointConstraint,
  type InTripOriginLeg,
  type TripValidation,
} from "../trip-validation/trip-validation";
import type { MandatoryEndpoint } from "./mandatory-endpoint";
import type { InTripLocation } from "./in-trip-location";
import { preserveCompleted, ReplanCompletedVisitError } from "./preserve-completed";
import { splitCompletedRemaining } from "./split-trip";

const inTripPreviewTripSelect = {
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
          startMinute: true,
          plannedDurationMinutes: true,
          order: true,
        },
      },
    },
  },
} satisfies Prisma.TripSelect;

type OwnedTrip = Prisma.TripGetPayload<{ select: typeof inTripPreviewTripSelect }>;

export type InTripPreviewRequest = {
  baseRevision: string;
  candidate: EditCandidate;
  location: InTripLocation;
  mandatoryEndpoint?: MandatoryEndpoint | null;
};

export type InTripPreviewDependencies = {
  database: Database;
  getRoute: TripEditRouteProvider;
  now: () => Date;
  /** The production path uses US-32 previewEdit; tests can supply a fake Validator. */
  preview?: typeof previewEdit;
  routeTimeoutMs?: number;
};

export type InTripPreviewResult = {
  validation: TripValidation;
  checkedAt: string;
  completedVisitIds: string[];
};

function savedTrip(trip: OwnedTrip): SavedTripForEdit {
  return {
    startDate: trip.startDate,
    durationDays: trip.durationDays,
    transport: trip.transport,
    days: trip.days.map((day) => ({
      dayIndex: day.dayIndex,
      visits: day.visits.map((visit) => ({ ...visit })),
    })),
  };
}

function positionedCandidateVisits(candidate: EditCandidate) {
  return candidate.days.flatMap((day) =>
    day.visits.map((visit) => ({ ...visit, dayIndex: day.dayIndex })),
  );
}

function endpointConstraint(
  endpoint: MandatoryEndpoint | null | undefined,
  remaining: ReturnType<typeof positionedCandidateVisits>,
  candidate: EditCandidate,
): InTripEndpointConstraint | null {
  if (!endpoint) return null;
  const last = remaining.at(-1);
  if (!last || last.destinationId !== endpoint.destinationId) {
    throw new AppError(
      "MANDATORY_ENDPOINT_MISMATCH",
      "Điểm kết thúc bắt buộc phải là lượt chưa hoàn thành cuối cùng.",
      422,
    );
  }
  const localDate = tripDayDate(candidate.startDate, last.dayIndex);
  if (localDate === null) {
    throw new AppError("VALIDATION_ERROR", "Phương án thiếu ngày bắt đầu.", 400);
  }
  return { visitId: last.visitId, localDate, startMinute: last.startMinute, deadline: endpoint.deadline };
}

function boundedRoute(dependencies: InTripPreviewDependencies): TripEditRouteProvider {
  const timeoutMs = dependencies.routeTimeoutMs ?? 10_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10_000) {
    throw new RangeError("Invalid route timeout");
  }
  return async (input) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        dependencies.getRoute(input),
        new Promise<Awaited<ReturnType<TripEditRouteProvider>>>((resolve) => {
          timer = setTimeout(() => resolve({ kind: "unavailable" }), timeoutMs);
        }),
      ]);
    } catch {
      return { kind: "unavailable" };
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}

/** Validate one private proposal without persisting the candidate or location. */
export async function previewInTrip(
  tripId: string,
  userId: string,
  request: InTripPreviewRequest,
  dependencies: InTripPreviewDependencies,
): Promise<InTripPreviewResult> {
  const trip = await dependencies.database.trip.findFirst({
    where: { id: tripId, userId },
    select: inTripPreviewTripSelect,
  });
  if (!trip) throw new AppError("TRIP_NOT_FOUND", "Không tìm thấy chuyến đi.", 404);
  if (trip.updatedAt.toISOString() !== request.baseRevision) {
    throw new AppError("TRIP_REVISION_CONFLICT", "Hành trình đã thay đổi. Hãy tải lại.", 409);
  }
  assertCandidateMatchesTrip(trip, request.candidate);

  const now = dependencies.now();
  const original = savedTrip(trip);
  const split = splitCompletedRemaining({
    startDate: trip.startDate,
    durationDays: trip.durationDays,
    days: trip.days.map((day) => ({
      dayIndex: day.dayIndex,
      localDate: day.localDate,
      visits: day.visits,
    })),
  }, now);
  const completedVisitIds = split.completed.map((visit) => visit.visitId);
  if (split.status === "ALL_COMPLETED") {
    throw new AppError("ALL_COMPLETED", "Chuyến đi không còn lượt nào để đề xuất lại.", 422);
  }
  try {
    preserveCompleted(original, request.candidate, completedVisitIds);
  } catch (error) {
    if (error instanceof ReplanCompletedVisitError) {
      throw new AppError("COMPLETED_VISIT_CHANGED", "Phương án có thay đổi lượt đã qua giờ theo lịch.", 422);
    }
    throw error;
  }

  const remaining = positionedCandidateVisits(request.candidate).filter(
    (visit) => !completedVisitIds.includes(visit.visitId),
  );
  if (remaining.length === 0) {
    throw new AppError("ALL_COMPLETED", "Phương án không còn lượt nào để kiểm tra.", 422);
  }
  const ids = [...new Set(positionedCandidateVisits(request.candidate).map((visit) => visit.destinationId))];
  const eligibleIds = await findEligibleDestinationIds(ids, dependencies.database);
  if (eligibleIds.length !== ids.length) {
    throw new AppError("DESTINATION_UNAVAILABLE", "Có điểm đến không còn công khai hoặc không tồn tại.", 422);
  }
  const endpoint = endpointConstraint(request.mandatoryEndpoint, remaining, request.candidate);

  const safeGetRoute = boundedRoute(dependencies);
  const first = remaining[0];
  let originLeg: InTripOriginLeg | null = null;
  if (first) {
    const destination = await dependencies.database.destination.findFirst({
      where: { ...visibleDestinationWhere, id: first.destinationId },
      select: { latitude: true, longitude: true },
    });
    if (!destination) {
      throw new AppError("DESTINATION_UNAVAILABLE", "Có điểm đến không còn công khai hoặc không tồn tại.", 422);
    }
    const route = await safeGetRoute({
      origin: { latitude: request.location.latitude, longitude: request.location.longitude },
      destination: { latitude: destination.latitude, longitude: destination.longitude },
      vehicle: request.candidate.transport,
    });
    const localDate = tripDayDate(request.candidate.startDate, first.dayIndex);
    if (localDate === null) {
      throw new AppError("VALIDATION_ERROR", "Phương án thiếu ngày bắt đầu.", 400);
    }
    originLeg = {
      toVisitId: first.visitId,
      localDate,
      startMinute: first.startMinute,
      route: route.kind === "ok"
        ? { kind: "ok", durationSeconds: route.durationSeconds }
        : { kind: "unavailable" },
    };
  }

  const preview: PreviewEditResult = await (dependencies.preview ?? previewEdit)(
    tripId,
    userId,
    request.baseRevision,
    request.candidate,
    { database: dependencies.database, getRoute: safeGetRoute },
    now,
  );
  const validation = validateInTripContext(preview.validation, {
    now,
    originLeg,
    mandatoryEndpoint: endpoint,
  });
  return { validation, checkedAt: now.toISOString(), completedVisitIds };
}
