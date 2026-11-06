import "server-only";
import type { Database, Prisma } from "@KLTN/db";
import { requireTraveler } from "@/server/auth/require-traveler";
import { AppError } from "@/server/http/app-error";
import { executeIdempotentWrite, preflightIdempotentReplay } from "@/server/http/idempotency";
import { recordCompanionItineraryChange } from "../trip-companions/companion-itinerary-notice";
import { retrievePlannerCandidates } from "../trip-planner/planner-candidates";
import { createEditCandidate } from "../trip-edit/edit-candidate";
import { tripRequirementInputSchema } from "../trip-requirement/trip-requirement-contract";
import type { TripProposal } from "../trip-validation/trip-proposal-contract";
import type { TripSaveDependencies } from "../trip-save/trip-save-service";
import { planJourney } from "./journey-planner";
import { freshJourneyValidation, revalidateJourneySnapshot } from "./journey-save-validation";
import { assertJourneyReady } from "./trip-origin-service";
import { assertJourneyBeforeDeparture } from "./journey-cutoff";
import type { TripJourney } from "./trip-origin-contract";
import { journeyEditApplySchema, type JourneyEditApply } from "./journey-edit-contract";
import { journeyVisitFingerprint } from "./journey-saved-contract";

const select = { id: true, userId: true, startDate: true, durationDays: true, transport: true, updatedAt: true, manuallyCompletedAt: true, journeySnapshot: true,
  days: { orderBy: { dayIndex: "asc" as const }, select: { dayIndex: true, visits: { orderBy: { order: "asc" as const }, select: { id: true, destinationId: true, startMinute: true, plannedDurationMinutes: true, order: true } } } } } satisfies Prisma.TripSelect;
type Owned = Prisma.TripGetPayload<{ select: typeof select }>;
export type JourneyEditDependencies = TripSaveDependencies & { now: () => Date };
const conflict = () => new AppError("TRIP_REVISION_CONFLICT", "Hành trình đã thay đổi. Vui lòng tải lại trước khi áp dụng.", 409);
async function owned(database: Pick<Database, "trip">, id: string, userId: string): Promise<Owned> {
  const trip = await database.trip.findFirst({ where: { id, userId }, select });
  if (!trip) throw new AppError("TRIP_NOT_FOUND", "Không tìm thấy chuyến đi.", 404);
  return trip;
}
function assertSameVisits(trip: Owned, candidate: TripProposal): void {
  if (candidate.startDate !== trip.startDate.toISOString().slice(0, 10) || candidate.durationDays !== trip.durationDays || candidate.transport !== trip.transport || candidate.days.length !== trip.days.length || candidate.days.some((day, index) => day.dayIndex !== trip.days[index]!.dayIndex || day.visits.length !== trip.days[index]!.visits.length || day.visits.some((visit, slot) => {
    const before = trip.days[index]!.visits[slot]!;
    return visit.destinationId !== before.destinationId || visit.order !== before.order || visit.plannedDurationMinutes !== before.plannedDurationMinutes;
  }))) throw new AppError("JOURNEY_SCOPE_CHANGED", "Đổi nơi/giờ giữ nguyên ngày, phương tiện và các lượt tham quan đã lưu.", 422);
}

export async function previewJourneyEdit(headers: Headers, id: string, input: { baseRevision: string; journey: TripJourney }, deps: JourneyEditDependencies) {
  const actor = await requireTraveler(headers, deps);
  const trip = await owned(deps.database, id, actor.userId);
  if (trip.updatedAt.toISOString() !== input.baseRevision) throw conflict();
  assertJourneyBeforeDeparture(trip, deps.now());
  assertJourneyReady(input.journey, trip.days.at(-1)?.visits.length === 0);
  if (!deps.journeyRoutes) throw new AppError("JOURNEY_ROUTING_UNAVAILABLE", "Chưa thể tính lại chặng đi/về.", 503);
  const ids = trip.days.flatMap(day => day.visits.map(visit => visit.destinationId));
  const rows = await retrievePlannerCandidates(deps.database, ids);
  if (rows.length !== new Set(ids).size) throw new AppError("DESTINATION_UNAVAILABLE", "Có điểm đến không còn khả dụng.", 422);
  const byId = new Map(rows.map(row => [row.id, row]));
  const selected = trip.days.map(day => day.visits.map(visit => ({ ...byId.get(visit.destinationId)!, suggestedDurationMinutes: visit.plannedDurationMinutes })));
  const requirement = tripRequirementInputSchema.parse({ startDate: trip.startDate.toISOString().slice(0, 10), durationDays: trip.durationDays, transport: trip.transport, journey: input.journey });
  const scheduled = await planJourney(requirement, selected, deps.journeyRoutes);
  const candidate: TripProposal = { startDate: requirement.startDate, durationDays: trip.durationDays, transport: trip.transport, journey: input.journey, days: scheduled.days.map(day => ({ dayIndex: day.day, visits: day.stops.map(stop => ({ destinationId: stop.destination.id, order: stop.order, startMinute: stop.arrivalMinute ?? 0, plannedDurationMinutes: trip.days[day.day - 1]!.visits[stop.order - 1]!.plannedDurationMinutes })) })) };
  // Never turn unknown arrival into an applicable 00:00 candidate.
  if (scheduled.days.some(day => day.stops.some(stop => stop.arrivalMinute === null))) return { baseRevision: input.baseRevision, candidate: null, journeyPlan: scheduled.journeyPlan, check: scheduled.check, eligibleForConfirmation: false };
  const validation = revalidateJourneySnapshot(candidate, byId, scheduled.journeyPlan, deps.now()).validation;
  return { baseRevision: input.baseRevision, candidate, journeyPlan: scheduled.journeyPlan, validation, eligibleForConfirmation: validation.canConfirm };
}

