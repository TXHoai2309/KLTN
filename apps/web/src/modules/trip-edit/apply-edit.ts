import { Prisma, type Database } from "@KLTN/db";
import { recordCompanionItineraryChange } from "../trip-companions/companion-itinerary-notice";
import { savedJourneySchema, type SavedJourney } from "../trip-origin/journey-saved-contract";
import { requireTraveler, type TravelerActor } from "@/server/auth/require-traveler";
import type { AuthorizationDependencies } from "@/server/authorization/guard";
import { AppError } from "@/server/http/app-error";
import {
  executeIdempotentWrite,
  preflightIdempotentReplay,
} from "@/server/http/idempotency";
import { editCandidateSchema, createEditCandidate, type EditCandidate } from "./edit-candidate";
import { tripSaveRequestSchema } from "../trip-save/trip-save-contract";
import {
  assertCandidateMatchesTrip,
  assertTripEditable,
  extractOwnedExternalPlaces,
  tripExternalPlaceSelect,
  validateEditCandidateFull,
  type OwnedExternalPlace,
  type TripEditServiceDependencies,
} from "./trip-edit-service";
import { assertOngoingCompletedVisitsUnchanged } from "./edit-ongoing";
import { externalPlaceDestinationId, isExternalPlaceId } from "./edit-unchecked";
import {
  acknowledgedUncheckedSchema,
  UNCHECKED_REVISION,
  uncheckedEqual,
  type UncheckedItem,
} from "../trip-save/unchecked-checks";
import { tripDayDate } from "../trip-validation/trip-proposal-contract";
import type { TripValidation } from "../trip-validation/trip-validation";
import { inTripLocationSchema } from "../in-trip/in-trip-location";
import { mandatoryEndpointSchema } from "../in-trip/mandatory-endpoint";
import { previewInTrip } from "../in-trip/in-trip-validation";
import { recheckInTripTime, type TimeRecheckTrip } from "../in-trip/time-recheck";
import { preserveCompleted, ReplanCompletedVisitError } from "../in-trip/preserve-completed";
import { splitCompletedRemaining } from "../in-trip/split-trip";
import { assertLocationIndependentScope } from "../in-trip/location-independent-scope";
import { z } from "zod";

const applyEditBaseSchema = z
  .object({
    baseRevision: z.iso.datetime(),
    candidate: editCandidateSchema,
    confirmed: z.literal(true),
    kind: z.enum(["MANUAL", "AI", "IN_TRIP"]),
    location: inTripLocationSchema.optional(),
    mandatoryEndpoint: mandatoryEndpointSchema.nullable().optional(),
    acknowledgedUnchecked: acknowledgedUncheckedSchema.optional(),
  })
  .strict();
export const applyEditRequestSchema = applyEditBaseSchema.superRefine((request, context) => {
  if (request.kind === "IN_TRIP" && request.location === undefined) {
    context.addIssue({ code: "custom", path: ["location"], message: "Cần vị trí để kiểm tra lại phương án In-trip." });
  }
  if (request.kind !== "IN_TRIP" && (request.location !== undefined || request.mandatoryEndpoint !== undefined)) {
    context.addIssue({ code: "custom", path: ["kind"], message: "Ngữ cảnh vị trí chỉ dùng cho chỉnh sửa In-trip." });
  }
});

export type ApplyEditRequest = z.infer<typeof applyEditRequestSchema>;

const tripApplySelect = {
  id: true,
  userId: true,
  startDate: true,
  durationDays: true,
  transport: true,
  updatedAt: true,
  manuallyCompletedAt: true,
  journeySnapshot: true,
  uncheckedChecks: true,
  days: {
    orderBy: [{ dayIndex: "asc" as const }, { id: "asc" as const }],
    select: {
      id: true,
      dayIndex: true,
      visits: {
        orderBy: [{ order: "asc" as const }, { id: "asc" as const }],
        select: {
          id: true,
          destinationId: true,
          externalPlace: { select: tripExternalPlaceSelect },
          startMinute: true,
          plannedDurationMinutes: true,
          order: true,
        },
      },
    },
  },
} satisfies Prisma.TripSelect;

