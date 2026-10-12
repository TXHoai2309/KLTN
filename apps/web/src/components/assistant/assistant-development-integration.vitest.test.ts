import { describe, expect, it } from "vitest";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AssistantController } from "./assistant-controller";
import { DemoAssistantTransport, type DemoScenario } from "../../../development/assistant-demo-transport";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
describe("real /assistant development integration", () => {
  it("guards actual submit, keyboard and retry handlers during identity revalidation (offline hook harness)", async () => {
    const bundle = await build({ entryPoints: [fileURLToPath(new URL("./assistant-chat.tsx", import.meta.url))], bundle: true, write: false, format: "cjs", platform: "node", jsx: "automatic", external: ["react", "react/*"], logLevel: "silent" });
    const require = createRequire(import.meta.url);
    const slots: unknown[] = []; let cursor = 0;
    const hooks = { ...require("react"), useContext: () => null, useId: () => "fixture", useRef: () => ({ current: null }), useEffect: () => {},
      useState: (init: unknown) => { const index = cursor++; if (!(index in slots)) slots[index] = typeof init === "function" ? init() : init; return [slots[index], () => {}]; },
      useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot() };
    type Element = { type: unknown; props: Record<string, any> };
    const jsx = (type: unknown, props: Record<string, any>): Element => ({ type, props });
    const module = { exports: {} as { AssistantChat: (props: Record<string, unknown>) => Element } };
    new Function("require", "module", "exports", bundle.outputFiles[0]!.text)((id: string) => id === "react" ? hooks : id === "react/jsx-runtime" ? { jsx, jsxs: jsx } : require(id), module, module.exports);
    let sends = 0;
    const transport = { send: async () => { sends++; return { kind: "networkAmbiguity" as const }; } };
    const render = (available: boolean) => { cursor = 0; return module.exports.AssistantChat({ transport, identity: "GUEST:fixture", available }); };
    const elements = (value: unknown): Element[] => Array.isArray(value) ? value.flatMap(elements) : value && typeof value === "object" && "props" in value ? [value as Element, ...elements((value as Element).props.children)] : [];
    let tree = elements(render(false));
    const controller = slots[0] as AssistantController;
    controller.setDraft("fixture question");
    tree.find(e => e.type === "form")!.props.onSubmit({ preventDefault() {} });
    tree.find(e => e.type === "textarea")!.props.onKeyDown({ key: "Enter", shiftKey: false, nativeEvent: { isComposing: false, keyCode: 13 }, preventDefault() {} });
    expect(sends).toBe(0);
    tree = elements(render(true));
    tree.find(e => e.type === "form")!.props.onSubmit({ preventDefault() {} });
    await tick(); expect(sends).toBe(1);
    const pending = controller.getSnapshot().pending;
    expect(pending?.phase).toBe("unknown");
    tree = elements(render(false));
    const retry = tree.find(e => e.type === "button" && e.props.children === "Thử xác nhận lại")!;
    expect(retry.props.disabled).toBe(true); retry.props.onClick();
    expect(sends).toBe(1); expect(controller.getSnapshot().pending).toBe(pending);
  });
  it("disables the composer without removing its transport during session verification", async () => {
    const bundle = await build({ entryPoints: [fileURLToPath(new URL("./assistant-chat.tsx", import.meta.url))], bundle: true, write: false, format: "cjs", platform: "node", jsx: "automatic", external: ["react", "react/*"], logLevel: "silent" });
    const module = { exports: {} as { AssistantChat: (props: Record<string, unknown>) => ReactElement } };
    new Function("require", "module", "exports", bundle.outputFiles[0]!.text)(createRequire(import.meta.url), module, module.exports);
    const transport = { send: () => { throw Error("No request permitted in render test"); } };
    const waiting = renderToStaticMarkup(createElement(module.exports.AssistantChat, { transport, identity: "GUEST:fixture", available: false }));
    expect(waiting.match(/<textarea\b[^>]*>/)![0]).toContain("disabled");
    expect(waiting).toContain("Đang xác minh phiên");
    expect(waiting).not.toContain("Trợ lý AI chưa khả dụng");
    expect(waiting).not.toContain("Dữ liệu mô phỏng");
    const ready = renderToStaticMarkup(createElement(module.exports.AssistantChat, { transport, identity: "GUEST:fixture", available: true }));
    expect(ready.match(/<textarea\b[^>]*>/)![0]).not.toContain("disabled");
  });
  it.each(["development", "production"] as const)("selects the correct %s page and dependency graph", async (mode) => {
    const bundle = await build({
      entryPoints: [fileURLToPath(new URL("../../app/assistant/page.tsx", import.meta.url))],
      bundle: true, write: false, format: "cjs", platform: "node", jsx: "automatic", metafile: true,
      external: ["react", "react/*", "next", "./assistant-context-page"], loader: { ".css": "empty" },
      define: { "process.env.NODE_ENV": JSON.stringify(mode) }, logLevel: "silent",
    });
    const module = { exports: {} as { default: (props: object) => Promise<ReactElement> } };
    // Execute the in-memory server page with the same React instance as the renderer.
    new Function("require", "module", "exports", bundle.outputFiles[0]!.text)(createRequire(import.meta.url), module, module.exports);
    const html = renderToStaticMarkup(await module.exports.default({}));
    const textarea = html.match(/<textarea\b[^>]*>/)![0];
    const inputs = Object.keys(bundle.metafile!.inputs);
    if (mode === "development") {
      expect(textarea).not.toContain("disabled");
      expect(html).toContain("DEMO / DỮ LIỆU MÔ PHỎNG");
      expect(html).toContain("Dữ liệu mô phỏng");
      expect(html).not.toContain("Trợ lý AI chưa khả dụng");
      expect(inputs.some((path) => path.includes("assistant-demo-transport"))).toBe(true);
    } else {
      expect(textarea).toContain("disabled");
      expect(html).toContain("Trợ lý AI chưa khả dụng");
      expect(html).not.toContain("DỮ LIỆU MÔ PHỎNG");
      expect(inputs.some((path) => path.includes("development/"))).toBe(false);
      expect(bundle.outputFiles[0]!.text).not.toContain("source_fixture_only");
    }
  }, 15000);
  it.each(["ANSWERED", "PARTIAL", "INSUFFICIENT_SOURCE", "CLARIFICATION_REQUIRED"] as const)("uses shared controller and existing fixture for %s", async (scenario) => {
    const transport = new DemoAssistantTransport(); transport.delayMs = 0; transport.citationScenario = "MULTI"; transport.scenario = scenario;
    let sequence = 0;
    const controller = new AssistantController(transport, "dev-fixture", () => `key_${++sequence}`);
    controller.setDraft("Câu hỏi kiểm thử"); expect(controller.submit()).toBe(true);
    expect(controller.getSnapshot().pending?.phase).toBe("sending"); await tick();
    const first = controller.getSnapshot().turns[0]!.response;
    expect(first.status).toBe(scenario);
    expect(first.citations.length).toBe(["ANSWERED", "PARTIAL"].includes(scenario) ? 3 : 0);
    controller.setDraft("Hỏi tiếp"); expect(controller.submit()).toBe(true); await tick();
    expect(controller.getSnapshot().turns).toHaveLength(2);
    expect(controller.getSnapshot().turns[1]!.response.conversationId).toBe(first.conversationId);
    expect(controller.newConversation()).toBe(true);
    expect(controller.getSnapshot().turns).toHaveLength(0);
    expect(controller.getSnapshot().conversationId).toBeNull();
  });
  it.each(["FAILED", "UNKNOWN", "NETWORK", "MALFORMED"] as DemoScenario[])("preserves recovery behavior for %s", async (scenario) => {
    const transport = new DemoAssistantTransport(); transport.delayMs = 0; transport.scenario = scenario;
    const controller = new AssistantController(transport, "dev-fixture", () => "key_fixture");
    controller.setDraft("Kiểm thử phục hồi"); controller.submit(); await tick();
    expect(controller.getSnapshot().turns).toHaveLength(0);
    const attempt = controller.getSnapshot().pending!.attempt;
    if (scenario === "FAILED") {
      controller.editFailed(); expect(controller.getSnapshot().draft).toBe("Kiểm thử phục hồi");
    } else {
      controller.setDraft("Draft khác"); transport.scenario = "ANSWERED";
      expect(controller.retry()).toBe(true); expect(controller.getSnapshot().pending!.attempt).toBe(attempt);
      await tick(); expect(controller.getSnapshot().turns).toHaveLength(1);
    }
  });
});
