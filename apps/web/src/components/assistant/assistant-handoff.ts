import type { QaContext, QaKnowledgeMode } from "../../modules/ai/qa-contract";
import { sameQaContext } from "../../modules/ai/qa-contract";

export type AssistantHandoff = {
  principal: string;
  context: QaContext;
  conversationId: string | null;
  draft: string;
  knowledgeMode: QaKnowledgeMode;
  createdAt: number;
};

let ephemeralHandoff: AssistantHandoff | null = null;

const HANDOFF_TTL_MS = 60_000;

export function setAssistantHandoff(handoff: Omit<AssistantHandoff, "createdAt">): void {
  ephemeralHandoff = {
    ...handoff,
    createdAt: Date.now(),
  };
}

export function peekAssistantHandoff(): Readonly<AssistantHandoff> | null {
  if (!ephemeralHandoff) return null;
  if (Date.now() - ephemeralHandoff.createdAt > HANDOFF_TTL_MS) {
    ephemeralHandoff = null;
    return null;
  }
  return ephemeralHandoff;
}

export function consumeAssistantHandoff(
  currentPrincipal: string,
  targetConversationId: string | null,
  targetContext: QaContext
): AssistantHandoff | null {
  const handoff = ephemeralHandoff;
  // Always consume once — ephemeral in-memory transfer
  ephemeralHandoff = null;

  if (!handoff) return null;
  if (Date.now() - handoff.createdAt > HANDOFF_TTL_MS) return null;

  // Principal must match exactly
  if (handoff.principal !== currentPrincipal) return null;

  // Context must match
  if (!sameQaContext(handoff.context, targetContext)) return null;

  // Target conversation must match (both null, or matching ID)
  if (handoff.conversationId !== targetConversationId) return null;

  return handoff;
}

export function clearAssistantHandoff(): void {
  ephemeralHandoff = null;
}
