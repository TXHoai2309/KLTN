import "server-only";
import { z } from "zod";
import { AppError } from "../../server/http/app-error";
import { planningAnalysisSchema, planningDialogueContextSchema, planningGeneratedSchema, planningNeedsSchema, planningWorkspaceSchema } from "../assistant-planning/planning-contract";
import { executePlanning, planningProposalHash, type PlanningDependencies } from "../assistant-planning/planning-service";
import { generatePlanningProposal } from "../assistant-planning/planning-engine";
import { planningHash } from "../assistant-planning/planning-repository";
import type { AssistantAgentContext } from "./agent-context";
import { assessPlanningReadiness } from "./planning-readiness";
import { choiceIndex } from "../assistant-planning/planning-dialogue";

export type PlanningActionServices = { userId: string; dependencies: PlanningDependencies };
export const planningTurnKeySchema = z.string().regex(/^[a-zA-Z0-9_-]{8,128}$/);
export const understandBriefInputSchema = z.object({
  mode: z.literal("PREFERENCE_REFINEMENT").optional(),
  interleaving: z.object({ subjectName: z.string().min(1).max(200).nullable() }).strict().optional(),
  readOnly: z.boolean().optional(),
  text: z.string().trim().min(1).max(1000),
  dialogue: planningDialogueContextSchema,
  unresolved: planningAnalysisSchema.shape.unresolved,
}).strict();
export const generatePreliminaryInputSchema = z.object({
  needs: planningNeedsSchema, key: planningTurnKeySchema,
}).strict();
export const preliminaryActionOutputSchema = z.object({
  workspace: planningWorkspaceSchema,
  generated: planningGeneratedSchema.omit({ reply: true }).extend({ version: z.number().int().nonnegative() }),
}).strict();
export const refinePreliminaryInputSchema = generatePreliminaryInputSchema.extend({ current: planningGeneratedSchema }).strict();
export const refinementActionOutputSchema = z.discriminatedUnion("outcome", [
  preliminaryActionOutputSchema.extend({ outcome: z.literal("PUBLISHED") }).strict(),
  z.object({ outcome: z.literal("REJECTED"), candidate: planningGeneratedSchema }).strict(),
]);

async function ownedPlanning(context: AssistantAgentContext, services?: PlanningActionServices, versioned = true) {
  if (!services || services.userId !== context.userId || !context.workspace) {
    throw new AppError("PLANNING_CONTEXT_REQUIRED", "Cần ngữ cảnh lập hành trình đã được xác thực.", 403);
  }
  const deps = services.dependencies;
  const owned = versioned
    ? await deps.repository.assertVersion(context.workspace.conversationId, context.workspace.version)
    : await deps.repository.read(context.workspace.conversationId);
  if (owned.savedTripId || owned.pendingSaveKey) throw new AppError("PLANNING_CHANGED", "Hãy mở lại trạng thái hiện tại trước khi lập hành trình.", 409);
  return { deps, owned };
}

export async function understandPlanningBrief(input: z.infer<typeof understandBriefInputSchema>, context: AssistantAgentContext, services?: PlanningActionServices) {
  const { deps } = await ownedPlanning(context, services, !input.readOnly);
  const unresolved = input.unresolved[0];
  const choice = unresolved?.choices[choiceIndex(input.text, unresolved.choices)];
  if (unresolved && choice) {
    // Reuse V1's bound choice matcher and the existing name resolver; do not
    // guess an ID or implement a second destination normalization table.
    const text = `${unresolved.remove ? "Không muốn đi" : unresolved.required ? "Nhất định muốn ghé" : "Muốn ghé"} ${choice.name}`;
    const analysis = await deps.analyze(text, context.workspace!.needs, await deps.candidates(), input.unresolved.slice(1), { ...input.dialogue, current: null }, deps.now(), input.mode, input.interleaving);
    return { ...analysis, needs: jsonNeeds(analysis.needs) };
  }
  const analysis = await deps.analyze(input.text, context.workspace!.needs, await deps.candidates(), input.unresolved, input.dialogue, deps.now(), input.mode, input.interleaving);
  return { ...analysis, needs: jsonNeeds(analysis.needs) };
}

/** V1 crosses HTTP JSON before REVIEW. Internal V2 must omit unset optional
 * properties too: the existing analyzer clears date windows with undefined,
 * which the strict idempotency contract correctly rejects as non-JSON. */
