import "server-only";
import { assistantMetric } from "../../server/assistant-turn-metrics";
import { createAssistantAgentContext, type AssistantAgentContext } from "./agent-context";
import { createAssistantActions, type AssistantActionId, type AssistantActionServices, type AssistantActionOutput } from "./assistant-actions";
import { AssistantV2Error } from "./agent-errors";
import { loadAssistantSkill, type AssistantSkillId } from "./skill-registry";
import type { AssistantSkill } from "./skill-definition";

export type AssistantV2Input = {
  readonly skill: string;
  readonly context: AssistantAgentContext;
};

/** Activation is a structured foundation decision, not a model planning decision. */
export type AssistantV2Decision = {
  readonly kind: "SKILL_READY";
  readonly skillId: AssistantSkillId;
  readonly allowedActions: readonly AssistantActionId[];
};

export type AssistantV2Activation = {
  readonly skill: AssistantSkill<AssistantSkillId>;
  readonly context: AssistantAgentContext;
  readonly decision: AssistantV2Decision;
};

/** Internal entrypoint only: no provider call, action execution or V1 fallback.
 * The caller must establish authorization before supplying private context. */
export function runAssistantV2(input: AssistantV2Input): AssistantV2Activation {
  const skill = loadAssistantSkill(input.skill);
  assistantMetric("skill", skill.id);
  const context = createAssistantAgentContext(input.context);
  return Object.freeze({
    skill,
    context,
    decision: Object.freeze({
      kind: "SKILL_READY",
      skillId: skill.id,
      allowedActions: skill.allowedActions,
    }),
  });
}

/** Explicit server action dispatch is separate from activation. A future model
 * decision must pass these allowlist/schema checks before application work. */
export function executeAssistantV2Action<Id extends AssistantActionId>(
  input: AssistantV2Input & { readonly action: Id; readonly payload: unknown }, services?: AssistantActionServices,
): Promise<AssistantActionOutput<Id>>;
export function executeAssistantV2Action(
  input: AssistantV2Input & { readonly action: string; readonly payload: unknown }, services?: AssistantActionServices,
): Promise<AssistantActionOutput<AssistantActionId>>;
export async function executeAssistantV2Action(
  input: AssistantV2Input & { readonly action: string; readonly payload: unknown },
  services: AssistantActionServices = {},
) {
  const active = runAssistantV2(input);
  const actions = createAssistantActions(services);
  if (!Object.hasOwn(actions, input.action)) throw new AssistantV2Error("UNKNOWN_ACTION");
  const id = input.action as AssistantActionId;
  if (!active.skill.allowedActions.includes(id)) throw new AssistantV2Error("ACTION_NOT_ALLOWED");
  assistantMetric("action", id);
  return actions[id].execute(input.payload, active.context);
}