type RawTripForApply = Prisma.TripGetPayload<{ select: typeof tripApplySelect }>;
type NormalizedApplyVisit = {
  id: string;
  destinationId: string;
  startMinute: number;
  plannedDurationMinutes: number;
  order: number;
  externalPlace?: OwnedExternalPlace | null;
};
type TripForApply = Omit<RawTripForApply, "days"> & {
  days: { id: string; dayIndex: number; visits: NormalizedApplyVisit[] }[];
};

export type InTripCompletedVisitInvariant = (input: {
  original: EditCandidate;
  candidate: EditCandidate;
  timeReference: Date;
}) => void;

export type ApplyEditDependencies = TripEditServiceDependencies & {
  authorization: AuthorizationDependencies;
  /** US-36/task 289 will wire the completed-visit invariant into this hook. */
  assertInTripCompletedVisitsUnchanged?: InTripCompletedVisitInvariant;
  /** Internal-only integration; public request schemas still require location. */
  allowLocationIndependent?: boolean;
};

export type ApplyEditResult = {
  tripId: string;
  baseRevision: string;
  kind: ApplyEditRequest["kind"];
  candidate: EditCandidate;
  validation: TripValidation;
};

function revisionConflict(): AppError {
  return new AppError(
    "TRIP_REVISION_CONFLICT",
    "Hành trình đã thay đổi. Hãy tải lại trước khi áp dụng chỉnh sửa.",
    409,
  );
}

function tripNotFound(): AppError {
  return new AppError("TRIP_NOT_FOUND", "Không tìm thấy chuyến đi.", 404);
}

function assertInTripVisitsUnchanged(
  kind: ApplyEditRequest["kind"],
  originalTrip: TripForApply,
  candidate: EditCandidate,
  timeReference: Date,
  dependencies: ApplyEditDependencies,
): void {
  if (kind !== "IN_TRIP") return;
  try {
    if (dependencies.assertInTripCompletedVisitsUnchanged) {
      dependencies.assertInTripCompletedVisitsUnchanged({
        original: createEditCandidate(originalTrip),
        candidate,
        timeReference,
      });
      return;
    }
    const trip = timeRecheckTrip(originalTrip);
    const split = splitCompletedRemaining(trip, timeReference);
    preserveCompleted(trip, candidate, split.completed.map((visit) => visit.visitId));
  } catch (error) {
    if (error instanceof ReplanCompletedVisitError) {
      throw new AppError("COMPLETED_VISIT_CHANGED", "Phương án thay đổi lượt đã qua giờ theo lịch.", 422);
    }
    throw error;
  }
}

function assertCandidateCanBeSaved(candidate: EditCandidate): void {
  const savedShape = tripSaveRequestSchema.safeParse({
    confirm: true,
    proposal: {
      startDate: candidate.startDate,
      durationDays: candidate.durationDays,
      transport: candidate.transport,
      days: candidate.days.map((day) => ({
        dayIndex: day.dayIndex,
        visits: day.visits.map((visit) => ({
          destinationId: visit.destinationId,
          startMinute: visit.startMinute,
          plannedDurationMinutes: visit.plannedDurationMinutes,
          order: visit.order,
        })),
      })),
    },
  });
  if (!savedShape.success) {
    throw new AppError("VALIDATION_ERROR", "Phương án chỉnh sửa chưa thể lưu.", 400, {
      fieldErrors: savedShape.error.flatten().fieldErrors,
    });
  }
}

async function findOwnedTrip(
  tripId: string,
  userId: string,
  database: Pick<Database, "trip">,
): Promise<TripForApply> {
  const trip = await database.trip.findFirst({
    where: { id: tripId, userId },
    select: tripApplySelect,
  });
  if (!trip) throw tripNotFound();
  return {
    ...trip,
    days: trip.days.map((day) => ({
      id: day.id,
      dayIndex: day.dayIndex,
      visits: day.visits.map((visit) => {
        const ext = (visit as { externalPlace?: OwnedExternalPlace | null }).externalPlace ?? null;
        if (typeof visit.destinationId === "string" && visit.destinationId.length > 0) {
          return {
            id: visit.id,
            destinationId: visit.destinationId,
            startMinute: visit.startMinute,
            plannedDurationMinutes: visit.plannedDurationMinutes,
            order: visit.order,
            externalPlace: ext,
          };
        }
        if (ext) {
          return {
            id: visit.id,
            destinationId: externalPlaceDestinationId(ext.providerPlaceId),
            startMinute: visit.startMinute,
            plannedDurationMinutes: visit.plannedDurationMinutes,
            order: visit.order,
            externalPlace: ext,
          };
        }
        throw new AppError("INVALID_TRIP_STATE", "Lượt tham quan thiếu địa điểm.", 500);
      }),
    })),
  };
}

