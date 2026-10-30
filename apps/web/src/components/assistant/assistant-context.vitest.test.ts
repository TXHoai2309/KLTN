import { describe, expect, it } from "vitest";
import { AssistantController, type AssistantAttempt, type AssistantTransportResult } from "./assistant-controller";
import { QA_INSUFFICIENT_SOURCE_MESSAGE, type QaContext } from "../../modules/ai/qa-contract";

const a: QaContext = { type: "DESTINATION", destinationId: "synthetic_a" };
const b: QaContext = { type: "DESTINATION", destinationId: "synthetic_b" };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function harness() {
  const calls: AssistantAttempt[] = [], resolves: ((result: AssistantTransportResult) => void)[] = [];
  const controller = new AssistantController({ send: async attempt => { calls.push(attempt); return new Promise(resolve => resolves.push(resolve)); } }, "GUEST:fixture", () => `key_${calls.length}`, a);
  const complete = (index: number, context = a) => resolves[index]!({ kind: "response", httpStatus: 200, body: { success: true, operationStatus: "SUCCESS", data: { conversationId: `conv_${index}`, turnId: `turn_${index}`, turnState: "COMPLETED", context, status: "INSUFFICIENT_SOURCE", answerParts: [], citations: [], message: QA_INSUFFICIENT_SOURCE_MESSAGE } } });
  return { controller, calls, resolves, complete };
}
describe("US22 explicit context and lifecycle isolation", () => {
  it("first turn sends the selected reference, follow-up inherits without client metadata", async () => {
    const h = harness(); h.controller.setDraft("Nó có gì?"); h.controller.submit();
    expect(h.calls[0]!.payload).toEqual({ question: "Nó có gì?", context: a });
    h.complete(0); await tick(); h.controller.setDraft("Còn gì nữa?"); h.controller.submit();
    expect(h.calls[1]!.payload).toEqual({ question: "Còn gì nữa?", conversationId: "conv_0", parentTurnId: "turn_0" });
  });
  it("switch and clear reset history/head and use new first-turn payloads", async () => {
    const h = harness(); h.controller.setDraft("Q"); h.controller.submit(); h.complete(0); await tick();
    expect(h.controller.changeContext(b)).toBe(true); expect(h.controller.getSnapshot().turns).toEqual([]);
    h.controller.setDraft("B"); h.controller.submit(); expect(h.calls[1]!.payload).toEqual({ question: "B", context: b });
    h.complete(1, b); await tick(); h.controller.changeContext({ type: "GENERAL" });
    h.controller.setDraft("G"); h.controller.submit(); expect(h.calls[2]!.payload).toEqual({ question: "G", context: { type: "GENERAL" } });
  });
  it("unrelated browsing/refetch does not mutate context or automatically submit", () => {
    const h = harness(); const initial = h.controller.getSnapshot();
    // There is no page-global destination listener/storage; unrelated URL changes
    // do not call changeContext. Same-principal refresh retains the exact state.
    h.controller.changeIdentity("GUEST:fixture");
    expect(h.controller.getSnapshot()).toBe(initial); expect(initial.context).toEqual(a); expect(h.calls).toEqual([]);
  });
  it("blocks change during sending/UNKNOWN and retries identical snapshot", async () => {
    const h = harness(); h.controller.setDraft("Q"); h.controller.submit(); expect(h.controller.changeContext(b)).toBe(false);
    h.resolves[0]!({ kind: "networkAmbiguity" }); await tick(); expect(h.controller.changeContext({ type: "GENERAL" })).toBe(false);
    h.controller.retry(); expect(h.calls[1]).toBe(h.calls[0]);
    h.controller.newConversation(true); h.controller.changeContext(b); h.complete(1); await tick();
    expect(h.controller.getSnapshot().context).toEqual(b); expect(h.controller.getSnapshot().turns).toEqual([]);
  });
  it("rejects a SUCCESS carrying another context", async () => {
    const h = harness(); h.controller.setDraft("Q"); h.controller.submit(); h.complete(0, b); await tick();
    expect(h.controller.getSnapshot().pending?.phase).toBe("malformed"); expect(h.controller.getSnapshot().turns).toEqual([]);
  });
  it("keeps context on same-context new chat and clears private turns on identity switch", async () => {
    const h = harness(); h.controller.setDraft("Q"); h.controller.submit(); h.complete(0); await tick();
    h.controller.newConversation(); expect(h.controller.getSnapshot().context).toEqual(a);
    h.controller.changeIdentity("USER:other"); expect(h.controller.getSnapshot().context).toEqual(a); expect(h.controller.getSnapshot().turns).toEqual([]);
  });
});
