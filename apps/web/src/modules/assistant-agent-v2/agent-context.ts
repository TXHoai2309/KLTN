import "server-only";
import { z } from "zod";
import { planningWorkspaceSchema } from "../assistant-planning/planning-contract";
import { AssistantV2Error } from "./agent-errors";

export const assistantAgentContextSchema = z.object({
  userId: z.string().min(1).max(128).regex(/\S/),
  workspace: planningWorkspaceSchema.readonly().nullable(),
  savedTripId: z.string().min(1).max(128).optional(),
}).strict().readonly();

export type AssistantAgentContext = z.infer<typeof assistantAgentContextSchema>;

/** The server caller must authenticate and load an owned workspace first.
 * An ID/schema is not authorization. Parsing reuses the existing state contract
 * and detaches the transient context from the caller's mutable state. */
export function createAssistantAgentContext(value: unknown): AssistantAgentContext {
  const parsed = assistantAgentContextSchema.safeParse(value);
  if (!parsed.success) throw new AssistantV2Error("INVALID_CONTEXT");
  return parsed.data;
}