function jsonNeeds(needs: z.infer<typeof planningNeedsSchema>) {
  return planningNeedsSchema.parse(JSON.parse(JSON.stringify(needs)));
}

/** Adapt to the canonical REVIEW/GENERATE operations. They retain ownership,
 * idempotency, eligible candidate checks, scheduling, validation and publication.
 * V1's language-only composer is disabled here; the action returns data only. */
export async function generatePreliminaryProposal(input: z.infer<typeof generatePreliminaryInputSchema>, context: AssistantAgentContext, services?: PlanningActionServices) {
  // REVIEW must resolve its identical key/payload replay before checking the
  // old version, just like V1. A lost REVIEW acknowledgement cannot block retry.
  const { deps, owned } = await ownedPlanning(context, services, false);
  if (!assessPlanningReadiness(input.needs).canDraft) throw new AppError("TRIP_NEEDS_INCOMPLETE", "Cần số ngày và phương tiện hỗ trợ trước khi tạo đề xuất.", 422);
  const business = { ...deps, compose: undefined };
  const reviewed = planningWorkspaceSchema.parse(await executePlanning({
    action: "REVIEW", conversationId: owned.conversationId, version: context.workspace!.version, needs: input.needs,
  }, planningHash({ key: input.key, phase: "v2-review" }), business));
  const raw = await executePlanning({
    action: "GENERATE", conversationId: reviewed.conversationId, version: reviewed.version,
    previous: null, instruction: "",
  }, planningHash({ key: input.key, phase: "v2-generate" }), business);
  const { reply: _reply, ...data } = planningGeneratedSchema.parse(raw);
  const generated = preliminaryActionOutputSchema.shape.generated.parse(data);
  return { workspace: { ...reviewed, version: generated.version }, generated };
}

/** Preference-driven regeneration: no surgical edits and no REVIEW that could
 * clear the old fingerprint. Only publish an accepted candidate after the
 * existing pipeline has returned and rechecked authoritative data. */
export async function refinePreliminaryProposal(input: z.infer<typeof refinePreliminaryInputSchema>, context: AssistantAgentContext, services?: PlanningActionServices) {
  const { deps, owned } = await ownedPlanning(context, services);
  if (input.current.version !== owned.version) throw new AppError("PLANNING_CHANGED", "Đề xuất cần tinh chỉnh đã cũ.", 409);
  const previousHash = planningProposalHash(input.current.proposal);
  await deps.repository.assertProposal(owned.conversationId, owned.version, previousHash);
  if (!assessPlanningReadiness(input.needs).canDraft) throw new AppError("TRIP_NEEDS_INCOMPLETE", "Thông tin mới cần được làm rõ trước khi tinh chỉnh.", 422);
  const previous = { days: input.current.proposal.days.map(day => day.stops.map(stop => stop.destination.id)) };
  const candidate = planningGeneratedSchema.parse(await generatePlanningProposal({
    needs: input.needs, candidates: await deps.candidates(), previous,
    instruction: "Refine the current preliminary itinerary using all updated explicit needs. Keep unspecified preferences unchanged. Do not invent accessibility evidence or destination facts.",
    routes: deps.routes, generate: deps.generate, now: deps.now(), recheck: deps.recheck,
  }));
  if (candidate.proposal.status === "NO_FEASIBLE_ITINERARY" || candidate.repairError || !candidate.proposal.days.some(day => day.stops.length)) return { outcome: "REJECTED" as const, candidate };
  let published;
  try {
    published = await deps.repository.publishProposal(owned.conversationId, owned.version, planningProposalHash(candidate.proposal), planningHash({ key: input.key, phase: "v2-refine" }), { needs: input.needs, previousHash });
  } catch (cause) {
    // A lost DB acknowledgement is not a confirmed failure or a confirmed new
    // canonical proposal. The session freezes writes instead of retrying work.
    if (!(cause instanceof AppError) || cause.status >= 500) throw new AppError("OPERATION_STATUS_UNKNOWN", "Chưa rõ kết quả công bố đề xuất tinh chỉnh. Giữ nguyên mã yêu cầu để đối soát.", 503);
    throw cause;
  }
  return { outcome: "PUBLISHED" as const, workspace: published, generated: { ...candidate, version: published.version } };
}
