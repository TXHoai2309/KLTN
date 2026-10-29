import "server-only";
import { z } from "zod";
import type { QaCompletedTurn } from "../ai/qa-contract";
import type { QaContext } from "../ai/qa-contract";
import { matchKnownDestinations } from "../ai/qa-question-understanding";
import { planningInterleavedSchema, resolvePlanningDestinationName } from "../assistant-planning/planning-ai";
import type { PlannerCandidate } from "../trip-planner/planner-candidates";
import type { AssistantAgentContext } from "./agent-context";
import { executeAssistantV2Action } from "./agent-runtime";
import { existingQaServices, type QaActionServices } from "./qa-actions";
import { AssistantV2Error } from "./agent-errors";

export type QaRouting = z.infer<typeof planningInterleavedSchema>;
export const planningQaStateSchema = z.object({
  head: z.object({ conversationId: z.string().min(1).max(128), parentTurnId: z.string().min(1).max(128) }).strict().nullable(),
  subject: z.object({ id: z.string().min(1).max(128), name: z.string().min(1).max(500) }).strict().nullable(),
}).strict();
/** Reuse the two existing name boundaries, including QA's existing aliases.
 * Entity metadata resolves intent only and can never become answer evidence. */
export function resolveQaPlanningSubject(name: string, candidates: readonly PlannerCandidate[]) {
  const visible = candidates.filter(c => c.visibility === "VISIBLE");
  const direct = resolvePlanningDestinationName(name, visible);
  if (direct.length) return direct;
  const known = matchKnownDestinations(name);
  const canonical = known.length === 1 ? resolvePlanningDestinationName(known[0]!, visible) : [];
  return known.length === 1 ? visible.filter(c => canonical.some(item => item.id === c.id) || matchKnownDestinations(c.name).includes(known[0]!)) : [];
}

/** Small adapter for the existing owned QA conversation/head contract. No new
 * memory store or factual cache: the QA service owns history and evidence. */
export function createPlanningQaSession(userId: string, headers: Headers, forActor?: () => QaActionServices | Promise<QaActionServices>, initialContext: QaContext = { type: "GENERAL" }, resume?: z.infer<typeof planningQaStateSchema>) {
  const restored = resume ? planningQaStateSchema.parse(resume) : null;
  let head = restored?.head ?? null;
  let subject = restored?.subject ?? null;
  return {
    exportState() { return planningQaStateSchema.parse({ head, subject }); },
    clearReference() { subject = null; },
    reference(candidates: readonly PlannerCandidate[]) {
      if (!subject) return null;
      const fresh = candidates.find(c => c.id === subject!.id && c.visibility === "VISIBLE" && c.name === subject!.name);
      if (!fresh) { subject = null; return null; }
      return { id: fresh.id, name: fresh.name };
    },
    async answer(text: string, key: string, context: AssistantAgentContext, candidates: readonly PlannerCandidate[], routing?: QaRouting): Promise<{ goal: "QA_ANSWER" | "QA_CLARIFY" | "QA_FAILED" | "QA_UNSUPPORTED"; qa?: QaCompletedTurn; compound: boolean }> {
      const compound = routing?.compound ?? false;
      if (routing?.unsupported) { subject = null; return { goal: "QA_UNSUPPORTED", compound }; }
      const question = routing?.question ?? text;
      const known = matchKnownDestinations(question);
      const matches = routing?.subjectName ? resolveQaPlanningSubject(routing.subjectName, candidates)
        : known.length === 1 ? resolveQaPlanningSubject(known[0]!, candidates) : [];
      const multiple = known.length > 1 || matches.length > 1;
      const reference = this.reference(candidates);
      if (routing?.usesReferent && (multiple || !reference)) { subject = null; return { goal: "QA_CLARIFY", compound }; }
      if (multiple || !routing?.usesReferent && matches.length !== 1) subject = null;
      const nextSubject = routing?.usesReferent ? reference : !multiple && matches.length === 1 ? { id: matches[0]!.id, name: matches[0]!.name } : null;
      // A failed/new-topic QA turn must not leave the previous place as the
      // apparently current referent for a later planning request.
      subject = null;
      try {
        const qa = forActor ? await forActor() : await existingQaServices(userId, headers);
        const result = await executeAssistantV2Action({ skill: "ha-giang-qa", context, action: "answer-ha-giang-question", payload: {
          key, request: { ...(head ?? { context: initialContext }), question, knowledgeMode: "SOURCE_ONLY" },
        } }, { qa });
        head = { conversationId: result.data.conversationId, parentTurnId: result.data.turnId };
        subject = result.data.status === "CLARIFICATION_REQUIRED" ? null : nextSubject;
        return { goal: "QA_ANSWER", qa: result.data, compound };
      } catch (error) {
        if (error instanceof AssistantV2Error && error.code !== "ACTION_EXECUTION_FAILED") throw error;
        // Technical errors stay separate from insufficient evidence. Do not
        // advance the QA head, clear planning state or automatically retry.
        return { goal: "QA_FAILED", compound };
      }
    },
  };
}
