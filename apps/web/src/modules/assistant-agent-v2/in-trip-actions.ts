import "server-only";
import { z } from "zod";
import type { Database } from "@KLTN/db";
import { requireTraveler } from "../../server/auth/require-traveler";
import type { AuthorizationDependencies } from "../../server/authorization/guard";
import { AppError } from "../../server/http/app-error";
import { getTripForEdit, type TripEditRouteProvider } from "../trip-edit/trip-edit-service";
import { editCandidateSchema, diffEditCandidate } from "../trip-edit/edit-candidate";
import { editClarificationSchema, editResolutionSchema } from "../trip-edit/edit-clarification";
import { replanTrip, type ReplanServiceResult } from "../in-trip/replan-service";
import { inTripLocationSchema, normalizeInTripLocation } from "../in-trip/in-trip-location";
import { previewInTrip } from "../in-trip/in-trip-validation";
import { applyEdit, type ApplyEditRequest, type ApplyEditResult } from "../trip-edit/apply-edit";
import type { StructuredLlmClient } from "../preference-extraction/preference-extraction-client";
import type { TripValidation } from "../trip-validation/trip-validation";
import { mandatoryEndpointSchema } from "../in-trip/mandatory-endpoint";
import { splitCompletedRemaining } from "../in-trip/split-trip";
import { tripDayDate } from "../trip-validation/trip-proposal-contract";
import type { AssistantAgentContext } from "./agent-context";
import type { MutationOutcome } from "../../lib/mutation-contract";

export type InTripActionServices = {
  userId: string; tripId: string; headers: Headers; database: Database;
  authorization: AuthorizationDependencies; llm: StructuredLlmClient;
  getRoute: TripEditRouteProvider; now: () => Date;
};
const visit = editCandidateSchema.shape.days.element.shape.visits.element;
const positioned = visit.extend({ dayIndex: z.number().int() });
export const inTripDiffSchema = z.object({ added: z.array(positioned), removed: z.array(positioned),
  updated: z.array(z.object({ visitId: z.string(), before: positioned, after: positioned, changedFields: z.array(z.enum(["dayIndex", "order", "destinationId", "startMinute", "plannedDurationMinutes"])) }).strict()),
  tripChanges: z.object({ startDate: z.object({ before: z.string().nullable(), after: z.string().nullable() }).optional(), durationDays: z.object({ before: z.number(), after: z.number() }).optional(), transport: z.object({ before: z.enum(["CAR", "MOTORCYCLE"]), after: z.enum(["CAR", "MOTORCYCLE"]) }).optional() }).strict(),
}).strict();
const finding = z.object({ group: z.enum(["openingHours", "minimumDuration", "travelTime", "scheduleConflict"]), status: z.enum(["VIOLATION", "INSUFFICIENT_DATA"]), reasonCode: z.string(), message: z.string(), affectedVisitId: z.string().optional(), fromVisitId: z.string().optional(), toVisitId: z.string().optional(), visitIds: z.tuple([z.string(), z.string()]).optional() }).strict();
const group = z.object({ status: z.enum(["SATISFIED", "VIOLATION", "INSUFFICIENT_DATA"]), findings: z.array(finding) }).strict();
export const inTripValidationSchema: z.ZodType<TripValidation> = z.object({ timeReference: z.string(), groups: z.object({ openingHours: group, minimumDuration: group, travelTime: group, scheduleConflict: group }).strict(), canConfirm: z.boolean() }).strict().refine(v => v.canConfirm === Object.values(v.groups).every(g => g.status === "SATISFIED"));
export const savedTripSnapshotSchema = z.object({ tripId: z.string(), baseRevision: z.iso.datetime(), candidate: editCandidateSchema, destinationLabels: z.record(z.string(), z.string()), completedVisitIds: z.array(z.string()), remainingVisitIds: z.array(z.string()) }).strict();
export type SavedTripSnapshot = z.infer<typeof savedTripSnapshotSchema>;
export const inTripReplanInputSchema = z.object({ baseRevision: z.iso.datetime(), need: z.string().trim().min(1).max(500), location: inTripLocationSchema.nullable(), resolution: editResolutionSchema.optional(), scopeDays: z.array(z.number().int().min(1).max(14)).max(14).optional() }).strict();
export const inTripReplanOutputSchema: z.ZodType<ReplanServiceResult> = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ALL_COMPLETED") }).strict(),
  z.object({ status: z.literal("NEEDS_CLARIFICATION"), clarificationReason: editClarificationSchema.shape.code, clarification: editClarificationSchema }).strict(),
  z.object({ status: z.literal("PROPOSED"), candidate: editCandidateSchema, diff: inTripDiffSchema, completedVisitIds: z.array(z.string()), mandatoryEndpoint: mandatoryEndpointSchema.nullable() }).strict(),
]);
export const inTripPreviewInputSchema = z.object({ baseRevision: z.iso.datetime(), candidate: editCandidateSchema, location: inTripLocationSchema.optional(), mandatoryEndpoint: mandatoryEndpointSchema.nullable() }).strict();
export const inTripPreviewOutputSchema = z.object({ validation: inTripValidationSchema, checkedAt: z.iso.datetime(), completedVisitIds: z.array(z.string()) }).strict();
export const inTripApplyInputSchema = inTripPreviewInputSchema.extend({ confirmed: z.literal(true), kind: z.literal("IN_TRIP"), key: z.string().regex(/^[a-zA-Z0-9_-]{8,128}$/) }).strict();
const mutationError = z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() });
export const inTripApplyOutputSchema: z.ZodType<MutationOutcome<ApplyEditResult>> = z.discriminatedUnion("status", [
  z.object({ status: z.literal("SUCCESS"), data: z.object({ tripId: z.string(), baseRevision: z.iso.datetime(), kind: z.enum(["IN_TRIP", "MANUAL", "AI"]), candidate: editCandidateSchema, validation: inTripValidationSchema }).strict(), replayed: z.boolean().optional() }).strict(),
  z.object({ status: z.literal("FAILED"), error: mutationError, httpStatus: z.number().optional() }).strict(),
  z.object({ status: z.literal("UNKNOWN"), error: mutationError, retryWithSameKey: z.literal(true) }).strict(),
]);

