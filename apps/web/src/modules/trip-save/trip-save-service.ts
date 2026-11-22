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
import { blockingAssumedFields, formatAssumedConfirmationMessage, tripDayDate, type TripProposal } from "../trip-validation/trip-proposal-contract";
import { validateItinerary, type RouteSnapshot, type TripValidation, type ValidationVisit } from "../trip-validation/trip-validation";
import { tripSaveRequestSchema, type ChosenLodgingSaveItem, type TripSaveRequest } from "./trip-save-contract";
import { EXTERNAL_PLACE_ID_PREFIX, isSchedulablePlaceId } from "../trip-planner/planner-candidates";
import type { PlannerResult } from "../trip-planner/planner-contract";
import { MAX_EXTERNAL_PLACES_PER_SAVE, type ExternalPlaceResolver, type ResolvedExternalPlace } from "./external-place-resolver";
import { assessUnchecked, UNCHECKED_REVISION, uncheckedEqual, type AcknowledgedUnchecked, type UncheckedItem } from "./unchecked-checks";
import type { JourneyDestination } from "../trip-origin/journey-save-validation";

export type TripSaveDependencies = {
  database: Database;
  resolveSession: (headers: Headers) => Promise<{ user: { id: string; role?: string } } | null>;
  getRoute: (input: { origin: { latitude: number; longitude: number }; destination: { latitude: number; longitude: number }; vehicle: TripSaveRequest["proposal"]["transport"] }) => Promise<TravelRoute>;
  /** Conversational planner explicitly includes the transfer into the next day. */
  interdayDepartureMinute?: number;
  journeyRoutes?: RouteProvider;
  /** Server-side Google lookup for external places (Ticket 09). Absent means unavailable: a Save naming one is refused. */
  resolveExternalPlaces?: ExternalPlaceResolver;
};

const destinationSelect = {
  id: true, latitude: true, longitude: true, minimumDurationMinutes: true,
  openingDays: { select: { dayOfWeek: true, status: true, intervals: { select: { opensAtMinute: true, closesAtMinute: true } } } },
} satisfies Prisma.DestinationSelect;
type CanonicalDestination = Prisma.DestinationGetPayload<{ select: typeof destinationSelect }>;

const isExternalVisitId = (id: string) => id.startsWith(EXTERNAL_PLACE_ID_PREFIX);

async function readDestinations(database: Pick<Database, "destination">, proposal: TripProposal) {
  return readKltnDestinations(database, [...new Set(proposal.days.flatMap(day => day.visits.map(visit => visit.destinationId)))]);
}

