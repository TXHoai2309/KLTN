import { describe, expect, it } from "vitest";
import { AssistantController, type AssistantAttempt, type AssistantTransport, type AssistantTransportResult, type ConfirmedTurn } from "./assistant-controller";
import type { QaCompletedTurn } from "../../modules/ai/qa-contract";
import { QA_CONVERSATION_MESSAGES } from "../../modules/ai/qa-conversation";

function harness() {
  const calls: AssistantAttempt[] = [];
  const resolves: ((result: AssistantTransportResult) => void)[] = [];
  const transport: AssistantTransport = {
    send: async (attempt) => {
      calls.push(attempt);
      return new Promise((resolve) => resolves.push(resolve));
    },
  };
  let key = 0;
  const controller = new AssistantController(transport, "user_1", () => `key_${++key}`);
  return { controller, calls, resolves };
}

function makeTurn(conversationId: string, turnId: string, question: string): ConfirmedTurn {
  const response: QaCompletedTurn = {
    conversationId,
    turnId,
    turnState: "COMPLETED",
    status: "CONVERSATIONAL",
    context: { type: "GENERAL" },
    answerParts: [],
    citations: [],
    message: QA_CONVERSATION_MESSAGES.greeting,
  };
  return { question, response };
}

describe("AssistantController conversation history & hydration", () => {
  it("hydrates conversation turns, headTurnId and context atomically", () => {
    const h = harness();
    const turn1 = makeTurn("conv-100", "turn-1", "Hà Giang mùa nào đẹp nhất?");
    const turn2 = makeTurn("conv-100", "turn-2", "Tháng 10 có gì?");

    const ok = h.controller.loadConversation("conv-100", [turn1, turn2], "turn-2", { type: "GENERAL" });
    expect(ok).toBe(true);

    const snapshot = h.controller.getSnapshot();
    expect(snapshot.conversationId).toBe("conv-100");
    expect(snapshot.parentTurnId).toBe("turn-2");
    expect(snapshot.turns).toHaveLength(2);
    expect(snapshot.turns[0]?.question).toBe("Hà Giang mùa nào đẹp nhất?");
    expect(snapshot.turns[1]?.question).toBe("Tháng 10 có gì?");
    expect(snapshot.pending).toBeNull();
    expect(snapshot.draft).toBe("");
  });

  it("subsequent questions use loaded conversationId and parentTurnId", () => {
    const h = harness();
    const turn1 = makeTurn("conv-200", "turn-head", "Mã Pí Lèng ở đâu?");
    h.controller.loadConversation("conv-200", [turn1], "turn-head", { type: "GENERAL" });

    h.controller.setDraft("Đi bằng xe máy có an toàn không?");
    expect(h.controller.submit()).toBe(true);

    expect(h.calls).toHaveLength(1);
    const body = JSON.parse(h.calls[0]!.body);
    expect(body.conversationId).toBe("conv-200");
    expect(body.parentTurnId).toBe("turn-head");
    expect(body.question).toBe("Đi bằng xe máy có an toàn không?");
  });

  it("rejects loadConversation if unresolved attempt exists unless confirmedAbandon is true", () => {
    const h = harness();
    h.controller.setDraft("Dang gui cau hoi");
    h.controller.submit();

    const turn = makeTurn("conv-300", "turn-1", "Question");
    const blocked = h.controller.loadConversation("conv-300", [turn], "turn-1", { type: "GENERAL" });
    expect(blocked).toBe(false);
    expect(h.controller.getSnapshot().conversationId).toBeNull();

    const forced = h.controller.loadConversation("conv-300", [turn], "turn-1", { type: "GENERAL" }, true);
    expect(forced).toBe(true);
    expect(h.controller.getSnapshot().conversationId).toBe("conv-300");
  });

  it("prependTurns prepends older turns without duplicates", () => {
    const h = harness();
    const turn2 = makeTurn("conv-400", "turn-2", "Lượt 2");
    const turn3 = makeTurn("conv-400", "turn-3", "Lượt 3");
    h.controller.loadConversation("conv-400", [turn2, turn3], "turn-3", { type: "GENERAL" });

    const turn1 = makeTurn("conv-400", "turn-1", "Lượt 1");
    // Also include turn2 in the older list to test deduplication
    h.controller.prependTurns([turn1, turn2]);

    const snapshot = h.controller.getSnapshot();
    expect(snapshot.turns).toHaveLength(3);
    expect(snapshot.turns.map((t) => t.response.turnId)).toEqual(["turn-1", "turn-2", "turn-3"]);
  });
});
