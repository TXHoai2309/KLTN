import { expect, it } from "vitest";
import { AssistantController, type AssistantAttempt, type AssistantTransportResult } from "./assistant-controller";
import type { QaContext } from "../../modules/ai/qa-contract";

// Current Q&A panel owns this controller; the old assistant-chat.tsx was removed.
it("keeps destination on reset, drops the old head and fences late replies after remount", async () => {
  const a: QaContext = { type: "DESTINATION", destinationId: "fixture_a" };
  const b: QaContext = { type: "DESTINATION", destinationId: "fixture_b" };
  const calls: AssistantAttempt[] = [];
  const resolves: ((result: AssistantTransportResult) => void)[] = [];
  const transport = { send: async (attempt: AssistantAttempt) => {
    calls.push(attempt);
    return new Promise<AssistantTransportResult>(resolve => resolves.push(resolve));
  } };
  let key = 0;
  const controller = new AssistantController(transport, "USER:fixture", () => `key_${++key}`, a);
  const complete = (index: number, context: QaContext) => resolves[index]!({ kind: "response", httpStatus: 200,
    body: { success: true, operationStatus: "SUCCESS", data: { conversationId: `conversation_${index}`,
      turnId: `turn_${index}`, turnState: "COMPLETED", context, knowledgeMode: "SOURCE_ONLY",
      status: "INSUFFICIENT_SOURCE", answerParts: [], citations: [], message: "Chưa đủ dữ liệu được xác minh để trả lời câu hỏi này." } } });
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  controller.setDraft("Đây là đâu?"); controller.submit(); complete(0, a); await tick();
  expect(controller.getSnapshot().conversationId).toBe("conversation_0");
  expect(controller.newConversation()).toBe(true);
  controller.setDraft("Giới thiệu địa điểm này"); controller.submit();
  expect(calls[1]!.payload).toEqual({ question: "Giới thiệu địa điểm này", context: a });
  expect(controller.newConversation()).toBe(false);
  controller.dispose(); // Context-key remount fences the old UI, never deletes server history.
  const next = new AssistantController(transport, "USER:fixture", () => `key_${++key}`, b);
  next.setDraft("Ở đây có gì đẹp?"); next.submit();
  complete(1, a); await tick();
  expect(next.getSnapshot().context).toEqual(b);
  expect(next.getSnapshot().turns).toEqual([]);
  expect(calls[2]!.payload).toEqual({ question: "Ở đây có gì đẹp?", context: b });
  complete(2, b); await tick(); expect(next.getSnapshot().turns).toHaveLength(1);
  next.dispose();
});