async function readKltnDestinations(database: Pick<Database, "destination">, ids: string[]) {
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

/**
 * Ticket 09 (Q21'a). FAILED or non-external missing data blocks exactly as before. Unchecked external-place data is saveable
 * only when the request carries a confirmation equal to the list the SERVER computed; the stored list is the server's.
 */
function decideSave(evidence: { validation: TripValidation; result: PlannerResult }, acknowledged: AcknowledgedUnchecked | undefined): UncheckedItem[] {
  const assessment = assessUnchecked(evidence.result);
  if (assessment.kind === "PASS") {
    if (acknowledged) throw new AppError("UNCHECKED_CONFIRMATION_MISMATCH", "Không có mục chưa kiểm nào cần xác nhận. Vui lòng kiểm tra lại phương án.", 422);
    assertCanSave(evidence.validation);
    return [];
  }
  if (assessment.kind === "BLOCKED") throw new AppError("TRIP_VALIDATION_FAILED", "Hành trình chưa đủ điều kiện xác nhận và lưu.", 422, { validation: evidence.validation });
  if (!acknowledged) throw new AppError("UNCHECKED_CONFIRMATION_REQUIRED", "Cần xác nhận rõ các mục chưa kiểm trước khi lưu.", 422, { unchecked: assessment.items });
  if (!uncheckedEqual(acknowledged.items, assessment.items)) throw new AppError("UNCHECKED_CONFIRMATION_MISMATCH", "Danh sách mục chưa kiểm đã thay đổi. Vui lòng xem lại và xác nhận lại.", 422, { unchecked: assessment.items });
  return assessment.items;
}

function formatUnresolvedLodgings(items: readonly ChosenLodgingSaveItem[]): string {
  return items
    .map(item => (item.name?.trim() ? `Đêm ${item.nightIndex}: ${item.name.trim()}` : `Đêm ${item.nightIndex} (${item.placeId})`))
    .join(", ");
}

/** Name and coordinates of external visits and chosen lodgings come only from the server's own Google lookup, never from the request. */
async function resolveExternalPlacesForSave(
  proposal: TripProposal,
  chosenLodgings: readonly ChosenLodgingSaveItem[] | undefined,
  dependencies: TripSaveDependencies,
): Promise<{
  destinations: Map<string, JourneyDestination>;
  places: ResolvedExternalPlace[];
  chosenLodgingPlaceIds: Map<number, string>;
}> {
  const visitExternalIds = [...new Set(proposal.days.flatMap(day => day.visits.map(visit => visit.destinationId)).filter(isExternalVisitId))];
  const visitPlaceIds = visitExternalIds.map(id => id.slice(EXTERNAL_PLACE_ID_PREFIX.length));
  const lodgings = chosenLodgings ?? [];
  const lodgingPlaceIds = lodgings.map(item => item.placeId);
  const allPlaceIds = [...new Set([...visitPlaceIds, ...lodgingPlaceIds])];
  if (!allPlaceIds.length) return { destinations: new Map(), places: [], chosenLodgingPlaceIds: new Map() };
  if (!allPlaceIds.every(isSchedulablePlaceId)) throw new AppError("INVALID_EXTERNAL_PLACE", "Có địa điểm ngoài danh mục không hợp lệ.", 422);
  if (allPlaceIds.length > MAX_EXTERNAL_PLACES_PER_SAVE) throw new AppError("EXTERNAL_PLACE_LIMIT", "Có quá nhiều địa điểm ngoài danh mục trong một hành trình.", 422);
  const resolved = dependencies.resolveExternalPlaces ? await dependencies.resolveExternalPlaces(allPlaceIds) : ({ status: "UNAVAILABLE" } as const);
  const unresolvedLodgings = resolved.status === "OK"
    ? lodgings.filter(item => !resolved.places.has(item.placeId))
    : lodgings;
  if (unresolvedLodgings.length > 0) {
    throw new AppError(
      "EXTERNAL_PLACE_UNAVAILABLE",
      `Chưa xác minh được chỗ nghỉ đã chọn (${formatUnresolvedLodgings(unresolvedLodgings)}) trên Google Maps lúc này. Hành trình chưa được lưu, vui lòng bỏ chọn chỗ nghỉ này hoặc thử lại sau.`,
      503,
      { unresolvedLodgings: unresolvedLodgings.map(item => ({ nightIndex: item.nightIndex, placeId: item.placeId, ...(item.name ? { name: item.name } : {}) })) },
    );
  }
  const places = resolved.status === "OK" ? allPlaceIds.map(placeId => resolved.places.get(placeId)) : [];
  if (resolved.status !== "OK" || places.some(place => !place)) {
    throw new AppError("EXTERNAL_PLACE_UNAVAILABLE", "Chưa xác minh được địa điểm ngoài danh mục lúc này. Hành trình chưa được lưu, vui lòng thử lại sau.", 503);
  }
  const resolvedPlaces = places as ResolvedExternalPlace[];
  const byPlaceId = new Map(resolvedPlaces.map(place => [place.placeId, place]));
  const destinations = new Map<string, JourneyDestination>(
    visitPlaceIds.map(placeId => {
      const place = byPlaceId.get(placeId)!;
      return [`${EXTERNAL_PLACE_ID_PREFIX}${place.placeId}`, { id: `${EXTERNAL_PLACE_ID_PREFIX}${place.placeId}`, latitude: place.latitude, longitude: place.longitude, minimumDurationMinutes: null, openingDays: [], external: true as const }];
    }),
  );
  const chosenLodgingPlaceIds = new Map<number, string>(lodgings.map(item => [item.nightIndex, item.placeId]));
  return { destinations, places: resolvedPlaces, chosenLodgingPlaceIds };
}

function journeyProvider(deps: TripSaveDependencies): RouteProvider {
  if (deps.journeyRoutes) return deps.journeyRoutes;
  const coordinateRoute: NonNullable<RouteProvider["coordinateRoute"]> = async pair => {
    const route = await deps.getRoute({ origin: pair.from, destination: pair.to, vehicle: pair.transport });
    const parsed = route.kind === "ok" ? journeyRouteSchema.safeParse({ status: "VERIFIED", reason: null, durationSeconds: route.durationSeconds, distanceMeters: route.distanceMeters ?? null, provider: route.provider ?? null, ...(route.geometry ? { geometry: route.geometry } : {}) }) : null;
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

  const blockingAssumed = blockingAssumedFields(request.proposal.assumedFields);
  if (blockingAssumed.length > 0) {
    throw new AppError("ASSUMED_FIELDS_UNCONFIRMED", formatAssumedConfirmationMessage(blockingAssumed), 422, { assumedFields: blockingAssumed });
  }
  if (request.proposal.startDate === null) throw new AppError("TRIP_START_DATE_REQUIRED", "Cần ngày bắt đầu trước khi lưu.", 422);
  assertJourneyReady(request.proposal.journey, request.proposal.days.at(-1)?.visits.length === 0);
  const requirement = tripRequirementInputSchema.parse({
    startDate: request.proposal.startDate, durationDays: request.proposal.durationDays, transport: request.proposal.transport,
  });
  assertStartDateForFinalConfirmation(requirement, timeReference);
  const proposalIds = [...new Set(request.proposal.days.flatMap(day => day.visits.map(visit => visit.destinationId)))];
  const initialDestinations = await readKltnDestinations(dependencies.database, proposalIds.filter(id => !isExternalVisitId(id)));
  const external = await resolveExternalPlacesForSave(request.proposal, request.chosenLodgings, dependencies);
  const fresh = await freshJourneyValidation(request.proposal, new Map<string, JourneyDestination>([...initialDestinations, ...external.destinations]), journeyProvider(dependencies), timeReference);
  const initialUnchecked = decideSave(fresh, request.acknowledgedUnchecked);

  return executeIdempotentWrite({
    ...identity,
    execute: async transaction => {
      await requireTraveler(headers, { ...dependencies, database: transaction as unknown as Database });
      assertStartDateForFinalConfirmation(requirement, timeReference);
      const currentDestinations = await readKltnDestinations(transaction as unknown as Database, proposalIds.filter(id => !isExternalVisitId(id)));
      if ([...initialDestinations].some(([id, original]) => {
        const current = currentDestinations.get(id);
        return !current || coordinates(original) !== coordinates(current);
      })) throw new AppError("TRIP_DATA_CHANGED", "Tọa độ điểm đến đã thay đổi. Vui lòng kiểm tra lại phương án.", 409);
      const checked = revalidateJourneySnapshot(request.proposal, new Map<string, JourneyDestination>([...currentDestinations, ...external.destinations]), fresh.plan, timeReference);
      const validation = checked.validation;
      const unchecked = decideSave({ validation, result: checked.result }, request.acknowledgedUnchecked);
      if (!uncheckedEqual(unchecked, initialUnchecked)) throw new AppError("TRIP_DATA_CHANGED", "Dữ liệu kiểm tra đã thay đổi. Vui lòng kiểm tra lại phương án.", 409);
      const externalRows = new Map<string, string>();
      const externalRowsByPlaceId = new Map<string, string>();
      for (const place of external.places) {
        const cache = { name: place.name, latitude: place.latitude, longitude: place.longitude, source: "GOOGLE_PLACES_DETAILS", fetchedAt: timeReference };
        const row = await transaction.externalPlace.upsert({ where: { provider_providerPlaceId: { provider: "GOOGLE_PLACES", providerPlaceId: place.placeId } }, create: { provider: "GOOGLE_PLACES", providerPlaceId: place.placeId, ...cache }, update: cache, select: { id: true } });
        externalRows.set(`${EXTERNAL_PLACE_ID_PREFIX}${place.placeId}`, row.id);
        externalRowsByPlaceId.set(place.placeId, row.id);
      }
      const chosenLodgingCreates = [...external.chosenLodgingPlaceIds.entries()]
        .sort(([a], [b]) => a - b)
        .map(([nightIndex, placeId]) => ({
          nightIndex,
          externalPlaceId: externalRowsByPlaceId.get(placeId)!,
        }));
      const seenNearby = new Set<string>();
      const nearbyCreates = (request.nearbySuggestions ?? []).flatMap(item => {
        const dayIndex = Number(item.slotId.match(/^d(\d+)-/)![1]);
        const key = `${item.slotId}|${item.placeId}`;
        if (dayIndex < 1 || dayIndex > request.proposal.durationDays || seenNearby.has(key)) return [];
        seenNearby.add(key);
        return [{ dayIndex, slot: item.slotId.replace(/^d\d+-/, ""), kind: item.kind, placeId: item.placeId, name: item.name, distanceKm: item.distanceKm, sortOrder: seenNearby.size }];
      });
      const trip = await transaction.trip.create({ data: {
        userId: actor.userId,
        startDate: new Date(`${request.proposal.startDate}T00:00:00.000Z`),
        durationDays: request.proposal.durationDays,
        transport: request.proposal.transport,
        ...(unchecked.length ? { uncheckedChecks: JSON.parse(JSON.stringify({ revision: UNCHECKED_REVISION, items: unchecked })), uncheckedConfirmedAt: timeReference } : {}),
        journeySnapshot: JSON.parse(JSON.stringify({ revision: "journey-save-v1", journey: request.proposal.journey, plan: checked.plan, visitFingerprint: journeyVisitFingerprint(request.proposal.days) })),
        ...(chosenLodgingCreates.length ? { chosenLodgings: { create: chosenLodgingCreates } } : {}),
        ...(nearbyCreates.length ? { nearbySuggestions: { create: nearbyCreates } } : {}),
        ...(request.pinnedItems?.length ? { pinnedItems: { create: request.pinnedItems.map((item, index) => ({ kind: item.kind, payload: JSON.parse(JSON.stringify(item)), sortOrder: index + 1 })) } } : {}),
        days: { create: request.proposal.days.map(day => ({
          dayIndex: day.dayIndex,
          localDate: new Date(`${tripDayDate(request.proposal.startDate, day.dayIndex)}T00:00:00.000Z`),
          visits: { create: day.visits.map(visit => ({
            ...(externalRows.has(visit.destinationId) ? { externalPlaceId: externalRows.get(visit.destinationId)! } : { destinationId: visit.destinationId }),
            startMinute: visit.startMinute,
            plannedDurationMinutes: visit.plannedDurationMinutes,
            order: visit.order,
          })) },
        })) },
      }, select: { id: true } });
      return { tripId: trip.id, validation, ...(unchecked.length ? { unchecked } : {}) };
    },
  });
}
