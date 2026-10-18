import type { Database, Prisma } from "@KLTN/db";
import { z } from "zod";

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
  previewEdit,
  type TripEditServiceDependencies,
} from "./trip-edit-service";
import { tripDayDate } from "../trip-validation/trip-proposal-contract";
import type { TripValidation } from "../trip-validation/trip-validation";

export const applyEditRequestSchema = z
  .object({
    baseRevision: z.iso.datetime(),
    candidate: editCandidateSchema,
    confirmed: z.literal(true),
    kind: z.enum(["MANUAL", "AI", "IN_TRIP"]),
  })
  .strict();

export type ApplyEditRequest = z.infer<typeof applyEditRequestSchema>;

const tripApplySelect = {
  id: true,
  userId: true,
  startDate: true,
  durationDays: true,
  transport: true,
  updatedAt: true,
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
          startMinute: true,
          plannedDurationMinutes: true,
          order: true,
        },
      },
    },
  },
} satisfies Prisma.TripSelect;

type TripForApply = Prisma.TripGetPayload<{ select: typeof tripApplySelect }>;

export type InTripCompletedVisitInvariant = (input: {
  original: EditCandidate;
  candidate: EditCandidate;
  timeReference: Date;
}) => void;

export type ApplyEditDependencies = TripEditServiceDependencies & {
  authorization: AuthorizationDependencies;
  /** US-36/task 289 will wire the completed-visit invariant into this hook. */
  assertInTripCompletedVisitsUnchanged?: InTripCompletedVisitInvariant;
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
  if (kind !== "IN_TRIP" || !dependencies.assertInTripCompletedVisitsUnchanged) return;
  dependencies.assertInTripCompletedVisitsUnchanged({
    original: createEditCandidate(originalTrip),
    candidate,
    timeReference,
  });
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
  return trip;
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
): Promise<string> {
  const trip = await findOwnedTrip(tripId, actor.userId, transaction as unknown as Pick<Database, "trip">);
  if (trip.updatedAt.toISOString() !== baseRevision) throw revisionConflict();
  assertCandidateMatchesTrip(trip, candidate);
  assertInTripVisitsUnchanged(kind, trip, candidate, timeReference, dependencies);

  const nextRevision = nextBaseRevision(trip.updatedAt, timeReference);
  const revisionUpdate = await transaction.trip.updateMany({
    where: { id: tripId, userId: actor.userId, updatedAt: trip.updatedAt },
    data: { updatedAt: nextRevision },
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
            destinationId: visit.destinationId,
            startMinute: visit.startMinute,
            plannedDurationMinutes: visit.plannedDurationMinutes,
            order: visit.order,
          })),
        },
      },
    });
  }
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
  timeReference: Date,
) {
  const parsed = applyEditRequestSchema.safeParse(request);
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
    input: { tripId, baseRevision: input.baseRevision, kind: input.kind, candidate },
  };
  const replay = await preflightIdempotentReplay<ApplyEditResult>(identity);
  if (replay.status !== "ABSENT") return replay;

  assertCandidateCanBeSaved(candidate);
  assertInTripVisitsUnchanged(input.kind, ownedTrip, candidate, timeReference, dependencies);

  const validationPreview = await previewEdit(
    tripId,
    userId,
    input.baseRevision,
    candidate,
    dependencies,
    timeReference,
  );
  if (!validationPreview.validation.canConfirm) {
    throw new AppError(
      "TRIP_VALIDATION_FAILED",
      "Hành trình chưa đạt toàn bộ kiểm tra để áp dụng.",
      422,
      { validation: validationPreview.validation },
    );
  }

  const result = await executeIdempotentWrite<ApplyEditResult>({
    ...identity,
    execute: async (transaction) => {
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
        timeReference,
        dependencies,
      );
      return {
        tripId,
        baseRevision: nextBaseRevision,
        kind: input.kind,
        candidate,
        validation: validationPreview.validation,
      };
    },
  });

  return result;
}
