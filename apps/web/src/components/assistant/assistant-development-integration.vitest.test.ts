import { describe, expect, it, vi } from "vitest";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AssistantController } from "./assistant-controller";
import { DemoAssistantTransport, type DemoScenario } from "../../../development/assistant-demo-transport";
import { fixtureNeeds } from "../../test/planning-fixtures";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
describe("real /assistant development integration", () => {
  it.each(["page", "panel"])("adds planning suggestions to the %s composer and sends only after explicit submit", async mode => {
    const bundle = await build({ entryPoints: [fileURLToPath(new URL("./assistant-chat.tsx", import.meta.url))], bundle: true, write: false, format: "cjs", platform: "node", jsx: "automatic", external: ["react", "react/*"], logLevel: "silent" });
    const require = createRequire(import.meta.url);
    const slots: unknown[] = []; let cursor = 0;
    const refs: { current: unknown }[] = []; let refCursor = 0;
    const effects: { run: () => void; deps?: unknown[] }[] = [];
    const hooks = { ...require("react"), useContext: () => null, useMemo: (factory: () => unknown) => factory(), useId: () => `planning-suggestions-${mode}`,
      useRef: (initial: unknown) => { const index = refCursor++; return refs[index] ??= { current: initial }; },
      useEffect: (run: () => void, deps?: unknown[]) => { effects.push({ run, deps }); }, useCallback: (callback: unknown) => callback,
      useState: (init: unknown) => { const index = cursor++; if (!(index in slots)) slots[index] = typeof init === "function" ? init() : init; return [slots[index], () => {}]; }, useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot() };
    type Element = { type: any; props: Record<string, any> };
    const jsx = (type: unknown, props: Record<string, any>): Element => ({ type, props });
    const module = { exports: {} as { AssistantChat: (props: Record<string, unknown>) => Element } };
    new Function("require", "module", "exports", bundle.outputFiles[0]!.text)((id: string) => id === "react" ? hooks : id === "react/jsx-runtime" ? { jsx, jsxs: jsx } : require(id), module, module.exports);
    const workspace = { conversationId: `chat-suggestions-${mode}`, version: 0, needs: fixtureNeeds, pendingSaveKey: null, savedTripId: null, context: { type: "GENERAL" } };
    let release!: (value: Response) => void;
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: workspace })))
      .mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    vi.stubGlobal("fetch", fetcher);
    const elements = (value: unknown): Element[] => Array.isArray(value) ? value.flatMap(elements) : value && typeof value === "object" && "props" in value ? [value as Element, ...elements((value as Element).props.children)] : [];
    const render = (available = true) => { cursor = 0; refCursor = 0; effects.length = 0; return elements(module.exports.AssistantChat({ identity: `USER:planning-suggestions-${mode}`, mode, available, transport: { send: () => { throw Error("No Q&A expected"); } } })); };
    const panel = (available = true) => render(available).find(e => e.props.client && e.props.onStarted)!;
    const buttons = (available = true) => { const element = panel(available); return elements(element.type(element.props)); };
    try {
      render(); const controller = slots[0] as AssistantController;
      await panel().props.client.start(null);
      const suggestions = buttons();
      const nature = suggestions.find(e => e.type === "button" && e.props.children === "Thiên nhiên")!;
      const culture = suggestions.find(e => e.type === "button" && e.props.children === "Văn hóa")!;
      nature.props.onClick(); culture.props.onClick(); nature.props.onClick();
      expect(controller.getSnapshot().draft).toBe("Mình thích trải nghiệm thiên nhiên, văn hóa");
      const textarea = render().find(e => e.type === "textarea")!;
      expect(textarea.props.value).toBe("Mình thích trải nghiệm thiên nhiên, văn hóa");
      const input = { value: textarea.props.value, style: { height: "24px", maxHeight: "84px" }, scrollHeight: 64, ownerDocument: { defaultView: { getComputedStyle: () => ({ lineHeight: "20px", paddingTop: "2px", paddingBottom: "2px" }) } }, focus: vi.fn(), setSelectionRange: vi.fn() };
      textarea.props.ref.current = input;
      effects.find(effect => effect.deps?.length === 1 && effect.deps[0] === input.value)!.run();
      expect(input.style.height).toBe("64px");
      expect(input.setSelectionRange).toHaveBeenLastCalledWith(input.value.length, input.value.length);
      expect(input.focus).toHaveBeenCalled();
      expect(buttons().find(e => e.type === "button" && e.props.children === "Văn hóa")!.props.disabled).toBe(false);
      expect(buttons().find(e => e.type === "button" && e.props.children === "Văn hóa")!.props["aria-label"]).toContain("đã thêm");
      input.scrollHeight = 140;
      controller.setDraft(`${controller.getSnapshot().draft}\nMình muốn chụp ảnh nữa.`);
      render(); effects.find(effect => effect.deps?.length === 1 && effect.deps[0] === controller.getSnapshot().draft)!.run();
      expect(input.style.height).toBe("84px");
      input.scrollHeight = 24;
      controller.setDraft("");
      render(); effects.find(effect => effect.deps?.length === 1 && effect.deps[0] === "")!.run();
      expect(input.style.height).toBe("24px");
      controller.setDraft("Mình cũng thích chụp ảnh.");
      nature.props.onClick(); culture.props.onClick(); nature.props.onClick();
      const combined = "Mình cũng thích chụp ảnh.\nMình thích trải nghiệm thiên nhiên, văn hóa";
      expect(controller.getSnapshot().draft).toBe(combined);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(panel().props.client.getSnapshot().messages).toHaveLength(0);
      expect(render().find(e => e.type === "textarea")!.props.value).toBe(combined);
      render().find(e => e.type === "textarea")!.props.onChange({ target: { value: `${combined}\nVà thử món địa phương.` } });
      const submitted = controller.getSnapshot().draft;
      render().find(e => e.type === "form")!.props.onSubmit({ preventDefault() {} });
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(JSON.parse(fetcher.mock.calls[1]![1].body)).toMatchObject({ action: "ANALYZE", text: submitted });
      expect(controller.getSnapshot().draft).toBe("");
      controller.setDraft("Bản nháp tiếp theo");
      culture.props.onClick();
      expect(controller.getSnapshot().draft).toBe("Bản nháp tiếp theo");
      release(new Response(JSON.stringify({ success: true, data: { intent: "NEEDS", needs: { ...fixtureNeeds, requirement: { ...fixtureNeeds.requirement, interests: ["NATURE", "CULTURE_HISTORY"] } }, unresolved: [], message: "" } })));
      await tick(); await tick();
      expect(controller.getSnapshot().draft).toBe("Bản nháp tiếp theo");
      expect(buttons().some(e => e.type === "button" && e.props.children === "Bỏ qua phần còn lại")).toBe(false);
      for (const label of ["Bỏ qua câu này"]) {
        controller.setDraft("");
        buttons().find(e => e.type === "button" && e.props.children === label)!.props.onClick();
        expect(controller.getSnapshot().draft).toBe(label);
        expect(fetcher).toHaveBeenCalledTimes(2);
      }
      const before = controller.getSnapshot().draft;
      const unavailable = buttons(false).find(e => e.type === "button" && e.props.children === "Đi thư thả")!;
      expect(unavailable.props.disabled).toBe(true);
      unavailable.props.onClick();
      expect(controller.getSnapshot().draft).toBe(before);
    } finally { vi.unstubAllGlobals(); }
  });
  it("keeps public QA usable after the Guest invitation and hands off the original request, not a newer draft", async () => {
    const directory = fileURLToPath(new URL(".", import.meta.url));
    const bundle = await build({ stdin: { contents: 'export { AssistantChat } from "./assistant-chat"; export { consumePlanningAuthDraft } from "./planning-auth-handoff";', resolveDir: directory }, bundle: true, write: false, format: "cjs", platform: "node", jsx: "automatic", external: ["react", "react/*"], logLevel: "silent" });
    const require = createRequire(import.meta.url);
    const slots: unknown[] = []; let cursor = 0;
    const hooks = { ...require("react"), useContext: () => null, useMemo: (factory: () => unknown) => factory(), useId: () => "guest-invitation", useRef: () => ({ current: null }), useEffect: () => {}, useCallback: (callback: unknown) => callback,
      useState: (init: unknown) => { const index = cursor++; if (!(index in slots)) slots[index] = typeof init === "function" ? init() : init; return [slots[index], () => {}]; }, useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot() };
    type Element = { type: any; props: Record<string, any> };
    const jsx = (type: unknown, props: Record<string, any>): Element => ({ type, props });
    const module = { exports: {} as { AssistantChat: (props: Record<string, unknown>) => Element; consumePlanningAuthDraft: (principal: string) => { text: string } | null } };
    new Function("require", "module", "exports", bundle.outputFiles[0]!.text)((id: string) => id === "react" ? hooks : id === "react/jsx-runtime" ? { jsx, jsxs: jsx } : require(id), module, module.exports);
    const transport = new DemoAssistantTransport(); transport.delayMs = 0;
    const qaSend = vi.spyOn(transport, "send");
    const elements = (value: unknown): Element[] => Array.isArray(value) ? value.flatMap(elements) : value && typeof value === "object" && "props" in value ? [value as Element, ...elements((value as Element).props.children)] : [];
    const render = () => { cursor = 0; return elements(module.exports.AssistantChat({ identity: "GUEST:guest-invitation", transport, available: true })); };
    render(); const controller = slots[0] as AssistantController;
    const original = "Tôi muốn lập hành trình Hà Giang 3 ngày";
    controller.setDraft(original);
    render().find(e => e.type === "form")!.props.onSubmit({ preventDefault() {} });
    await tick();
    expect(controller.getSnapshot().draft).toBe("");
    expect(qaSend).not.toHaveBeenCalled();
    controller.setDraft("Mã Pí Lèng có gì hay?");
    render().find(e => e.type === "form")!.props.onSubmit({ preventDefault() {} });
    await tick(); await tick();
    expect(controller.getSnapshot().turns).toHaveLength(1);
    expect(controller.getSnapshot().conversationId).not.toBeNull();
    controller.setDraft("Bản nháp khác chưa gửi");
    const panel = render().find(e => e.props.client && e.props.onStarted)!;
    expect(panel.props.client.getSnapshot().authIntent.text).toBe(original);
    const link = elements(panel.type(panel.props)).find(e => e.props.href === "/login?returnTo=%2Fassistant")!;
    expect(link.props.children).toBe("Đăng nhập để tiếp tục");
    link.props.onClick();
    expect(module.exports.consumePlanningAuthDraft("USER:fixture")?.text).toBe(original);
    expect(controller.getSnapshot().draft).toBe("Bản nháp khác chưa gửi");
    expect(panel.props.client.getSnapshot().workspace).toBeNull();
    expect(qaSend).toHaveBeenCalledTimes(1);
  });
  it("clears the actual composer immediately while planning START is pending", async () => {
    const source = fileURLToPath(new URL("./assistant-chat.tsx", import.meta.url));
    const bundle = await build({ entryPoints: [source], bundle: true, write: false, format: "cjs", platform: "node", jsx: "automatic", external: ["react", "react/*"], logLevel: "silent" });
    const require = createRequire(import.meta.url);
    const slots: unknown[] = []; let cursor = 0;
    const hooks = { ...require("react"), useContext: () => null, useMemo: (factory: () => unknown) => factory(), useId: () => "planning-submit", useRef: () => ({ current: null }), useEffect: () => {}, useCallback: (callback: unknown) => callback,
      useState: (init: unknown) => { const index = cursor++; if (!(index in slots)) slots[index] = typeof init === "function" ? init() : init; return [slots[index], () => {}]; },
      useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot() };
    type Element = { type: unknown; props: Record<string, any> };
    const jsx = (type: unknown, props: Record<string, any>): Element => ({ type, props });
    const module = { exports: {} as { AssistantChat: (props: Record<string, unknown>) => Element } };
    new Function("require", "module", "exports", bundle.outputFiles[0]!.text)((id: string) => id === "react" ? hooks : id === "react/jsx-runtime" ? { jsx, jsxs: jsx } : require(id), module, module.exports);
    let release!: (value: Response) => void;
    const fetcher = vi.fn().mockImplementationOnce(() => new Promise(resolve => { release = resolve; }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: { intent: "NEEDS", needs: { requirement: {}, requiredDestinationIds: [], preferredDestinationIds: [], destinationNames: {} }, unresolved: [], message: "" } })));
    vi.stubGlobal("fetch", fetcher);
    const elements = (value: unknown): Element[] => Array.isArray(value) ? value.flatMap(elements) : value && typeof value === "object" && "props" in value ? [value as Element, ...elements((value as Element).props.children)] : [];
    const render = () => { cursor = 0; return elements(module.exports.AssistantChat({ identity: "USER:planning-submit-fixture", transport: { send: () => { throw Error("No Q&A expected"); } }, available: true })); };
    try {
      render(); const controller = slots[0] as AssistantController;
      controller.setDraft("Tôi muốn tạo hành trình");
      render().find(e => e.type === "form")!.props.onSubmit({ preventDefault() {} });
      expect(controller.getSnapshot().draft).toBe("");
      expect(fetcher).toHaveBeenCalledTimes(1);
      const pending = render().find(e => e.props.message?.question === "Tôi muốn tạo hành trình");
      expect(pending?.props.message.reply).toBe("");
      controller.setDraft("Nội dung tiếp theo");
      release(new Response(JSON.stringify({ success: true, data: { conversationId: "chat-submit", version: 0, needs: { requirement: {}, requiredDestinationIds: [], preferredDestinationIds: [], destinationNames: {} }, pendingSaveKey: null, savedTripId: null } })));
      await tick(); await tick();
      expect(controller.getSnapshot().draft).toBe("Nội dung tiếp theo");
      expect(render().filter(e => e.props.message?.question === "Tôi muốn tạo hành trình")).toHaveLength(1);
    } finally { vi.unstubAllGlobals(); }
  });
  it("guards actual submit, keyboard and retry handlers during identity revalidation (offline hook harness)", async () => {
    const bundle = await build({ entryPoints: [fileURLToPath(new URL("./assistant-chat.tsx", import.meta.url))], bundle: true, write: false, format: "cjs", platform: "node", jsx: "automatic", external: ["react", "react/*"], logLevel: "silent" });
    const require = createRequire(import.meta.url);
    const slots: unknown[] = []; let cursor = 0;
    const hooks = { ...require("react"), useContext: () => null, useMemo: (factory: () => unknown) => factory(), useId: () => "fixture", useRef: () => ({ current: null }), useEffect: () => {},
      useCallback: (callback: unknown) => callback,
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
