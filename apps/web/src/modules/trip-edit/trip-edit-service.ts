import type { Database, Prisma } from "@KLTN/db";

import { requireTraveler } from "@/server/auth/require-traveler";
import type { AuthorizationDependencies } from "@/server/authorization/guard";
import { AppError } from "@/server/http/app-error";
import { findEligibleDestinationIds, visibleDestinationWhere } from "../destination/destination-eligibility";
import { tripDayDate } from "../trip-validation/trip-proposal-contract";
import type { TravelRoute } from "../trip-validation/stadia-route";
import {
  validateItinerary,
  type RouteSnapshot,
  type TripValidation,
  type ValidationVisit,
} from "../trip-validation/trip-validation";
import { createEditCandidate, type EditCandidate } from "./edit-candidate";

const destinationSelect = {
  id: true,
  latitude: true,
  longitude: true,
  minimumDurationMinutes: true,
  openingDays: {
    select: {
      dayOfWeek: true,
      status: true,
      intervals: { select: { opensAtMinute: true, closesAtMinute: true } },
    },
  },
} satisfies Prisma.DestinationSelect;

type CanonicalDestination = Prisma.DestinationGetPayload<{
  select: typeof destinationSelect;
}>;

export type TripEditRouteProvider = (input: {
  origin: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
  vehicle: EditCandidate["transport"];
}) => Promise<TravelRoute>;

export type TripEditServiceDependencies = {
  database: Database;
  getRoute: TripEditRouteProvider;
};

export type TripEditPageDependencies = AuthorizationDependencies & { database: Database };

export type TripEditPageData = {
  tripId: string;
  baseRevision: string;
  candidate: EditCandidate;
  destinationLabels: Record<string, string>;
};

export type PreviewEditResult = {
  baseRevision: string;
  candidate: EditCandidate;
  validation: TripValidation;
  eligibleForConfirmation: boolean;
};

export const tripEditBaseSelect = {
  id: true,
  userId: true,
  startDate: true,
  durationDays: true,
  transport: true,
  updatedAt: true,
} satisfies Prisma.TripSelect;

export type TripEditBase = Prisma.TripGetPayload<{
  select: typeof tripEditBaseSelect;
}>;

const tripEditPageSelect = {
  id: true,
  startDate: true,
  durationDays: true,
  transport: true,
  updatedAt: true,
  days: {
    orderBy: [{ dayIndex: "asc" }, { id: "asc" }],
    select: {
      id: true,
      dayIndex: true,
      visits: {
        orderBy: [{ order: "asc" }, { id: "asc" }],
        select: {
          id: true,
          order: true,
          startMinute: true,
          plannedDurationMinutes: true,
          destination: { select: { id: true, name: true, area: true, visibility: true, deletedAt: true } },
        },
      },
    },
  },
} satisfies Prisma.TripSelect;

