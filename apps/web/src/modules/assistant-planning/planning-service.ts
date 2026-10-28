import { AppError } from "../../server/http/app-error";
import type { PlannerCandidate } from "../trip-planner/planner-candidates";
import { planningNeedsSchema, type PlanningNeeds, type PlanningRequest, type PlanningAnalysis, type PlanningDialogueContext } from "./planning-contract";
import type { PlanningRepository } from "./planning-repository";
import { planningHash } from "./planning-repository";
import { generatePlanningProposal, type PlanningGenerator } from "./planning-engine";
import type { RouteProvider } from "../trip-planner/planner-routes";
import { toSaveProposal } from "../trip-save/trip-save-adapter";
import { tripRequirementInputSchema } from "../trip-requirement/trip-requirement-contract";
import type { TripSaveRequest } from "../trip-save/trip-save-contract";
import type { MutationOutcome } from "../../lib/mutation-contract";
import { assertStartDateForFinalConfirmation } from "../trip-requirement/trip-requirement-readiness";
import { vietnamDateOf } from "../trip-requirement/trip-requirement-readiness";
import { formatVietnameseDate } from "../../lib/date-only";
import { nextNeedsPrompt, proposalReply } from "./planning-dialogue";
import { safePlanningReply, type PlanningReplyComposer } from "./planning-reply";

export type PlanningDependencies = {
  repository: PlanningRepository; candidates: () => Promise<PlannerCandidate[]>;
  analyze: (text: string, draft: PlanningNeeds, candidates: readonly PlannerCandidate[], unresolved: PlanningAnalysis["unresolved"], dialogue?: PlanningDialogueContext, now?: Date) => Promise<PlanningAnalysis>;
  compose?: PlanningReplyComposer;
  generate: PlanningGenerator; routes: RouteProvider;
  recheck: (selected: readonly PlannerCandidate[]) => Promise<boolean>;
  save: (input: TripSaveRequest, key: string) => Promise<MutationOutcome<{ tripId: string; validation: unknown }>>;
  validateForSave: (input: TripSaveRequest) => Promise<{ canConfirm: boolean }>;
  now: () => Date;
};
export const planningProposalHash = (proposal: { requirement: unknown; days: unknown }) => planningHash({ requirement: proposal.requirement, days: proposal.days });

