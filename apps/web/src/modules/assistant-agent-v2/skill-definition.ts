import type { AssistantActionId } from "./assistant-actions";

export type AssistantSkill<Id extends string = string> = {
  readonly id: Id;
  readonly description: string;
  readonly instructions: string;
  readonly allowedActions: readonly AssistantActionId[];
};
