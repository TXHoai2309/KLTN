import type { Database, Prisma } from "@KLTN/db";

import { requireTraveler } from "@/server/auth/require-traveler";
import type { AuthorizationDependencies } from "@/server/authorization/guard";
import { AppError } from "@/server/http/app-error";
import { weekdays } from "../destination/destination-contract";
import { findEligibleDestinationIds, visibleDestinationWhere } from "../destination/destination-eligibility";
import { destinationMediaWhere, isDestinationMediaUsable } from "../destination/destination-media-eligibility";
import { effectiveTripStatus, type TripStatus } from "../trip-read/trip-status";
import { externalPlaceView, type ExternalPlaceRow } from "../trip-read/external-place-cache";
import { vietnamDateOf } from "../trip-requirement/trip-requirement-readiness";
import { tripDayDate } from "../trip-validation/trip-proposal-contract";
import type { TravelRoute } from "../trip-validation/stadia-route";
import {
  validateItinerary,
  type RouteSnapshot,
  type TripValidation,
  type ValidationVisit,
} from "../trip-validation/trip-validation";
import { createEditCandidate, type EditCandidate } from "./edit-candidate";
import { savedJourneySchema, type SavedJourney } from "../trip-origin/journey-saved-contract";
import { evaluateEditJourney, mergeJourneyValidation } from "./edit-journey-server";
import type { PreviewJourneySummary } from "./edit-journey-helper";
import type { UncheckedAssessment, UncheckedItem } from "../trip-save/unchecked-checks";
import { assessEditUnchecked, externalPlaceDestinationId, isExternalPlaceId } from "./edit-unchecked";
import {
  assertOngoingCompletedVisitsUnchanged,
  classifyOngoingCompletedVisits,
} from "./edit-ongoing";

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

export type CanonicalDestination = Prisma.DestinationGetPayload<{
  select: typeof destinationSelect;
}>;

export type TripEditRouteProvider = (input: {
  origin: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
  vehicle: EditCandidate["transport"];
}, options?: { signal?: AbortSignal }) => Promise<TravelRoute>;

export type TripEditServiceDependencies = {
  database: Database;
  getRoute: TripEditRouteProvider;
};

export type TripEditPageDependencies = AuthorizationDependencies & {
  database: Database;
  now?: () => Date;
};

export type EditPlaceDetail = {
  id: string;
  name: string;
  area: string;
  category?: string;
  latitude?: number;
  longitude?: number;
  suggestedDurationMinutes?: number | null;
  minimumDurationMinutes?: number | null;
  isOutdoor?: boolean;
  availability: "AVAILABLE" | "UNAVAILABLE";
  image?: { url: string; alt: string };
  external?: boolean;
};

export type TripEditPageData = {
  journeyDisclosure?: "ORIGIN_LEGS_NOT_INCLUDED" | "SAVED_JOURNEY_PRESENT";
  tripId: string;
  tripStatus: TripStatus;
  hasCompanionPublication: boolean;
  completedVisitIds?: string[];
  baseRevision: string;
  candidate: EditCandidate;
  destinationLabels: Record<string, string>;
  placeDetails: Record<string, EditPlaceDetail>;
};

export type PreviewLegMetric = {
  dayIndex: number;
  fromVisitId: string;
  toVisitId: string;
  status: "VERIFIED" | "INSUFFICIENT_DATA";
  durationSeconds: number | null;
  distanceMeters: number | null;
  geometry?: { type: "LineString"; coordinates: [number, number][] };
};

export type PreviewEditResult = {
  baseRevision: string;
  candidate: EditCandidate;
  validation: TripValidation;
  eligibleForConfirmation: boolean;
  legs?: PreviewLegMetric[];
  journeySummary?: PreviewJourneySummary;
  uncheckedItems?: UncheckedItem[];
  saveEligibility?: "PASS" | "NEEDS_UNCHECKED_ACK" | "BLOCKED";
};

export const tripExternalPlaceSelect = {
  id: true,
  providerPlaceId: true,
  name: true,
  latitude: true,
  longitude: true,
  fetchedAt: true,
} satisfies Prisma.ExternalPlaceSelect;