async function completeSave(id: string, input: TripSaveRequest, key: string, deps: PlanningDependencies) {
  let result: Awaited<ReturnType<PlanningDependencies["save"]>>;
  try { result = await deps.save(input, key); }
  catch (error) {
    if (error instanceof AppError) { await deps.repository.finishSave(id, key, null); throw error; }
    throw new AppError("OPERATION_STATUS_UNKNOWN", "Chưa rõ kết quả lưu. Hãy kiểm tra lại cùng thao tác.", 503);
  }
  if (result.status !== "UNKNOWN") await deps.repository.finishSave(id, key, result.status === "SUCCESS" ? result.data.tripId : null);
  return { save: result };
}
export async function executePlanning(request: PlanningRequest, key: string, deps: PlanningDependencies) {
  const today = vietnamDateOf(deps.now());
  if (request.action === "START") return { ...await deps.repository.start(request.conversationId, key, request.context), today };
  if (request.action === "READ") return { ...await deps.repository.read(request.conversationId), today };
  if (request.action === "CHECKPOINT") return deps.repository.checkpoint(request, key);
  if (request.action === "RECONCILE") {
    const current = await deps.repository.read(request.conversationId);
    if (!current.pendingSaveKey) return { workspace: current };
    const pending = await deps.repository.pendingSave(request.conversationId);
    if (!pending) throw new AppError("OPERATION_STATUS_UNKNOWN", "Chưa rõ kết quả lưu. Vui lòng giữ mã thao tác và kiểm tra lại.", 503);
    try { await completeSave(request.conversationId, pending.input, pending.key, deps); }
    catch (error) {
      if (!(error instanceof AppError) || error.status >= 500) throw error;
      return { workspace: await deps.repository.read(request.conversationId), message: error.message };
    }
    return { workspace: await deps.repository.read(request.conversationId) };
  }
  // Resolve a committed-but-response-lost save before consulting current date,
  // routes or destination data. Exact key/hash checks still run below.
  if (request.action === "SAVE") await deps.repository.read(request.conversationId);
  // REVIEW reconciles its persisted idempotency result before checking the old
  // version. A lost response must not turn a committed review into a conflict.
  if (request.action === "REVIEW") {
    const needs = planningNeedsSchema.parse(request.needs);
    // Confirmed requirements are canonical before any AI planning invocation.
    const requirement = tripRequirementInputSchema.safeParse(needs.requirement);
    if (!requirement.success) throw new AppError("TRIP_NEEDS_INCOMPLETE", "Hãy kiểm tra số ngày, phương tiện và các nhu cầu đã chọn.", 422);
    needs.requirement = requirement.data;
    const candidates = await deps.candidates();
    const eligible = new Set(candidates.map(c => c.id));
    if ([...needs.requiredDestinationIds, ...needs.preferredDestinationIds].some(id => !eligible.has(id))) throw new AppError("DESTINATION_UNAVAILABLE", "Có điểm đến không còn khả dụng. Vui lòng chọn lại.", 422);
    needs.destinationNames = Object.fromEntries(candidates.filter(c => needs.requiredDestinationIds.includes(c.id) || needs.preferredDestinationIds.includes(c.id) || needs.excludedDestinationIds?.includes(c.id)).map(c => [c.id, c.name]));
    return { ...await deps.repository.review(request.conversationId, request.version, needs, key), today };
  }
  const workspace = await deps.repository.assertVersion(request.conversationId, request.version, request.action === "SAVE");
  if (request.action === "ANALYZE") {
    const analysis = await deps.analyze(request.text, request.draft, await deps.candidates(), request.unresolved, request.dialogue, deps.now());
    if (analysis.intent === "QA" || analysis.intent === "DISPLAY" || analysis.operation || analysis.unresolved.length) return analysis;
    const next = nextNeedsPrompt(analysis.needs, !!analysis.needs.dateDeferred, !!analysis.needs.preferencesDone, today);
    const dateChanged = analysis.needs.requirement.startDate && analysis.needs.requirement.startDate !== request.draft.requirement.startDate;
    const canonical = analysis.intent === "CLARIFY" ? analysis.message : `${dateChanged && next.prompt.kind !== "RECAP" ? `Mình ghi nhận ngày khởi hành ${formatVietnameseDate(analysis.needs.requirement.startDate!)} nhé.\n` : ""}${next.message}`;
    return { ...analysis, followUpMessage: await safePlanningReply(deps.compose, { kind: analysis.intent === "CLARIFY" ? "CLARIFY" : next.prompt.kind === "RECAP" ? "RECAP" : "NEED", canonical, needs: analysis.needs, latestText: request.text, field: next.prompt.kind === "NEED" ? next.prompt.field : undefined, dialogue: request.dialogue }) };
  }
  if (request.action === "GENERATE") {
    if (workspace.savedTripId) throw new AppError("TRIP_ALREADY_SAVED", "Chuyến này đã lưu. Mở chuyến đi để chỉnh sửa hoặc chủ động lập chuyến khác.", 422);
    if (workspace.needs.requirement.startDate && workspace.needs.requirement.startDate < today) throw new AppError("TRIP_START_DATE_PAST", "Ngày khởi hành đã qua. Bạn chọn lại ngày rồi xác nhận nhu cầu trước khi tạo nhé.", 422);
    const result = await generatePlanningProposal({ needs: workspace.needs, candidates: await deps.candidates(), previous: request.previous, instruction: request.instruction, edit: request.edit, routes: deps.routes, generate: deps.generate, now: deps.now(), recheck: deps.recheck });
    const published = await deps.repository.publishProposal(request.conversationId, request.version, planningProposalHash(result.proposal), key);
    const reply = await safePlanningReply(deps.compose, { kind: "PROPOSAL", canonical: proposalReply(result), needs: workspace.needs, latestText: request.instruction, eligibleForSave: result.proposal.eligibleForFinalConfirmation,
      result: { days: result.proposal.days.map(d => ({ day: d.day, date: d.date, stops: d.stops.map(s => s.destination.name) })), checks: result.proposal.checks.map(c => ({ key: c.key, status: c.status, issues: c.issues.slice(0, 3).map(i => i.message) })) } });
    return { ...result, version: published.version, reply };
  }
  const proposal = toSaveProposal(request.proposal);
  const requirement = tripRequirementInputSchema.parse(workspace.needs.requirement);
  if (!proposal || requirement.mobilityConstraints || JSON.stringify(request.proposal.requirement) !== JSON.stringify(requirement) || workspace.needs.requiredDestinationIds.some(id => !proposal.days.some(d => d.visits.some(v => v.destinationId === id))) || proposal.days.some(d => d.visits.some(v => workspace.needs.excludedDestinationIds?.includes(v.destinationId))))
    throw new AppError("TRIP_VALIDATION_FAILED", "Đề xuất chưa đáp ứng nhu cầu đã xác nhận. Vui lòng tạo lại và kiểm tra.", 422);
  const input: TripSaveRequest = { confirm: true, proposal };
  const completed = await deps.repository.completedSave(request.conversationId, key, planningHash(input));
  if (completed) return { save: { status: "SUCCESS" as const, data: { tripId: completed } } };
  const pending = await deps.repository.pendingSave(request.conversationId);
  if (pending) {
    if (pending.key !== key || planningHash(pending.input) !== planningHash(input)) throw new AppError("PLANNING_CHANGED", "Có thao tác lưu khác đang được đối soát. Hãy kiểm tra lại kết quả.", 409);
    // Canonical save performs replay first, then any fresh checks. Its known
    // failure is terminal and must release this already-reserved intent.
    return completeSave(request.conversationId, pending.input, pending.key, deps);
  }
  await deps.repository.assertProposal(request.conversationId, request.version, planningProposalHash(request.proposal));
  assertStartDateForFinalConfirmation(requirement, deps.now());
  // The only durable visit payload is an explicitly confirmed save intent that
  // has just passed authoritative validation. It is erased on terminal outcome.
  if (!(await deps.validateForSave(input)).canConfirm) throw new AppError("TRIP_VALIDATION_FAILED", "Hành trình chưa đủ điều kiện lưu.", 422);
  await deps.repository.reserveSave(request.conversationId, request.version, key, planningHash(input), input);
  return completeSave(request.conversationId, input, key, deps);
}