/** Read the edit candidate and its revision from the same owned-trip snapshot. */
export async function getTripForEdit(
  headers: Headers,
  tripId: string,
  dependencies: TripEditPageDependencies,
): Promise<TripEditPageData> {
  const actor = await requireTraveler(headers, dependencies);
  const trip = await dependencies.database.trip.findFirst({
    where: { id: tripId, userId: actor.userId },
    select: tripEditPageSelect,
  });
  if (!trip) throw new AppError("TRIP_NOT_FOUND", "Không tìm thấy chuyến đi.", 404);

  const candidate = createEditCandidate({
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

  return {
    tripId: trip.id,
    baseRevision: trip.updatedAt.toISOString(),
    candidate,
    destinationLabels: Object.fromEntries(trip.days.flatMap((day) =>
      day.visits.map((visit) => [
        visit.destination.id,
        visit.destination.visibility === "VISIBLE" && !visit.destination.deletedAt
          ? `${visit.destination.name} · ${visit.destination.area}`
          : "Điểm đến không còn khả dụng",
      ]),
    )),
  };
}

function invalidCandidate(): AppError {
  return new AppError("VALIDATION_ERROR", "Phương án chỉnh sửa không hợp lệ.", 400, {
    fieldErrors: {
      candidate: "Thông tin chuyến đi trong phương án phải khớp với hành trình đã lưu.",
    },
  });
}

export function assertCandidateMatchesTrip(
  trip: TripEditBase,
  candidate: EditCandidate,
): void {
  const tripStartDate = trip.startDate.toISOString().slice(0, 10);
  if (
    candidate.startDate !== tripStartDate ||
    candidate.durationDays !== trip.durationDays ||
    candidate.transport !== trip.transport
  ) {
    throw invalidCandidate();
  }
}

function unavailableDestination(): AppError {
  return new AppError(
    "DESTINATION_UNAVAILABLE",
    "Có điểm đến không còn công khai hoặc không tồn tại.",
    422,
  );
}

async function readEligibleDestinations(
  candidate: EditCandidate,
  database: Pick<Database, "destination">,
): Promise<Map<string, CanonicalDestination>> {
  const ids = [
    ...new Set(candidate.days.flatMap((day) => day.visits.map((visit) => visit.destinationId))),
  ];
  const eligibleIds = await findEligibleDestinationIds(ids, database);
  if (eligibleIds.length !== ids.length) throw unavailableDestination();
  if (ids.length === 0) return new Map();

  // Re-read the authoritative validation fields behind the same shared visibility predicate.
  const rows = await database.destination.findMany({
    where: { ...visibleDestinationWhere, id: { in: ids } },
    select: destinationSelect,
  });
  if (rows.length !== ids.length) throw unavailableDestination();
  return new Map(rows.map((row) => [row.id, row]));
}

function toValidationVisits(
  candidate: EditCandidate,
  destinations: Map<string, CanonicalDestination>,
): ValidationVisit[] {
  return candidate.days.flatMap((day) =>
    day.visits.map((visit) => {
      const destination = destinations.get(visit.destinationId);
      if (!destination) throw unavailableDestination();
      return {
        visitId: visit.visitId,
        dayIndex: day.dayIndex,
        order: visit.order,
        localDate: tripDayDate(candidate.startDate, day.dayIndex),
        startMinute: visit.startMinute,
        plannedDurationMinutes: visit.plannedDurationMinutes,
        minimumDurationMinutes: destination.minimumDurationMinutes,
        openingDays: destination.openingDays,
      };
    }),
  );
}

function coordinates(destination: CanonicalDestination) {
  return { latitude: destination.latitude, longitude: destination.longitude };
}

async function snapshotRoutes(
  candidate: EditCandidate,
  destinations: Map<string, CanonicalDestination>,
  getRoute: TripEditRouteProvider,
): Promise<RouteSnapshot[]> {
  const legs = candidate.days.flatMap((day) =>
    day.visits.slice(1).map((nextVisit, index) => ({
      from: day.visits[index]!,
      to: nextVisit,
    })),
  );

  return Promise.all(
    legs.map(async ({ from, to }) => {
      const fromDestination = destinations.get(from.destinationId);
      const toDestination = destinations.get(to.destinationId);
      if (!fromDestination || !toDestination) throw unavailableDestination();
      const route = await getRoute({
        origin: coordinates(fromDestination),
        destination: coordinates(toDestination),
        vehicle: candidate.transport,
      });
      return {
        fromVisitId: from.visitId,
        toVisitId: to.visitId,
        route:
          route.kind === "ok"
            ? { kind: "ok" as const, durationSeconds: route.durationSeconds }
            : { kind: "unavailable" as const },
      };
    }),
  );
}

/** Shared authoritative destination and Validator pass used by preview and apply. */
export async function validateEditCandidate(
  candidate: EditCandidate,
  dependencies: TripEditServiceDependencies,
  timeReference: Date,
): Promise<TripValidation> {
  const destinations = await readEligibleDestinations(candidate, dependencies.database);
  const validationVisits = toValidationVisits(candidate, destinations);
  const routes = await snapshotRoutes(candidate, destinations, dependencies.getRoute);
  return validateItinerary(validationVisits, routes, timeReference);
}

/** Preview an unpersisted candidate against current owned-trip and destination data. */
export async function previewEdit(
  tripId: string,
  userId: string,
  baseRevision: string,
  candidate: EditCandidate,
  dependencies: TripEditServiceDependencies,
  timeReference: Date,
): Promise<PreviewEditResult> {
  const trip = await dependencies.database.trip.findFirst({
    where: { id: tripId, userId },
    select: tripEditBaseSelect,
  });
  if (!trip) throw new AppError("TRIP_NOT_FOUND", "Không tìm thấy chuyến đi.", 404);

  const currentRevision = trip.updatedAt.toISOString();
  if (baseRevision !== currentRevision) {
    throw new AppError(
      "TRIP_REVISION_CONFLICT",
      "Hành trình đã thay đổi. Hãy tải lại trước khi xem trước chỉnh sửa.",
      409,
    );
  }

  assertCandidateMatchesTrip(trip, candidate);
  const validation = await validateEditCandidate(candidate, dependencies, timeReference);

  return {
    baseRevision: currentRevision,
    candidate,
    validation,
    eligibleForConfirmation: validation.canConfirm,
  };
}
