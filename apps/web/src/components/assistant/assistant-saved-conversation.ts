import type { AssistantController } from "./assistant-controller";
import { fetchConversationDetail, type ConversationDetailResult } from "./assistant-conversation-client";

export function savedConversationIdFromSearch(search: string): string | null {
  return new URLSearchParams(search).get("conversationId") || null;
}

export type SavedConversationOutcome = "LOADED" | "NOT_FOUND" | "BLOCKED";

/** Loads a stored conversation into the controller so the user can read it and keep asking (Q&A). */
export async function openSavedConversation(
  controller: AssistantController,
  id: string,
  fetchDetail: (id: string) => Promise<ConversationDetailResult> = fetchConversationDetail,
): Promise<SavedConversationOutcome> {
  let detail: ConversationDetailResult;
  try { detail = await fetchDetail(id); } catch { return "NOT_FOUND"; }
  const { conversation, turns } = detail;
  return controller.loadConversation(conversation.id, turns, conversation.headTurnId, conversation.context, false, conversation.knowledgeMode) ? "LOADED" : "BLOCKED";
}
