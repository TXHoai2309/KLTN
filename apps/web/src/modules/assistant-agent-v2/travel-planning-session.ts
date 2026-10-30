import "server-only";
import { z } from "zod";
import { AppError } from "../../server/http/app-error";
import { requireTraveler } from "../../server/auth/require-traveler";
import type { AuthorizationDependencies } from "../../server/authorization/guard";
import { planningWorkspaceSchema, planningNeedsSchema, planningGeneratedSchema, planningUnresolvedSchema, type PlanningAnalysis, type PlanningDialogueContext, type PlanningGenerated, type PlanningNeeds } from "../assistant-planning/planning-contract";
import { choiceIndex, planningReply } from "../assistant-planning/planning-dialogue";
import type { EditClarification, EditResolution } from "../trip-edit/edit-clarification";
import type { BoundedEdit } from "./planning-replanning";
import { boundedEditSchema } from "./planning-replanning";
import { editClarificationSchema } from "../trip-edit/edit-clarification";
import type { PlanningDependencies } from "../assistant-planning/planning-service";
import { createAssistantAgentContext } from "./agent-context";
import { executeAssistantV2Action, runAssistantV2 } from "./agent-runtime";
import { planningTurnKeySchema } from "./planning-actions";
import { assessPlanningReadiness } from "./planning-readiness";
import { assessPlanningRefinement } from "./planning-refinement";
import { AssistantV2Error } from "./agent-errors";
import { composePlanningV2Reply, planningResponsePlan, safePlanningV2Reply, type PlanningResponsePlan, type PlanningV2ReplyComposer } from "./planning-response";
import { analyzeCurrentProposal } from "./planning-guidance";
import { createPlanningQaSession, planningQaStateSchema } from "./qa-session";
import type { QaActionServices } from "./qa-actions";
import type { QaContext } from "../ai/qa-contract";

type SessionDependencies = {
  authorization: AuthorizationDependencies;
  forActor: (userId: string, headers: Headers) => PlanningDependencies;
  compose?: PlanningV2ReplyComposer;
  qaForActor?: (userId: string, headers: Headers) => QaActionServices | Promise<QaActionServices>;
};
export type PlanningV2Turn = {
  workspace: z.infer<typeof planningWorkspaceSchema>;
  readiness: ReturnType<typeof assessPlanningReadiness>;
  responsePlan: PlanningResponsePlan;
  message: string;
  generated: PlanningGenerated | null;
  latestNeeds: PlanningNeeds;
  refinementCandidate: PlanningGenerated | null;
  uncertain: boolean;
};
const turnInputSchema = z.object({ text: z.string().trim().min(1).max(1000), key: planningTurnKeySchema }).strict();
type LastTurn = { key: string; text: string; result: Promise<PlanningV2Turn> };
/** Bounded dialogue memory and the longest user question passed to guidance wording. */
const RECENT_LIMIT = 4, GUIDANCE_QUESTION_LIMIT = 300;
const causeCode = (cause: unknown) => cause instanceof AppError ? cause.code : null;
export const planningSessionStateSchema = z.object({
  workspace: planningWorkspaceSchema, needs: planningNeedsSchema,
  unresolved: z.array(planningUnresolvedSchema).max(8),
  recent: z.array(z.object({ question: z.string().max(1000), reply: z.string().max(4000) }).strict()).max(RECENT_LIMIT),
  previousPlan: z.object({ goal: z.enum(["ASK_DURATION", "ASK_TRANSPORT", "CLARIFY"]), clarificationField: z.enum(["durationDays", "transport", "destinations", "startDate", "interests", "pace", "companions", "mobility", "refinement", "tripStructure"]).optional() }).strict().nullable(),
  previousMessage: z.string().max(4000), generated: planningGeneratedSchema.nullable(),
  pendingClarificationNeeds: planningNeedsSchema.nullable(), uncertain: z.boolean(), qaInterrupted: z.boolean(),
  pendingReplan: z.object({ text: z.string().max(1000), edit: boundedEditSchema, clarification: editClarificationSchema, dependencyDays: z.array(z.number().int().min(1).max(14)).max(14), version: z.number().int().nonnegative() }).strict().nullable(),
  qa: planningQaStateSchema,
}).strict();
export type PlanningSessionState = z.infer<typeof planningSessionStateSchema>;

