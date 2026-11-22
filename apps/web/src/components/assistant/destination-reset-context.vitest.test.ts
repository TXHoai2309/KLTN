import { expect, it } from "vitest";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import type { AssistantController, AssistantAttempt, AssistantTransportResult } from "./assistant-controller";
import type { QaContext } from "../../modules/ai/qa-contract";

// Exercise the actual reset handlers and controller. Only React's mounting shell
// and the remote transport are replaced, following the existing integration tests.
it("resets to the current detail context, drops the old conversation and fences late replies", async () => {
  const bundle = await build({ entryPoints: [fileURLToPath(new URL("./assistant-chat.tsx", import.meta.url))], bundle: true, write: false, format: "cjs", platform: "node", jsx: "automatic", external: ["react", "react/*"], logLevel: "silent" });
  const require = createRequire(import.meta.url);
  const slots: unknown[] = []; let cursor = 0;
  const refs: { current: any }[] = []; let refCursor = 0;
  const hooks = { ...require("react"), useContext: () => null, useMemo: (factory: () => unknown) => factory(), useId: () => "destination-reset",
    useRef: (initial: unknown) => { const index = refCursor++; return refs[index] ??= { current: initial }; },
    useEffect: () => {}, useCallback: (callback: unknown) => callback,
    useState: (init: unknown) => { const index = cursor++; if (!(index in slots)) slots[index] = typeof init === "function" ? init() : init; return [slots[index], (value: unknown) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }]; },
    useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot() };
  type Element = { type: any; props: Record<string, any> };
  const jsx = (type: unknown, props: Record<string, any>): Element => ({ type, props });
  const module = { exports: {} as { AssistantChat: (props: Record<string, unknown>) => Element } };
  new Function("require", "module", "exports", bundle.outputFiles[0]!.text)((id: string) => id === "react" ? hooks : id === "react/jsx-runtime" ? { jsx, jsxs: jsx } : require(id), module, module.exports);
  const elements = (value: unknown): Element[] => Array.isArray(value) ? value.flatMap(elements) : value && typeof value === "object" && "props" in value ? [value as Element, ...elements((value as Element).props.children)] : [];
  const a: QaContext = { type: "DESTINATION", destinationId: "fixture_quan_ba" };
  const b: QaContext = { type: "DESTINATION", destinationId: "fixture_nho_que" };
  const general: QaContext = { type: "GENERAL" };
  const calls: AssistantAttempt[] = [], resolves: ((value: AssistantTransportResult) => void)[] = [];
  const transport = { send: async (attempt: AssistantAttempt) => { calls.push(attempt); return new Promise<AssistantTransportResult>(resolve => resolves.push(resolve)); } };
  const render = (context: QaContext) => { cursor = 0; refCursor = 0; return elements(module.exports.AssistantChat({ mode: "panel", transport, identity: "GUEST:context-fixture", available: true, initialContext: a, newChatContext: context })); };
  const reset = (context: QaContext) => render(context).find(e => e.type === "button" && e.props.title === "Chat mới")!.props.onClick();
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  const complete = (index: number, context: QaContext) => resolves[index]!({ kind: "response", httpStatus: 200, body: { success: true, operationStatus: "SUCCESS", data: { conversationId: `conversation_${index}`, turnId: `turn_${index}`, turnState: "COMPLETED", context, knowledgeMode: "SOURCE_ONLY", status: "INSUFFICIENT_SOURCE", answerParts: [], citations: [], message: "Chưa đủ dữ liệu được xác minh để trả lời câu hỏi này." } } });
  render(a);
  const controller = slots[0] as AssistantController;
  // A: a reset on the same page keeps its reference in the first request.
  reset(a); controller.setDraft("Đây là đâu?"); controller.submit();
  expect(calls[0]!.payload).toEqual({ question: "Đây là đâu?", context: a, knowledgeMode: "SOURCE_ONLY" });
  complete(0, a); await tick();
  expect(controller.getSnapshot().conversationId).toBe("conversation_0");
  // B/C: after navigating, reset uses the latest page reference, without the old head.
  reset(b); controller.setDraft("Địa điểm này ở đâu?"); controller.submit();
  expect(calls[1]!.payload).toEqual({ question: "Địa điểm này ở đâu?", context: b, knowledgeMode: "SOURCE_ONLY" });
  expect(controller.getSnapshot().turns).toEqual([]);
  // D: explicitly abandon an outstanding old request; a late reply cannot win.
  const dialog = render(a).find(e => e.type === "dialog")!;
  dialog.props.ref.current = { close() {}, showModal() {} };
  reset(a);
  render(a).find(e => e.type === "button" && e.props.children === "Bỏ theo dõi và tiếp tục")!.props.onClick();
  controller.setDraft("Chỗ này là đâu?"); controller.submit();
  expect(calls[2]!.payload).toMatchObject({ context: a });
  complete(1, b); await tick();
  expect(controller.getSnapshot().context).toEqual(a);
  expect(controller.getSnapshot().turns).toEqual([]);
  expect(controller.getSnapshot().pending?.attempt).toBe(calls[2]);
  complete(2, a); await tick();
  expect(controller.getSnapshot().turns).toHaveLength(1);
  // E: a new general chat remains general; no destination leaks into its payload.
  reset(general); controller.setDraft("Hà Giang có gì?"); controller.submit();
  expect(calls[3]!.payload).toEqual({ question: "Hà Giang có gì?", context: general, knowledgeMode: "SOURCE_ONLY" });
  complete(3, general); await tick();
  expect(controller.getSnapshot().context).toEqual(general);
  controller.dispose();
});