export async function applyJourneyEdit(headers: Headers, id: string, request: JourneyEditApply, key: string, deps: JourneyEditDependencies) {
  const actor = await requireTraveler(headers, deps);
  if (!journeyEditApplySchema.safeParse(request).success) throw new AppError("INVALID_JOURNEY_EDIT", "Cần xác nhận phương án trước khi áp dụng.", 400);
  const initial = await owned(deps.database, id, actor.userId);
  const identity = { database: deps.database, actorId: actor.userId, operation: "trip:journey-edit", key, input: { tripId: id, ...request } };
  const replay = await preflightIdempotentReplay<{ tripId: string; baseRevision: string }>(identity);
  if (replay.status !== "ABSENT") return replay;
  assertJourneyBeforeDeparture(initial, deps.now());
  if (initial.updatedAt.toISOString() !== request.baseRevision) throw conflict();
  assertSameVisits(initial, request.candidate);
  if (!deps.journeyRoutes) throw new AppError("JOURNEY_ROUTING_UNAVAILABLE", "Chưa thể kiểm tra chặng đi/về.", 503);
  const ids = initial.days.flatMap(day => day.visits.map(visit => visit.destinationId));
  const rows = await retrievePlannerCandidates(deps.database, ids);
  const destinations = new Map(rows.map(row => [row.id, row]));
  const fresh = await freshJourneyValidation(request.candidate, destinations, deps.journeyRoutes, deps.now());
  if (!fresh.validation.canConfirm) throw new AppError("TRIP_VALIDATION_FAILED", "Phương án chưa đủ điều kiện áp dụng.", 422, { validation: fresh.validation });
  return executeIdempotentWrite({ ...identity, execute: async tx => {
    await requireTraveler(headers, { ...deps, database: tx as unknown as Database });
    await tx.$queryRaw`SELECT "id" FROM "trip" WHERE "id" = ${id} AND "userId" = ${actor.userId} FOR UPDATE`;
    const current = await owned(tx as unknown as Database, id, actor.userId);
    assertJourneyBeforeDeparture(current, deps.now());
    if (current.updatedAt.toISOString() !== request.baseRevision) throw conflict();
    assertSameVisits(current, request.candidate);
    const canonical = await retrievePlannerCandidates(tx as unknown as Database, ids);
    if (canonical.length !== rows.length || canonical.some(row => { const before = destinations.get(row.id); return !before || row.latitude !== before.latitude || row.longitude !== before.longitude; })) throw new AppError("TRIP_DATA_CHANGED", "Dữ liệu định tuyến đã thay đổi.", 409);
    const checked = revalidateJourneySnapshot(request.candidate, new Map(canonical.map(row => [row.id, row])), fresh.plan, deps.now());
    if (!checked.validation.canConfirm) throw new AppError("TRIP_VALIDATION_FAILED", "Dữ liệu hiện tại chưa đáp ứng phương án.", 422, { validation: checked.validation });
    const revision = new Date(Math.max(deps.now().getTime(), current.updatedAt.getTime() + 1));
    const result = await tx.trip.updateMany({ where: { id, userId: actor.userId, updatedAt: current.updatedAt, manuallyCompletedAt: null }, data: { journeySnapshot: JSON.parse(JSON.stringify({ revision: "journey-save-v1", journey: request.candidate.journey, plan: checked.plan, visitFingerprint: journeyVisitFingerprint(request.candidate.days) })), updatedAt: revision } });
    if (result.count !== 1) throw conflict();
    for (const day of request.candidate.days) for (const visit of day.visits) {
      const original = current.days[day.dayIndex - 1]!.visits[visit.order - 1]!;
      await tx.itineraryVisit.update({ where: { id: original.id }, data: { startMinute: visit.startMinute } });
    }
    const before = createEditCandidate(current);
    const after = { ...before, days: before.days.map(day => ({ ...day, visits: day.visits.map(visit => ({ ...visit, startMinute: request.candidate.days[day.dayIndex - 1]!.visits[visit.order - 1]!.startMinute })) })) };
    await recordCompanionItineraryChange(tx, id, before, after);
    return { tripId: id, baseRevision: revision.toISOString(), validation: checked.validation };
  } });
}