/** Server-side planning session behind the shared `/api/ai/planning` endpoint
 * (selected by the runtime gate). It authenticates before loading private state
 * and keeps the existing needs/turn models in the active server interaction;
 * there is no durable proposal store or background job. */
export async function startTravelPlanningV2Session(input: { headers: Headers; conversationId: string | null; key: string; context?: QaContext; resume?: PlanningSessionState }, boundaries: SessionDependencies) {
  const actor = await requireTraveler(input.headers, boundaries.authorization);
  const key = planningTurnKeySchema.parse(input.key);
  const deps = boundaries.forActor(actor.userId, input.headers);
  const restored = input.resume ? planningSessionStateSchema.parse(input.resume) : null;
  let workspace = restored?.workspace ?? planningWorkspaceSchema.parse(await deps.repository.start(input.conversationId, key, input.context));
  if (restored) await deps.repository.read(workspace.conversationId);
  if (!restored && (workspace.savedTripId || workspace.pendingSaveKey || workspace.version || workspace.checkpoint?.resume === "REGENERATE")) {
    throw new AppError("PLANNING_V2_SCOPE", "V2 hiện chỉ nhận phiên lập chuyến mới; hãy dùng luồng hiện tại cho hành trình đã có.", 409);
  }
  let needs = restored?.needs ?? workspace.checkpoint?.needs ?? workspace.needs;
  let unresolved: PlanningAnalysis["unresolved"] = restored?.unresolved ?? workspace.checkpoint?.unresolved ?? [];
  const recent: PlanningDialogueContext["recent"] = restored?.recent ?? [];
  const remember = (question: string, reply: string) => { recent.push({ question, reply }); if (recent.length > RECENT_LIMIT) recent.shift(); };
  let previousPlan: Pick<PlanningResponsePlan, "goal" | "clarificationField"> | null = restored?.previousPlan ?? null;
  let previousMessage = restored?.previousMessage ?? "";
  let generated: PlanningGenerated | null = restored?.generated ?? null;
  let pendingClarificationNeeds: PlanningNeeds | null = restored?.pendingClarificationNeeds ?? null;
  let uncertain = restored?.uncertain ?? false;
  let qaInterrupted = restored?.qaInterrupted ?? false;
  const qaSession = createPlanningQaSession(actor.userId, input.headers, boundaries.qaForActor ? () => boundaries.qaForActor!(actor.userId, input.headers) : undefined, workspace.context, restored?.qa);
  let pendingReplan: { text: string; edit: BoundedEdit; clarification: EditClarification; dependencyDays: number[]; version: number } | null = restored?.pendingReplan ?? null;
  let busy = false;
  let last: LastTurn | null = null;
  let frozen: LastTurn | null = null;
  const services = { planning: { userId: actor.userId, dependencies: deps } };

  /** Every returned turn is a snapshot; callers cannot mutate session state through it. */
  const turnResult = (responsePlan: PlanningResponsePlan, message: string, refinementCandidate: PlanningGenerated | null = null) => ({
    workspace: structuredClone(generated ? workspace : { ...workspace, needs }), latestNeeds: structuredClone(needs), readiness: assessPlanningReadiness(needs),
    responsePlan, message, generated: generated ? structuredClone(generated) : null, refinementCandidate, uncertain,
  });

  async function turn(text: string, turnKey: string): Promise<PlanningV2Turn> {
    // Recheck persisted role/ownership/version on each turn; IDs or an old
    // in-memory session do not grant continuing authority.
    const currentActor = await requireTraveler(input.headers, boundaries.authorization);
    if (currentActor.userId !== actor.userId) throw new AppError("FORBIDDEN", "Phiên đăng nhập đã thay đổi.", 403);
    const current = uncertain ? await deps.repository.read(workspace.conversationId) : await deps.repository.assertVersion(workspace.conversationId, workspace.version);
    if (current.savedTripId || current.pendingSaveKey) throw new AppError("PLANNING_CHANGED", "Trạng thái hành trình đã thay đổi.", 409);
    const context = createAssistantAgentContext({ userId: actor.userId, workspace: { ...workspace, needs: pendingClarificationNeeds ?? needs } });
    const active = runAssistantV2({ skill: "travel-planning", context });
    let plan: PlanningResponsePlan;
    let refinementCandidate: PlanningGenerated | null = null;
    let responseSkill = active.skill;
    async function replan(request: { text: string; edit?: BoundedEdit; resolution?: EditResolution; acceptDependencies?: boolean; acceptedDependencyDays?: number[] }): Promise<PlanningResponsePlan> {
      const replanning = runAssistantV2({ skill: "itinerary-replanning", context });
      responseSkill = replanning.skill;
      try {
        const reference = qaSession.reference(await deps.candidates());
        const result = await executeAssistantV2Action({ skill: replanning.skill.id, context, action: "replan-preliminary-proposal", payload: { ...request, ...(reference ? { reference } : {}), current: generated, key: turnKey } }, services);
        if (result.outcome === "PUBLISHED") {
          workspace = result.workspace; generated = result.generated; needs = workspace.needs;
          pendingReplan = null; pendingClarificationNeeds = null; unresolved = [];
          return { ...planningResponsePlan(needs, "REPLAN_PROPOSAL", generated), replanDelta: result.delta, proposalChanged: true, refinementOutcome: "PUBLISHED" };
        }
        if (result.outcome === "NEEDS_CLARIFICATION") {
          pendingReplan = { text: request.text, edit: result.edit, clarification: result.clarification, dependencyDays: result.dependencyDays, version: workspace.version };
          return { ...planningResponsePlan(workspace.needs, "REPLAN_CLARIFY", generated ?? undefined), editClarification: result.clarification, replanCode: result.clarification.code, proposalChanged: false };
        }
        pendingReplan = null; refinementCandidate = result.candidate;
        return { ...planningResponsePlan(workspace.needs, "REPLAN_FAILED", result.candidate ?? generated ?? undefined), replanDelta: result.delta, replanCode: result.code, proposalChanged: false, refinementOutcome: "REJECTED" };
      } catch (error) {
        if (!(error instanceof AssistantV2Error) || error.code !== "ACTION_EXECUTION_FAILED") throw error;
        uncertain = causeCode(error.cause) === "OPERATION_STATUS_UNKNOWN";
        pendingReplan = null;
        return { ...planningResponsePlan(workspace.needs, "REPLAN_FAILED", generated ?? undefined), replanCode: causeCode(error.cause) ?? "REPLAN_FAILED", proposalChanged: false, refinementOutcome: uncertain ? "UNKNOWN" : "FAILED" };
      }
    }
    let continuation: Parameters<typeof replan>[0] | null = null;
    if (pendingReplan && generated) {
      if (pendingReplan.version !== workspace.version) throw new AppError("PLANNING_CHANGED", "Phương án chỉnh sửa đã cũ.", 409);
      const index = choiceIndex(text, pendingReplan.clarification.choices?.map((choice, i) => ({ id: String(i), name: choice.label })) ?? []);
      const choice = pendingReplan.clarification.choices?.[index];
      if (choice) continuation = { text: pendingReplan.text, edit: pendingReplan.edit, resolution: choice.resolution };
      else if (!qaInterrupted && pendingReplan.dependencyDays.length && planningReply(text) === "CONFIRM") continuation = { text: pendingReplan.text, edit: pendingReplan.edit, acceptDependencies: true, acceptedDependencyDays: pendingReplan.dependencyDays };
    }
    if (uncertain && (continuation || planningReply(text) !== null)) throw new AppError("OPERATION_STATUS_UNKNOWN", "Cần đối soát kết quả công bố trước khi tiếp tục.", 503);
    if (qaInterrupted && pendingReplan && planningReply(text) === "CONFIRM") {
      // A bare agreement after a factual answer is not scope acceptance. Re-show
      // the still-pending question before accepting a subsequent confirmation.
      plan = { ...planningResponsePlan(needs, "REPLAN_CLARIFY", generated ?? undefined), editClarification: pendingReplan.clarification, proposalChanged: false };
      qaInterrupted = false;
    } else if (generated && planningReply(text) === "CANCEL") {
      needs = workspace.needs;
      unresolved = [];
      pendingClarificationNeeds = null;
      pendingReplan = null;
      plan = planningResponsePlan(needs, "ACKNOWLEDGE_NO_CHANGE", generated);
      plan.proposalChanged = false;
    } else if (continuation) {
      plan = await replan(continuation);
    } else {
      const clarification = previousPlan?.goal === "CLARIFY" ? previousPlan.clarificationField : undefined;
      const preferenceField = clarification && ["interests", "pace", "companions", "mobility"].includes(clarification)
        ? clarification as "interests" | "pace" | "companions" | "mobility" : undefined;
      const analysis = await executeAssistantV2Action({
        skill: active.skill.id, context, action: "understand-planning-brief",
        payload: { text, unresolved, readOnly: uncertain, interleaving: { subjectName: qaSession.reference(await deps.candidates())?.name ?? null }, ...(generated ? { mode: "PREFERENCE_REFINEMENT" } : {}), dialogue: { question: previousMessage, field: preferenceField ? "preferences" : previousPlan?.goal === "ASK_DURATION" || clarification === "durationDays" ? "durationDays" : previousPlan?.goal === "ASK_TRANSPORT" || clarification === "transport" ? "transport" : clarification === "startDate" ? "startDate" : null, ...(preferenceField ? { preferenceField } : {}), recent: recent.slice(-RECENT_LIMIT), current: generated?.selection ?? null } },
      }, services);
      if (analysis.intent === "QA" || analysis.interleaved?.question && analysis.intent !== "ADVISE" || analysis.interleaved?.unsupported || analysis.interleaved?.compound) {
        const result = await qaSession.answer(text, turnKey, context, await deps.candidates(), analysis.interleaved);
        const qaPlan: PlanningResponsePlan = { ...planningResponsePlan(needs, result.goal, generated ?? undefined), ...(result.qa ? { qa: result.qa } : {}), compound: result.compound, proposalChanged: false };
        // Do not replace the pending planning question or its clarification state
        // with a QA answer. Only user questions enter bounded intent context.
        qaInterrupted = true;
        remember(text, "");
        const message = await safePlanningV2Reply(qaPlan, runAssistantV2({ skill: "ha-giang-qa", context }).skill, boundaries.compose ?? composePlanningV2Reply);
        return turnResult(qaPlan, message);
      }
      if (analysis.intent === "ADVISE") {
        // Read-only: no needs, version, proposal, pending clarification or UNKNOWN state changes.
        const guidancePlan: PlanningResponsePlan = { ...planningResponsePlan(needs, "PLANNING_GUIDANCE", generated ?? undefined), ...(generated ? { guidance: analyzeCurrentProposal(generated.proposal, needs.tripStructure) } : {}), userQuestion: text.slice(0, GUIDANCE_QUESTION_LIMIT), ...(uncertain ? { lastKnownOnly: true } : {}), proposalChanged: false };
        qaInterrupted = true;
        remember(text, "");
        const message = await safePlanningV2Reply(guidancePlan, active.skill, boundaries.compose ?? composePlanningV2Reply);
        // Read-only: report the stored workspace exactly, not a needs-overlaid copy.
        return { ...turnResult(guidancePlan, message), workspace: structuredClone(workspace) };
      }
      if (uncertain) throw new AppError("OPERATION_STATUS_UNKNOWN", "Cần đối soát kết quả công bố trước khi tiếp tục.", 503);
      if (analysis.interleaved?.usesReferent && !qaSession.reference(await deps.candidates())) {
        plan = { ...planningResponsePlan(needs, "QA_CLARIFY", generated ?? undefined), proposalChanged: false };
      } else if (generated && (analysis.intent === "EDIT" || analysis.operation)) {
        pendingReplan = null;
        plan = await replan({ text });
      } else if (analysis.intent === "EDIT" || analysis.operation) {
        plan = planningResponsePlan(needs, "HAND_OFF");
      } else {
        pendingReplan = null;
        unresolved = analysis.unresolved;
        const changed = assessPlanningRefinement(needs, analysis.needs).changedFields;
        // Partial companion metadata is useful context, not a mandatory count/
        // category questionnaire. Schema-valid partial facts need no follow-up.
        const partialCompanions = generated && changed.length > 0 && changed.every(field => field === "companionDraft" || field === "companions") && !analysis.needs.requirement.companions;
        if (analysis.intent === "CLARIFY" && !partialCompanions || unresolved.length || analysis.dateConfirmation) {
          // A clarification result can contain a tentative extraction (e.g.
          // one end of "2 or 3 days"). It is not a confirmed replacement.
          // Keep prior needs until the existing understanding boundary resolves it.
          if (unresolved.length && analysis.intent !== "CLARIFY") pendingClarificationNeeds = analysis.needs;
          plan = planningResponsePlan(needs, "CLARIFY", generated ?? undefined);
          if (analysis.tripShapeConflict) plan.tripShapeConflict = analysis.tripShapeConflict;
          if (analysis.tripStructureClarify) plan.clarificationMessage = analysis.message;
          plan.clarificationField = analysis.tripShapeConflict || analysis.tripStructureClarify ? "tripStructure" : unresolved.length ? "destinations" : analysis.dateConfirmation ? "startDate" : assessPlanningReadiness(needs).blockers[0]?.field
            ?? (changed.includes("mobilityConstraints") ? "mobility" : changed.includes("interests") ? "interests" : changed.includes("pace") ? "pace" : changed.includes("companions") || changed.includes("companionDraft") ? "companions" : "refinement");
          if (unresolved[0]) plan.optionalQuestion = { field: "destinations", choices: unresolved[0].choices };
        } else {
          needs = analysis.needs;
          pendingClarificationNeeds = null;
          if (!assessPlanningReadiness(needs).canDraft) {
            plan = planningResponsePlan(needs);
          } else if (generated) {
            const assessed = assessPlanningRefinement(workspace.needs, needs);
            // An explicit "build it again" is a rebuild request from the known brief, not a new fact.
            const refinement = analysis.intent === "REGENERATE" && !assessed.requiresRegeneration ? { ...assessed, requiresRegeneration: true, planningImplications: [...assessed.planningImplications, "REBUILD_REQUESTED" as const] } : assessed;
            plan = planningResponsePlan(needs, refinement.requiresRegeneration ? "REFINE_PROPOSAL" : "ACKNOWLEDGE_NO_CHANGE", generated);
            plan.refinement = refinement;
            plan.planningImplications.push(...refinement.planningImplications);
            plan.proposalChanged = false;
            /** A night area that could not be built is not adopted: keep the committed value so later rebuilds are not poisoned by it. */
            const dropUnbuiltOvernight = () => {
              if (!refinement.changedFields.includes("tripStructure")) return;
              const { tripStructure: _unbuilt, ...rest } = needs;
              needs = workspace.needs.tripStructure ? { ...rest, tripStructure: workspace.needs.tripStructure } : rest;
              plan.overnightPreferenceDropped = true;
            };
            if (refinement.requiresRegeneration) {
              try {
                const result = await executeAssistantV2Action({
                  skill: active.skill.id, context, action: "refine-preliminary-proposal", payload: { needs, current: generated, key: turnKey },
                }, services);
                plan.refinementOutcome = result.outcome;
                if (result.outcome === "PUBLISHED") {
                  workspace = result.workspace;
                  generated = result.generated;
                  needs = workspace.needs;
                  plan = { ...plan, ...planningResponsePlan(needs, "REFINE_PROPOSAL", generated), planningImplications: plan.planningImplications, proposalChanged: true };
                } else {
                  refinementCandidate = result.candidate;
                  plan = { ...plan, ...planningResponsePlan(needs, "REFINEMENT_FAILED", result.candidate), planningImplications: plan.planningImplications };
                  dropUnbuiltOvernight();
                }
              } catch (error) {
                if (!(error instanceof AssistantV2Error) || error.code !== "ACTION_EXECUTION_FAILED") throw error;
                // Preserve the last confirmed proposal; expose failure rather than
                // claiming a successful refinement or re-running the business step.
                uncertain = causeCode(error.cause) === "OPERATION_STATUS_UNKNOWN";
                plan.goal = "REFINEMENT_FAILED";
                plan.refinementOutcome = uncertain ? "UNKNOWN" : "FAILED";
                if (causeCode(error.cause)) plan.failureCode = causeCode(error.cause)!;
                if (!uncertain) dropUnbuiltOvernight();
              }
            }
          } else {
            try {
              const result = await executeAssistantV2Action({
                skill: active.skill.id, context, action: "generate-preliminary-proposal", payload: { needs, key: turnKey },
              }, services);
              workspace = result.workspace;
              needs = workspace.needs;
              generated = result.generated;
              plan = planningResponsePlan(needs, "PRESENT_PROPOSAL", generated);
            } catch (error) {
              if (!(error instanceof AssistantV2Error) || error.code !== "ACTION_EXECUTION_FAILED") throw error;
              if (error.cause instanceof AppError && [401, 403, 404, 409].includes(error.cause.status)) throw error;
              uncertain = causeCode(error.cause) === null || causeCode(error.cause) === "OPERATION_STATUS_UNKNOWN";
              // REVIEW may have committed before generation failed. Read the
              // authoritative version; never regenerate automatically, rewind
              // the workspace or claim a missing candidate was published.
              try { workspace = await deps.repository.read(workspace.conversationId); }
              catch { uncertain = true; }
              plan = { ...planningResponsePlan(needs, "PROPOSAL_FAILED"), ...(causeCode(error.cause) ? { failureCode: causeCode(error.cause)! } : {}), refinementOutcome: uncertain ? "UNKNOWN" : "FAILED", proposalChanged: false };
            }
          }
        }
      }
    }
    const message = await safePlanningV2Reply(plan, responseSkill, boundaries.compose ?? composePlanningV2Reply);
    previousPlan = plan;
    previousMessage = message;
    qaInterrupted = false;
    if (plan.goal !== "QA_CLARIFY") qaSession.clearReference();
    remember(text, message);
    return turnResult(plan, message, refinementCandidate);
  }

  return {
    exportState(): PlanningSessionState {
      return planningSessionStateSchema.parse({ workspace, needs, unresolved, recent,
        previousPlan: previousPlan && ["ASK_DURATION", "ASK_TRANSPORT", "CLARIFY"].includes(previousPlan.goal) ? { goal: previousPlan.goal, ...(previousPlan.clarificationField ? { clarificationField: previousPlan.clarificationField } : {}) } : null,
        previousMessage, generated, pendingClarificationNeeds, uncertain, qaInterrupted, pendingReplan, qa: qaSession.exportState() });
    },
    async snapshot() {
      await requireTraveler(input.headers, boundaries.authorization);
      await deps.repository.read(workspace.conversationId);
      return { workspace: structuredClone(workspace), generated: generated ? structuredClone(generated) : null, uncertain };
    },
    /** Same-key calls share the active interaction's promise; this is not a
     * durable HTTP replay contract. Rejected turns are surfaced, never auto-retried. */
    async send(text: string, turnKey: string): Promise<PlanningV2Turn> {
      const parsed = turnInputSchema.safeParse({ text, key: turnKey });
      if (!parsed.success) throw new AppError("INVALID_INPUT", "Nội dung hoặc mã lượt lập hành trình chưa hợp lệ.", 400);
      const replay = frozen?.key === parsed.data.key ? frozen : last?.key === parsed.data.key ? last : null;
      if (replay) {
        if (replay.text !== parsed.data.text) throw new AppError("IDEMPOTENCY_CONFLICT", "Mã lượt đã dùng cho nội dung khác.", 409);
        const currentActor = await requireTraveler(input.headers, boundaries.authorization);
        if (currentActor.userId !== actor.userId) throw new AppError("FORBIDDEN", "Phiên đăng nhập đã thay đổi.", 403);
        const current = busy || uncertain ? await deps.repository.read(workspace.conversationId)
          : await deps.repository.assertVersion(workspace.conversationId, workspace.version);
        if (current.savedTripId || current.pendingSaveKey) throw new AppError("PLANNING_CHANGED", "Trạng thái hành trình đã thay đổi.", 409);
        return replay.result.then(result => structuredClone(result));
      }
      if (busy) throw new AppError("PLANNING_BUSY", "Lượt lập hành trình hiện tại chưa hoàn tất.", 409);
      busy = true;
      const result = turn(parsed.data.text, parsed.data.key).finally(() => { busy = false; });
      last = { ...parsed.data, result };
      const record = last;
      return result.then(value => { if (value.uncertain && value.responsePlan.refinementOutcome === "UNKNOWN") frozen = record; return structuredClone(value); });
    },
  };
}