function timeRecheckTrip(trip: TripForApply): TimeRecheckTrip {
  return {
    startDate: trip.startDate,
    durationDays: trip.durationDays,
    transport: trip.transport,
    days: trip.days.map((day) => ({
      dayIndex: day.dayIndex,
      localDate: tripDayDate(trip.startDate.toISOString().slice(0, 10), day.dayIndex) ?? "",
      visits: day.visits.map((visit) => ({ ...visit })),
    })),
  };
}

function requireLocalDate(candidate: EditCandidate, dayIndex: number): Date {
  const localDate = tripDayDate(candidate.startDate, dayIndex);
  if (localDate === null) {
    throw new AppError("VALIDATION_ERROR", "Ngày bắt đầu của phương án không hợp lệ.", 400);
  }
  return new Date(`${localDate}T00:00:00.000Z`);
}

function nextBaseRevision(currentUpdatedAt: Date, timeReference: Date): Date {
  const currentMs = currentUpdatedAt.getTime();
  const requestedMs = timeReference.getTime();
  if (!Number.isFinite(currentMs) || !Number.isFinite(requestedMs)) {
    throw new RangeError("Revision timestamps must be valid");
  }
  return new Date(Math.max(requestedMs, currentMs + 1));
}

async function persistCandidate(
  transaction: Prisma.TransactionClient,
  tripId: string,
  actor: TravelerActor,
  baseRevision: string,
  candidate: EditCandidate,
  kind: ApplyEditRequest["kind"],
  timeReference: Date,
  dependencies: ApplyEditDependencies,
  nextJourneySnapshot?: SavedJourney | null,
  uncheckedItemsToSave?: readonly UncheckedItem[] | null,
): Promise<string> {
  const trip = await findOwnedTrip(tripId, actor.userId, transaction as unknown as Pick<Database, "trip">);
  if (trip.updatedAt.toISOString() !== baseRevision) throw revisionConflict();
  assertTripEditable(trip, timeReference);
  assertCandidateMatchesTrip(trip, candidate);
  assertInTripVisitsUnchanged(kind, trip, candidate, timeReference, dependencies);
  if (kind !== "IN_TRIP") {
    assertOngoingCompletedVisitsUnchanged(trip, candidate, timeReference);
  }
  if (kind === "IN_TRIP" && dependencies.allowLocationIndependent) {
    // The ordinary completed invariant is still mandatory. The no-location
    // future-scope restriction is also checked at commit using the same clock.
    assertLocationIndependentScope(createEditCandidate(trip), candidate, timeReference);
  }

  const externalRowByDestId = new Map<string, string>();
  for (const ext of extractOwnedExternalPlaces(trip)) {
    externalRowByDestId.set(externalPlaceDestinationId(ext.providerPlaceId), ext.id);
  }
  for (const day of candidate.days) {
    for (const visit of day.visits) {
      if (isExternalPlaceId(visit.destinationId) && !externalRowByDestId.has(visit.destinationId)) {
        throw new AppError("DESTINATION_UNAVAILABLE", "Địa điểm ngoài danh mục không thuộc chuyến đi này.", 422);
      }
    }
  }

  const nextRevision = nextBaseRevision(trip.updatedAt, timeReference);
  const journeyWriteData =
    nextJourneySnapshot === undefined
      ? {}
      : {
          journeySnapshot:
            nextJourneySnapshot === null
              ? Prisma.DbNull
              : (nextJourneySnapshot as unknown as Prisma.InputJsonValue),
        };
  const hadUnchecked = (trip as { uncheckedChecks?: unknown }).uncheckedChecks != null;
  const uncheckedWriteData =
    uncheckedItemsToSave && uncheckedItemsToSave.length > 0
      ? {
          uncheckedChecks: {
            revision: UNCHECKED_REVISION,
            items: uncheckedItemsToSave,
          } as unknown as Prisma.InputJsonValue,
          uncheckedConfirmedAt: timeReference,
        }
      : uncheckedItemsToSave === null && hadUnchecked
        ? {
            uncheckedChecks: Prisma.DbNull,
            uncheckedConfirmedAt: null,
          }
        : {};
  const revisionUpdate = await transaction.trip.updateMany({
    where: { id: tripId, userId: actor.userId, updatedAt: trip.updatedAt },
    data: { updatedAt: nextRevision, ...journeyWriteData, ...uncheckedWriteData },
  });
  if (revisionUpdate.count !== 1) throw revisionConflict();

  await transaction.itineraryDay.deleteMany({ where: { tripId } });
  for (const day of candidate.days) {
    await transaction.itineraryDay.create({
      data: {
        tripId,
        dayIndex: day.dayIndex,
        localDate: requireLocalDate(candidate, day.dayIndex),
        visits: {
          create: day.visits.map((visit) => ({
            // Preserve Task 265's stable identity as the persisted visit ID.
            id: visit.visitId,
            ...(externalRowByDestId.has(visit.destinationId)
              ? { externalPlaceId: externalRowByDestId.get(visit.destinationId)! }
              : { destinationId: visit.destinationId }),
            startMinute: visit.startMinute,
            plannedDurationMinutes: visit.plannedDurationMinutes,
            order: visit.order,
          })),
        },
      },
    });
  }
  const beforeCandidate = createEditCandidate(trip);
  const parsedBeforeJourney = savedJourneySchema.safeParse((trip as { journeySnapshot?: unknown }).journeySnapshot);
  if (parsedBeforeJourney.success) {
    beforeCandidate.journey = parsedBeforeJourney.data.journey;
  }
  await recordCompanionItineraryChange(transaction, tripId, beforeCandidate, candidate);
  return nextRevision.toISOString();
}

