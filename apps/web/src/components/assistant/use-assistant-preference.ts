"use client";

import { useEffect, useRef, useState } from "react";
import type { QaKnowledgeMode } from "../../modules/ai/qa-contract";
import type { AssistantController, AssistantState } from "./assistant-controller";
import { ConversationApiError, updateConversationPreference } from "./assistant-conversation-client";

type PreferenceWrite = { mode: QaKnowledgeMode; identity: string; generation: number; conversationId: string; phase: "saving" | "unknown" | "failed" };

/** An absolute preference assignment still needs acknowledgement before handoff. */
export function useAssistantPreference(controller: AssistantController, state: AssistantState) {
  const [write, setWrite] = useState<PreferenceWrite | null>(null);
  const active = useRef<{ abort: AbortController; write: PreferenceWrite } | null>(null);

  function abandon() {
    active.current?.abort.abort();
    active.current = null;
    setWrite(null);
  }

  useEffect(() => {
    if (write && (write.identity !== state.identity || write.generation !== state.generation || write.conversationId !== state.conversationId)) abandon();
  }, [state.identity, state.generation, state.conversationId, write]);
  useEffect(() => () => { active.current?.abort.abort(); active.current = null; }, []);

  async function save(mode: QaKnowledgeMode) {
    if (active.current) return;
    const snapshot = controller.getSnapshot();
    if (!snapshot.conversationId) { controller.setKnowledgeMode(mode); return; }
    const pending: PreferenceWrite = { mode, identity: snapshot.identity, generation: snapshot.generation, conversationId: snapshot.conversationId, phase: "saving" };
    const request = { abort: new AbortController(), write: pending };
    active.current = request;
    setWrite(pending);
    const timer = setTimeout(() => request.abort.abort(), 10_000);
    try {
      const result = await updateConversationPreference(pending.conversationId, mode, request.abort.signal);
      if (result.id !== pending.conversationId || result.knowledgeMode !== mode) throw new Error("Unacknowledged preference");
      const current = controller.getSnapshot();
      if (active.current !== request || current.identity !== pending.identity || current.generation !== pending.generation) return;
      controller.setKnowledgeMode(mode);
      setWrite(null);
    } catch (error) {
      const current = controller.getSnapshot();
      if (active.current !== request || current.identity !== pending.identity || current.generation !== pending.generation) return;
      const failed = error instanceof ConversationApiError && error.status >= 400 && error.status < 500 && error.code !== "OPERATION_STATUS_UNKNOWN";
      setWrite({ ...pending, phase: failed ? "failed" : "unknown" });
    } finally {
      clearTimeout(timer);
      if (active.current === request) active.current = null;
    }
  }

  return { write, unresolved: write?.phase === "saving" || write?.phase === "unknown", changeMode: save, retry: () => { if (write) void save(write.mode); }, abandon };
}
