import type { Database, Prisma } from "@KLTN/db";

import { requireTraveler } from "../../server/auth/require-traveler";
import { assertJourneyCoverage, assertJourneyReady } from "../trip-origin/trip-origin-service";
import { freshJourneyValidation, revalidateJourneySnapshot } from "../trip-origin/journey-save-validation";
import { journeyRouteSchema } from "../trip-origin/journey-route-contract";
import type { RouteProvider } from "../trip-planner/planner-routes";
import { missingJourneyFields } from "../trip-origin/trip-origin-contract";
import { journeyVisitFingerprint } from "../trip-origin/journey-saved-contract";
import { AppError } from "../../server/http/app-error";
import { executeIdempotentWrite, preflightIdempotentReplay } from "../../server/http/idempotency";
import { visibleDestinationWhere } from "../destination/destination-eligibility";
import { tripRequirementInputSchema } from "../trip-requirement/trip-requirement-contract";
import { assertStartDateForFinalConfirmation } from "../trip-requirement/trip-requirement-readiness";
import type { TravelRoute } from "../trip-validation/stadia-route";
import { tripDayDate, type TripProposal } from "../trip-validation/trip-proposal-contract";
import { validateItinerary, type RouteSnapshot, type TripValidation, type ValidationVisit } from "../trip-validation/trip-validation";
import { tripSaveRequestSchema, type TripSaveRequest } from "./trip-save-contract";

export type TripSaveDependencies = {
  database: Database;
  resolveSession: (headers: Headers) => Promise<{ user: { id: string; role?: string } } | null>;
  getRoute: (input: { origin: { latitude: number; longitude: number }; destination: { latitude: number; longitude: number }; vehicle: TripSaveRequest["proposal"]["transport"] }) => Promise<TravelRoute>;
  /** Conversational planner explicitly includes the transfer into the next day. */
  interdayDepartureMinute?: number;
  journeyRoutes?: RouteProvider;
};

const destinationSelect = {
  id: true, latitude: true, longitude: true, minimumDurationMinutes: true,
  openingDays: { select: { dayOfWeek: true, status: true, intervals: { select: { opensAtMinute: true, closesAtMinute: true } } } },
} satisfies Prisma.DestinationSelect;
type CanonicalDestination = Prisma.DestinationGetPayload<{ select: typeof destinationSelect }>;

async function readDestinations(database: Pick<Database, "destination">, proposal: TripProposal) {
  const ids = [...new Set(proposal.days.flatMap(day => day.visits.map(visit => visit.destinationId)))];
  const rows = await database.destination.findMany({ where: { ...visibleDestinationWhere, id: { in: ids } }, select: destinationSelect });
  if (rows.length !== ids.length) throw new AppError("DESTINATION_UNAVAILABLE", "Có điểm đến không còn công khai hoặc không tồn tại.", 422);
  return new Map(rows.map(row => [row.id, row]));
}

function toVisits(proposal: TripProposal, destinations: Map<string, CanonicalDestination>): ValidationVisit[] {
  return proposal.days.flatMap(day => day.visits.map(visit => {
    const destination = destinations.get(visit.destinationId)!;
    return {
      visitId: `day-${day.dayIndex}-visit-${visit.order}`,
      dayIndex: day.dayIndex, order: visit.order,
      localDate: tripDayDate(proposal.startDate, day.dayIndex),
      startMinute: visit.startMinute, plannedDurationMinutes: visit.plannedDurationMinutes,
      minimumDurationMinutes: destination.minimumDurationMinutes,
      openingDays: destination.openingDays,
    };
  }));
}

type FixedRoute = RouteSnapshot & { fromDestinationId: string; toDestinationId: string; fromCoordinates: string; toCoordinates: string };
const coordinates = (row: CanonicalDestination) => `${row.latitude},${row.longitude}`;

function validRoutes(destinations: Map<string, CanonicalDestination>, snapshots: readonly FixedRoute[]): RouteSnapshot[] {
  return snapshots.filter(snapshot => {
    const from = destinations.get(snapshot.fromDestinationId);
    const to = destinations.get(snapshot.toDestinationId);
    return from && to && coordinates(from) === snapshot.fromCoordinates && coordinates(to) === snapshot.toCoordinates;
  });
}

async function snapshotRoutes(proposal: TripProposal, destinations: Map<string, CanonicalDestination>, getRoute: TripSaveDependencies["getRoute"], includeInterday = false): Promise<FixedRoute[]> {
  const visits = proposal.days.flatMap(day => day.visits.map(visit => ({ dayIndex: day.dayIndex, visit })));
  const legs = visits.slice(1).flatMap((to, index) => {
    const from = visits[index]!;
    return includeInterday || from.dayIndex === to.dayIndex ? [{ fromDay: from.dayIndex, toDay: to.dayIndex, from: from.visit, to: to.visit }] : [];
  });
  return Promise.all(legs.map(async leg => {
    const from = destinations.get(leg.from.destinationId)!;
    const to = destinations.get(leg.to.destinationId)!;
    const route = await getRoute({ origin: { latitude: from.latitude, longitude: from.longitude }, destination: { latitude: to.latitude, longitude: to.longitude }, vehicle: proposal.transport });
    return {
      fromVisitId: `day-${leg.fromDay}-visit-${leg.from.order}`,
      toVisitId: `day-${leg.toDay}-visit-${leg.to.order}`,
      fromDestinationId: from.id, toDestinationId: to.id,
      fromCoordinates: coordinates(from), toCoordinates: coordinates(to), route,
    };
  }));
}

function assertCanSave(validation: TripValidation): void {
  if (!validation.canConfirm) throw new AppError("TRIP_VALIDATION_FAILED", "Hành trình chưa đủ điều kiện xác nhận và lưu.", 422, { validation });
}