export type OwnedExternalPlace = ExternalPlaceRow & { id: string };

export const tripEditBaseSelect = {
  id: true,
  userId: true,
  startDate: true,
  durationDays: true,
  transport: true,
  updatedAt: true,
  manuallyCompletedAt: true,
  journeySnapshot: true,
  days: {
    orderBy: [{ dayIndex: "asc" as const }, { id: "asc" as const }],
    select: {
      dayIndex: true,
      visits: {
        orderBy: [{ order: "asc" as const }, { id: "asc" as const }],
        select: {
          id: true,
          destinationId: true,
          startMinute: true,
          plannedDurationMinutes: true,
          order: true,
          externalPlace: { select: tripExternalPlaceSelect },
        },
      },
    },
  },
} satisfies Prisma.TripSelect;

export type TripEditBase = Prisma.TripGetPayload<{
  select: typeof tripEditBaseSelect;
}>;

const tripEditPageSelect = {
  journeySnapshot: true,
  id: true,
  startDate: true,
  durationDays: true,
  transport: true,
  updatedAt: true,
  manuallyCompletedAt: true,
  companionPublication: { select: { id: true } },
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
          externalPlace: { select: tripExternalPlaceSelect },
          destination: {
            select: {
              id: true,
              name: true,
              area: true,
              category: true,
              latitude: true,
              longitude: true,
              suggestedDurationMinutes: true,
              minimumDurationMinutes: true,
              isOutdoor: true,
              visibility: true,
              deletedAt: true,
              media: {
                where: destinationMediaWhere,
                take: 20,
                orderBy: [{ isCover: "desc" as const }, { position: "asc" as const }, { id: "asc" as const }],
                select: { url: true, alt: true, websiteRights: true, storageReference: true },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.TripSelect;

export function assertTripEditable(
  trip: { startDate: Date; durationDays: number; manuallyCompletedAt?: Date | null },
  timeReference: Date,
): TripStatus {
  const status = effectiveTripStatus(
    trip.startDate.toISOString().slice(0, 10),
    trip.durationDays,
    vietnamDateOf(timeReference),
    trip.manuallyCompletedAt ?? null,
  ).status;
  if (status === "COMPLETED") {
    throw new AppError("TRIP_COMPLETED_READONLY", "Chuyến đi đã hoàn thành nên không thể chỉnh sửa.", 409);
  }
  return status;
}

/** Read the edit candidate and its revision from the same owned-trip snapshot. */
export async function getTripForEdit(
  headers: Headers,
  tripId: string,
  dependencies: TripEditPageDependencies,
): Promise<TripEditPageData> {
  const actor = await requireTraveler(headers, dependencies);
  const found = await dependencies.database.trip.findFirst({
    where: { id: tripId, userId: actor.userId },
    select: tripEditPageSelect,
  });
  if (!found) throw new AppError("TRIP_NOT_FOUND", "Không tìm thấy chuyến đi.", 404);

  const referenceNow = dependencies.now?.() ?? new Date();
  const parsedSavedJourney = savedJourneySchema.safeParse(found.journeySnapshot);
  const candidate = createEditCandidate({
    startDate: found.startDate,
    durationDays: found.durationDays,
    transport: found.transport,
    days: found.days.map((day) => ({
      dayIndex: day.dayIndex,
      visits: day.visits.map((visit) => {
        const ext = (visit as { externalPlace?: OwnedExternalPlace | null }).externalPlace;
        if (visit.destination) {
          return {
            id: visit.id,
            destinationId: visit.destination.id,
            startMinute: visit.startMinute,
            plannedDurationMinutes: visit.plannedDurationMinutes,
            order: visit.order,
          };
        }
        if (ext) {
          return {
            id: visit.id,
            destinationId: externalPlaceDestinationId(ext.providerPlaceId),
            startMinute: visit.startMinute,
            plannedDurationMinutes: visit.plannedDurationMinutes,
            order: visit.order,
          };
        }
        throw new AppError("INVALID_TRIP_STATE", "Lượt tham quan thiếu địa điểm.", 500);
      }),
    })),
  });
  if (parsedSavedJourney.success) {
    candidate.journey = parsedSavedJourney.data.journey;
  }

  const tripStatus = effectiveTripStatus(
    found.startDate.toISOString().slice(0, 10),
    found.durationDays,
    vietnamDateOf(referenceNow),
    (found as { manuallyCompletedAt?: Date | null }).manuallyCompletedAt ?? null,
  ).status;

  const destinationLabels: Record<string, string> = {};
  const placeDetails: Record<string, EditPlaceDetail> = {};
  for (const day of found.days) {
    for (const visit of day.visits) {
      const ext = (visit as { externalPlace?: OwnedExternalPlace | null }).externalPlace;
      if (ext) {
        const view = externalPlaceView(ext, referenceNow, true);
        destinationLabels[view.id] = view.name;
        placeDetails[view.id] = {
          id: view.id,
          name: view.name,
          area: view.area,
          category: view.category,
          ...(view.latitude !== undefined ? { latitude: view.latitude } : {}),
          ...(view.longitude !== undefined ? { longitude: view.longitude } : {}),
          suggestedDurationMinutes: null,
          minimumDurationMinutes: null,
          availability: "AVAILABLE",
          external: true,
        };
        continue;
      }
      const dest = visit.destination;
      if (!dest) continue;
      const available = dest.visibility === "VISIBLE" && !dest.deletedAt;
      destinationLabels[dest.id] = available
        ? `${dest.name} · ${dest.area}`
        : "Điểm đến không còn khả dụng";
      const mediaList = (dest as { media?: { url: string; alt: string; websiteRights: string; storageReference?: string | null }[] }).media;
      const image = Array.isArray(mediaList)
        ? mediaList.find((item) => isDestinationMediaUsable(item, dest.id))
        : undefined;
      placeDetails[dest.id] = {
        id: dest.id,
        name: available ? dest.name : "Điểm đến không còn khả dụng",
        area: dest.area,
        ...(typeof (dest as { category?: string }).category === "string" ? { category: (dest as { category?: string }).category } : {}),
        ...(typeof (dest as { latitude?: number }).latitude === "number" ? { latitude: (dest as { latitude?: number }).latitude } : {}),
        ...(typeof (dest as { longitude?: number }).longitude === "number" ? { longitude: (dest as { longitude?: number }).longitude } : {}),
        suggestedDurationMinutes: (dest as { suggestedDurationMinutes?: number | null }).suggestedDurationMinutes ?? null,
        minimumDurationMinutes: (dest as { minimumDurationMinutes?: number | null }).minimumDurationMinutes ?? null,
        ...(typeof (dest as { isOutdoor?: boolean }).isOutdoor === "boolean" ? { isOutdoor: (dest as { isOutdoor?: boolean }).isOutdoor } : {}),
        availability: available ? "AVAILABLE" : "UNAVAILABLE",
        ...(image && available ? { image: { url: image.url, alt: image.alt } } : {}),
        external: false,
      };
    }
  }

  const completedClassification = classifyOngoingCompletedVisits(
    {
      startDate: found.startDate,
      durationDays: found.durationDays,
      transport: found.transport,
      manuallyCompletedAt: (found as { manuallyCompletedAt?: Date | null }).manuallyCompletedAt ?? null,
      days: candidate.days.map((day) => ({
        dayIndex: day.dayIndex,
        visits: day.visits.map((visit) => ({
          id: visit.visitId,
          destinationId: visit.destinationId,
          startMinute: visit.startMinute,
          plannedDurationMinutes: visit.plannedDurationMinutes,
          order: visit.order,
        })),
      })),
    },
    referenceNow,
  );

  return {
    tripId: found.id,
    tripStatus,
    hasCompanionPublication: Boolean((found as { companionPublication?: { id: string } | null }).companionPublication),
    ...(completedClassification.completedVisitIds.length > 0
      ? { completedVisitIds: completedClassification.completedVisitIds }
      : {}),
    journeyDisclosure: found.journeySnapshot == null ? "ORIGIN_LEGS_NOT_INCLUDED" : "SAVED_JOURNEY_PRESENT",
    baseRevision: found.updatedAt.toISOString(),
    candidate,
    destinationLabels,
    placeDetails,
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
  trip: Pick<TripEditBase, "startDate" | "durationDays" | "transport">,
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

type ResolvedEditPlaces = {
  destinations: Map<string, CanonicalDestination>;
  hasUsableCoords: Map<string, boolean>;
  externalRowIds: Map<string, string>;
};

async function resolveEditPlaces(
  candidate: EditCandidate,
  database: Pick<Database, "destination">,
  ownedExternalPlaces: readonly OwnedExternalPlace[],
  timeReference: Date,
): Promise<ResolvedEditPlaces> {
  const ids = [
    ...new Set(candidate.days.flatMap((day) => day.visits.map((visit) => visit.destinationId))),
  ];
  const catalogIds = ids.filter((id) => !isExternalPlaceId(id));
  const externalIds = ids.filter(isExternalPlaceId);

  const destinations = new Map<string, CanonicalDestination>();
  const hasUsableCoords = new Map<string, boolean>();
  const externalRowIds = new Map<string, string>();

  if (catalogIds.length > 0) {
    const eligibleIds = await findEligibleDestinationIds(catalogIds, database);
    if (eligibleIds.length !== catalogIds.length) throw unavailableDestination();

    // Re-read the authoritative validation fields behind the same shared visibility predicate.
    const rows = await database.destination.findMany({
      where: { ...visibleDestinationWhere, id: { in: catalogIds } },
      select: destinationSelect,
    });
    if (rows.length !== catalogIds.length) throw unavailableDestination();
    for (const row of rows) {
      destinations.set(row.id, row);
      hasUsableCoords.set(row.id, true);
    }
  }

  if (externalIds.length > 0) {
    const ownedByExternalId = new Map<string, OwnedExternalPlace>();
    for (const ext of ownedExternalPlaces) {
      ownedByExternalId.set(externalPlaceDestinationId(ext.providerPlaceId), ext);
    }
    const unknownOpeningDays: CanonicalDestination["openingDays"] = weekdays.map((dayOfWeek) => ({
      dayOfWeek,
      status: "UNKNOWN",
      intervals: [],
    }));
    for (const extId of externalIds) {
      const owned = ownedByExternalId.get(extId);
      if (!owned) throw unavailableDestination();
      const view = externalPlaceView(owned, timeReference, true);
      const freshCoords = view.latitude != null && view.longitude != null;
      destinations.set(extId, {
        id: extId,
        latitude: freshCoords ? view.latitude! : 0,
        longitude: freshCoords ? view.longitude! : 0,
        minimumDurationMinutes: null,
        openingDays: unknownOpeningDays,
      });
      hasUsableCoords.set(extId, freshCoords);
      externalRowIds.set(extId, owned.id);
    }
  }

  return { destinations, hasUsableCoords, externalRowIds };
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

async function snapshotRoutesWithLegs(
  candidate: EditCandidate,
  destinations: Map<string, CanonicalDestination>,
  hasUsableCoords: ReadonlyMap<string, boolean>,
  getRoute: TripEditRouteProvider,
): Promise<{ routes: RouteSnapshot[]; legs: PreviewLegMetric[] }> {
  const legs = candidate.days.flatMap((day) =>
    day.visits.slice(1).map((nextVisit, index) => ({
      dayIndex: day.dayIndex,
      from: day.visits[index]!,
      to: nextVisit,
    })),
  );

  const settled = await Promise.all(
    legs.map(async ({ dayIndex, from, to }) => {
      const fromDestination = destinations.get(from.destinationId);
      const toDestination = destinations.get(to.destinationId);
      if (!fromDestination || !toDestination) throw unavailableDestination();
      const coordsUsable =
        (hasUsableCoords.get(from.destinationId) ?? true) &&
        (hasUsableCoords.get(to.destinationId) ?? true);
      const route = coordsUsable
        ? await getRoute({
            origin: coordinates(fromDestination),
            destination: coordinates(toDestination),
            vehicle: candidate.transport,
          })
        : ({ kind: "unavailable" } as const);
      const snapshot: RouteSnapshot = {
        fromVisitId: from.visitId,
        toVisitId: to.visitId,
        route:
          route.kind === "ok"
            ? { kind: "ok" as const, durationSeconds: route.durationSeconds }
            : { kind: "unavailable" as const },
      };
      const metric: PreviewLegMetric = {
        dayIndex,
        fromVisitId: from.visitId,
        toVisitId: to.visitId,
        status: route.kind === "ok" ? "VERIFIED" : "INSUFFICIENT_DATA",
        durationSeconds: route.kind === "ok" ? route.durationSeconds : null,
        distanceMeters: route.kind === "ok" ? (route.distanceMeters ?? null) : null,
        ...(route.kind === "ok" && route.geometry ? { geometry: route.geometry } : {}),
      };
      return { snapshot, metric };
    }),
  );

  return {
    routes: settled.map((item) => item.snapshot),
    legs: settled.map((item) => item.metric),
  };
}

export function extractOwnedExternalPlaces(trip: {
  days?: readonly {
    visits?: readonly { externalPlace?: OwnedExternalPlace | null }[];
  }[];
}): OwnedExternalPlace[] {
  const seen = new Map<string, OwnedExternalPlace>();
  for (const day of trip.days ?? []) {
    for (const visit of day.visits ?? []) {
      if (visit.externalPlace) {
        seen.set(visit.externalPlace.id, visit.externalPlace);
      }
    }
  }
  return [...seen.values()];
}

/** Shared authoritative destination and Validator pass used by preview and apply. */
export async function validateEditCandidateFull(
  candidate: EditCandidate,
  dependencies: TripEditServiceDependencies,
  timeReference: Date,
  tripMeta?: {
    startDate: Date;
    manuallyCompletedAt?: Date | null;
    journeySnapshot?: unknown;
    ownedExternalPlaces?: readonly OwnedExternalPlace[];
  },
  enforceJourneyReadyForSave = false,
): Promise<{
  validation: TripValidation;
  legs: PreviewLegMetric[];
  assessment: UncheckedAssessment;
  externalRowIds: Map<string, string>;
  journeySummary?: PreviewJourneySummary;
  nextJourneySnapshot?: SavedJourney | null;
}> {
  const { destinations, hasUsableCoords, externalRowIds } = await resolveEditPlaces(
    candidate,
    dependencies.database,
    tripMeta?.ownedExternalPlaces ?? [],
    timeReference,
  );
  const validationVisits = toValidationVisits(candidate, destinations);
  const { routes, legs } = await snapshotRoutesWithLegs(
    candidate,
    destinations,
    hasUsableCoords,
    dependencies.getRoute,
  );
  const baseValidation = validateItinerary(validationVisits, routes, timeReference);

  const hasJourneyContext =
    candidate.journey !== undefined ||
    (tripMeta?.journeySnapshot !== undefined && tripMeta.journeySnapshot !== null);
  if (!hasJourneyContext) {
    return {
      validation: baseValidation,
      legs,
      assessment: assessEditUnchecked(baseValidation, candidate),
      externalRowIds,
    };
  }

  const evaluated = await evaluateEditJourney({
    candidate,
    existingJourneySnapshot: tripMeta?.journeySnapshot ?? null,
    tripStartDate:
      tripMeta?.startDate ??
      (candidate.startDate ? new Date(`${candidate.startDate}T00:00:00.000Z`) : timeReference),
    manuallyCompletedAt: tripMeta?.manuallyCompletedAt ?? null,
    destinations,
    hasUsableCoords,
    legs,
    getRoute: dependencies.getRoute,
    timeReference,
    enforceReadyForSave: enforceJourneyReadyForSave,
  });

  const mergedValidation = mergeJourneyValidation(baseValidation, evaluated.extraFindings);
  return {
    validation: mergedValidation,
    legs,
    assessment: assessEditUnchecked(mergedValidation, candidate),
    externalRowIds,
    ...(evaluated.journeySummary ? { journeySummary: evaluated.journeySummary } : {}),
    ...(evaluated.nextJourneySnapshot !== undefined
      ? { nextJourneySnapshot: evaluated.nextJourneySnapshot }
      : {}),
  };
}

export async function validateEditCandidateWithLegs(
  candidate: EditCandidate,
  dependencies: TripEditServiceDependencies,
  timeReference: Date,
): Promise<{ validation: TripValidation; legs: PreviewLegMetric[] }> {
  const full = await validateEditCandidateFull(candidate, dependencies, timeReference);
  return { validation: full.validation, legs: full.legs };
}

export async function validateEditCandidate(
  candidate: EditCandidate,
  dependencies: TripEditServiceDependencies,
  timeReference: Date,
): Promise<TripValidation> {
  const { validation } = await validateEditCandidateFull(candidate, dependencies, timeReference);
  return validation;
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

  assertTripEditable(trip, timeReference);
  assertCandidateMatchesTrip(trip, candidate);
  const rawDays = (trip as {
    days?: readonly {
      dayIndex?: number;
      visits?: readonly {
        id?: string;
        destinationId?: string | null;
        startMinute?: number;
        plannedDurationMinutes?: number;
        order?: number;
        externalPlace?: OwnedExternalPlace | null;
      }[];
    }[];
  }).days;
  if (rawDays && rawDays.length > 0 && rawDays.every((d) => typeof d.dayIndex === "number")) {
    const completeVisitShape = rawDays.every((d) =>
      (d.visits ?? []).every(
        (v) =>
          typeof v.id === "string" &&
          typeof v.startMinute === "number" &&
          typeof v.plannedDurationMinutes === "number" &&
          typeof v.order === "number" &&
          (typeof v.destinationId === "string" || v.externalPlace != null),
      ),
    );
    if (completeVisitShape) {
      assertOngoingCompletedVisitsUnchanged(
        {
          startDate: trip.startDate,
          durationDays: trip.durationDays,
          transport: trip.transport,
          manuallyCompletedAt: trip.manuallyCompletedAt,
          days: rawDays.map((day) => ({
            dayIndex: day.dayIndex!,
            visits: (day.visits ?? []).map((visit) => ({
              id: visit.id!,
              destinationId:
                typeof visit.destinationId === "string" && visit.destinationId.length > 0
                  ? visit.destinationId
                  : externalPlaceDestinationId(visit.externalPlace!.providerPlaceId),
              startMinute: visit.startMinute!,
              plannedDurationMinutes: visit.plannedDurationMinutes!,
              order: visit.order!,
            })),
          })),
        },
        candidate,
        timeReference,
      );
    }
  }
  const ownedExternalPlaces = extractOwnedExternalPlaces(
    trip as {
      days?: readonly {
        visits?: readonly { externalPlace?: OwnedExternalPlace | null }[];
      }[];
    },
  );
  const { validation, legs, journeySummary, assessment } = await validateEditCandidateFull(
    candidate,
    dependencies,
    timeReference,
    {
      startDate: trip.startDate,
      manuallyCompletedAt: trip.manuallyCompletedAt,
      journeySnapshot: (trip as { journeySnapshot?: unknown }).journeySnapshot,
      ownedExternalPlaces,
    },
    false,
  );

  return {
    baseRevision: currentRevision,
    candidate,
    validation,
    eligibleForConfirmation: validation.canConfirm,
    legs,
    saveEligibility:
      assessment.kind === "PASS"
        ? "PASS"
        : assessment.kind === "UNCHECKED"
          ? "NEEDS_UNCHECKED_ACK"
          : "BLOCKED",
    ...(assessment.kind === "UNCHECKED" ? { uncheckedItems: assessment.items } : {}),
    ...(journeySummary ? { journeySummary } : {}),
  };
}