/** Revalidate outside the transaction, then atomically CAS and replace the itinerary. */
export async function applyEdit(
  headers: Headers,
  tripId: string,
  userId: string,
  request: ApplyEditRequest,
  key: string,
  dependencies: ApplyEditDependencies,
  timeReference: Date | (() => Date),
) {
  const internalNoLocation = dependencies.allowLocationIndependent && request.kind === "IN_TRIP" && request.location === undefined;
  const parsed = (internalNoLocation ? applyEditBaseSchema : applyEditRequestSchema).safeParse(request);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "Dữ liệu áp dụng chỉnh sửa không hợp lệ.", 400, {
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }
  const input = parsed.data;
  const candidate = editCandidateSchema.parse(input.candidate);

  // Ownership precedes idempotency lookup; replay must precede stale-version validation.
  const ownedTrip = await findOwnedTrip(tripId, userId, dependencies.database);
  const identity = {
    database: dependencies.database,
    actorId: userId,
    operation: "trip:apply-edit",
    key,
    input: {
      tripId,
      baseRevision: input.baseRevision,
      kind: input.kind,
      candidate,
      ...(input.acknowledgedUnchecked !== undefined
        ? { acknowledgedUnchecked: input.acknowledgedUnchecked }
        : {}),
      ...(input.kind === "IN_TRIP" ? { mandatoryEndpoint: input.mandatoryEndpoint ?? null } : {}),
      // Location is intentionally transient and excluded from the idempotency hash.
    },
  };
  const replay = await preflightIdempotentReplay<ApplyEditResult>(identity);
  if (replay.status !== "ABSENT") return replay;

  // Read a fresh server clock only after ownership/replay checks and immediately
  // before the out-of-transaction revalidation phase.
  const validationTimeReference = typeof timeReference === "function" ? timeReference() : timeReference;
  if (Number.isNaN(validationTimeReference.getTime())) throw new RangeError("now must be valid");

  assertCandidateCanBeSaved(candidate);
  assertTripEditable(ownedTrip, validationTimeReference);
  assertInTripVisitsUnchanged(input.kind, ownedTrip, candidate, validationTimeReference, dependencies);

  let validation: TripValidation;
  let nextJourneySnapshot: SavedJourney | null | undefined;
  let uncheckedItemsToSave: readonly UncheckedItem[] | null | undefined;
  if (input.kind === "IN_TRIP") {
    const checked = await previewInTrip(
      tripId,
      userId,
      {
        baseRevision: input.baseRevision,
        candidate,
        location: input.location!,
        mandatoryEndpoint: input.mandatoryEndpoint ?? null,
      },
      { database: dependencies.database, getRoute: dependencies.getRoute, now: () => validationTimeReference, allowLocationIndependent: internalNoLocation },
    );
    const recheck = recheckInTripTime({
      trip: timeRecheckTrip(ownedTrip),
      candidate,
      now: new Date(checked.checkedAt),
      validation: checked.validation,
    });
    if (recheck.status === "REJECTED") {
      const message = recheck.code === "COMPLETED_VISIT_CHANGED"
        ? "Phương án thay đổi lượt đã qua giờ theo lịch. Hãy kiểm tra lại."
        : recheck.code === "ALL_COMPLETED"
          ? "Chuyến đi không còn lượt nào để áp dụng phương án."
          : "Kết quả kiểm tra In-trip đã thay đổi. Hãy xem lại phương án.";
      throw new AppError(recheck.code, message, 422, {
        validation: recheck.validation,
        checkedAt: recheck.checkedAt,
        completedVisitIds: recheck.completedVisitIds,
      });
    }
    validation = recheck.validation;
  } else {
    if (ownedTrip.updatedAt.toISOString() !== input.baseRevision) throw revisionConflict();
    assertCandidateMatchesTrip(ownedTrip, candidate);
    assertOngoingCompletedVisitsUnchanged(ownedTrip, candidate, validationTimeReference);
    const checked = await validateEditCandidateFull(
      candidate,
      dependencies,
      validationTimeReference,
      {
        startDate: ownedTrip.startDate,
        manuallyCompletedAt: ownedTrip.manuallyCompletedAt,
        journeySnapshot: (ownedTrip as { journeySnapshot?: unknown }).journeySnapshot,
        ownedExternalPlaces: extractOwnedExternalPlaces(ownedTrip),
      },
      candidate.journey !== undefined && candidate.journey !== null,
    );
    if (checked.assessment.kind === "BLOCKED") {
      throw new AppError(
        "TRIP_VALIDATION_FAILED",
        "Hành trình chưa đạt toàn bộ kiểm tra để áp dụng.",
        422,
        { validation: checked.validation },
      );
    }
    if (checked.assessment.kind === "UNCHECKED") {
      const ack = input.acknowledgedUnchecked;
      if (!ack?.confirmed || !uncheckedEqual(ack.items, checked.assessment.items)) {
        throw new AppError(
          "UNCHECKED_CONFIRMATION_REQUIRED",
          "Cần xác nhận lại danh sách mục chưa kiểm được của địa điểm ngoài danh mục trước khi lưu.",
          422,
          {
            validation: checked.validation,
            uncheckedItems: checked.assessment.items,
          },
        );
      }
      uncheckedItemsToSave = checked.assessment.items;
    } else {
      uncheckedItemsToSave = null;
    }
    validation = checked.validation;
    nextJourneySnapshot = checked.nextJourneySnapshot;
  }

  const result = await executeIdempotentWrite<ApplyEditResult>({
    ...identity,
    execute: async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "user" WHERE "id" = ${userId} FOR SHARE`;
      const actor = await requireTraveler(headers, {
        ...dependencies.authorization,
        database: transaction as unknown as Pick<Database, "user">,
      });
      if (actor.userId !== userId) {
        throw new AppError("UNAUTHENTICATED", "Vui lòng đăng nhập để tiếp tục.", 401);
      }

      const nextBaseRevision = await persistCandidate(
        transaction,
        tripId,
        actor,
        input.baseRevision,
        candidate,
        input.kind,
        validationTimeReference,
        { ...dependencies, allowLocationIndependent: internalNoLocation },
        nextJourneySnapshot,
        uncheckedItemsToSave,
      );
      return {
        tripId,
        baseRevision: nextBaseRevision,
        kind: input.kind,
        candidate,
        validation,
      };
    },
  });

  return result;
}