function journeyProvider(deps: TripSaveDependencies): RouteProvider {
  if (deps.journeyRoutes) return deps.journeyRoutes;
  const coordinateRoute: NonNullable<RouteProvider["coordinateRoute"]> = async pair => {
    const route = await deps.getRoute({ origin: pair.from, destination: pair.to, vehicle: pair.transport });
    const parsed = route.kind === "ok" ? journeyRouteSchema.safeParse({ status: "VERIFIED", reason: null, durationSeconds: route.durationSeconds, distanceMeters: route.distanceMeters ?? null, provider: "STADIA_MAPS", ...(route.geometry ? { geometry: route.geometry } : {}) }) : null;
    return parsed?.success ? parsed.data : { status: "INSUFFICIENT_DATA", reason: "UNAVAILABLE", durationSeconds: null, distanceMeters: null, provider: null };
  };
  return { coordinateRoute, route: async (pair, signal) => ({ ...await coordinateRoute(pair, signal), fromDestinationId: pair.from.id, toDestinationId: pair.to.id }) };
}

/** Read-only preview. The save boundary repeats these checks against current data. */
export async function previewTripValidation(headers: Headers, proposal: TripProposal, dependencies: TripSaveDependencies, timeReference: Date): Promise<TripValidation> {
  await requireTraveler(headers, dependencies);
  assertJourneyCoverage(proposal.journey);
  const destinations = await readDestinations(dependencies.database, proposal);
  if (missingJourneyFields(proposal.journey, proposal.days.at(-1)?.visits.length === 0).length === 0) {
    return (await freshJourneyValidation(proposal, destinations, journeyProvider(dependencies), timeReference)).validation;
  }
  const snapshots = await snapshotRoutes(proposal, destinations, dependencies.getRoute, dependencies.interdayDepartureMinute !== undefined);
  const validation = validateItinerary(toVisits(proposal, destinations), validRoutes(destinations, snapshots), timeReference, dependencies.interdayDepartureMinute);
  validation.canConfirm = false;
  const travel = validation.groups.travelTime;
  if (travel.status === "SATISFIED") travel.status = "INSUFFICIENT_DATA";
  travel.findings.push({ group: "travelTime", status: "INSUFFICIENT_DATA", reasonCode: "JOURNEY_ROUTES_NOT_VALIDATED", message: "Chưa kiểm tra đầy đủ chặng đi và về nơi xuất phát." });
  return validation;
}

/** The HTTP caller supplies one time reference; external routing never runs inside a DB transaction. */
export async function saveTrip(headers: Headers, request: TripSaveRequest, key: string, dependencies: TripSaveDependencies, timeReference: Date) {
  const actor = await requireTraveler(headers, dependencies);
  if (!tripSaveRequestSchema.safeParse(request).success) throw new AppError("INVALID_TRIP_INPUT", "Cần phương án hợp lệ và xác nhận riêng trước khi lưu.", 400);
  const identity = { database: dependencies.database, actorId: actor.userId, operation: "trip:create", key, input: request };
  const replay = await preflightIdempotentReplay<{ tripId: string; validation: TripValidation }>(identity);
  if (replay.status !== "ABSENT") return replay;

  if (request.proposal.startDate === null) throw new AppError("TRIP_START_DATE_REQUIRED", "Cần ngày bắt đầu trước khi lưu.", 422);
  assertJourneyReady(request.proposal.journey, request.proposal.days.at(-1)?.visits.length === 0);
  const requirement = tripRequirementInputSchema.parse({
    startDate: request.proposal.startDate, durationDays: request.proposal.durationDays, transport: request.proposal.transport,
  });
  assertStartDateForFinalConfirmation(requirement, timeReference);
  const initialDestinations = await readDestinations(dependencies.database, request.proposal);
  const fresh = await freshJourneyValidation(request.proposal, initialDestinations, journeyProvider(dependencies), timeReference);
  assertCanSave(fresh.validation);

  return executeIdempotentWrite({
    ...identity,
    execute: async transaction => {
      await requireTraveler(headers, { ...dependencies, database: transaction as unknown as Database });
      assertStartDateForFinalConfirmation(requirement, timeReference);
      const currentDestinations = await readDestinations(transaction as unknown as Database, request.proposal);
      if ([...initialDestinations].some(([id, original]) => {
        const current = currentDestinations.get(id);
        return !current || coordinates(original) !== coordinates(current);
      })) throw new AppError("TRIP_DATA_CHANGED", "Tọa độ điểm đến đã thay đổi. Vui lòng kiểm tra lại phương án.", 409);
      const checked = revalidateJourneySnapshot(request.proposal, currentDestinations, fresh.plan, timeReference);
      const validation = checked.validation;
      assertCanSave(validation);
      const trip = await transaction.trip.create({ data: {
        userId: actor.userId,
        startDate: new Date(`${request.proposal.startDate}T00:00:00.000Z`),
        durationDays: request.proposal.durationDays,
        transport: request.proposal.transport,
        journeySnapshot: JSON.parse(JSON.stringify({ revision: "journey-save-v1", journey: request.proposal.journey, plan: checked.plan, visitFingerprint: journeyVisitFingerprint(request.proposal.days) })),
        days: { create: request.proposal.days.map(day => ({
          dayIndex: day.dayIndex,
          localDate: new Date(`${tripDayDate(request.proposal.startDate, day.dayIndex)}T00:00:00.000Z`),
          visits: { create: day.visits.map(visit => ({
            destinationId: visit.destinationId,
            startMinute: visit.startMinute,
            plannedDurationMinutes: visit.plannedDurationMinutes,
            order: visit.order,
          })) },
        })) },
      }, select: { id: true } });
      return { tripId: trip.id, validation };
    },
  });
}