async function owned(context: AssistantAgentContext, services?: InTripActionServices) {
  if (!services || services.userId !== context.userId || services.tripId !== context.savedTripId || context.workspace) throw new AppError("IN_TRIP_CONTEXT_REQUIRED", "Thiếu ngữ cảnh hành trình đã xác thực.", 403);
  const actor = await requireTraveler(services.headers, services.authorization);
  if (actor.userId !== context.userId) throw new AppError("FORBIDDEN", "Phiên đăng nhập đã thay đổi.", 403);
  return services;
}
export async function readSavedTrip(context: AssistantAgentContext, services?: InTripActionServices): Promise<SavedTripSnapshot> {
  const s = await owned(context, services);
  const trip = await getTripForEdit(s.headers, s.tripId, { ...s.authorization, database: s.database });
  const split = splitCompletedRemaining({ startDate: trip.candidate.startDate!, durationDays: trip.candidate.durationDays, days: trip.candidate.days.map(day => ({ dayIndex: day.dayIndex, localDate: tripDayDate(trip.candidate.startDate, day.dayIndex)!, visits: day.visits.map(v => ({ ...v, id: v.visitId })) })) }, s.now());
  return { ...trip, completedVisitIds: split.completed.map(v => v.visitId), remainingVisitIds: split.remaining.map(v => v.visitId) };
}
export async function resolveCurrentLocation(input: unknown, context: AssistantAgentContext, services?: InTripActionServices) {
  await readSavedTrip(context, services); return normalizeInTripLocation(input);
}
export async function createInTripProposal(input: z.infer<typeof inTripReplanInputSchema>, context: AssistantAgentContext, services?: InTripActionServices) {
  const s = await owned(context, services);
  const before = input.scopeDays?.length ? await readSavedTrip(context, services) : null;
  const result = await replanTrip(s.tripId, s.userId, input, { database: s.database, llm: s.llm, now: s.now, allowLocationIndependent: input.location === null });
  if (before && result.status === "PROPOSED" && result.candidate.days.some((day, i) => !input.scopeDays!.includes(day.dayIndex) && JSON.stringify(day) !== JSON.stringify(before.candidate.days[i]))) throw new AppError("EDIT_SCOPE_CHANGED", "Phương án đổi ngày ngoài phạm vi yêu cầu; chưa áp dụng.", 422);
  return result;
}
export async function validateInTripProposal(input: z.infer<typeof inTripPreviewInputSchema>, context: AssistantAgentContext, services?: InTripActionServices) {
  const s = await owned(context, services);
  return previewInTrip(s.tripId, s.userId, input, { database: s.database, getRoute: s.getRoute, now: s.now, allowLocationIndependent: !input.location });
}
export async function applyInTripProposal(input: z.infer<typeof inTripApplyInputSchema>, context: AssistantAgentContext, services?: InTripActionServices): Promise<MutationOutcome<ApplyEditResult>> {
  const s = await owned(context, services);
  const { key, ...request } = input;
  // No second idempotency implementation. The shared service handles ownership,
  // replay before revalidation, CAS, completion and transactional success record.
  return applyEdit(s.headers, s.tripId, s.userId, request as ApplyEditRequest, key, { database: s.database, authorization: s.authorization, getRoute: s.getRoute, allowLocationIndependent: !input.location }, s.now);
}
export { diffEditCandidate };
