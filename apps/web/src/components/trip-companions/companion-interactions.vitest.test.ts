import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

// Execute real component handlers, shared schemas and mutation transport. Only
// React's host/hook runtime, browser geometry and unrelated visual dependencies
// are replaced; static-markup assertions cannot exercise these recovery flows.
type Element = { type: any; props: Record<string, any>; key?: string };
type Slot = { value?: any; deps?: any[]; cleanup?: () => void };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const nodes = (tree: any): Element[] => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === "object" && "props" in tree ? [tree, ...nodes(tree.props.children)] : [];
const text = (tree: any): string => Array.isArray(tree) ? tree.map(text).join("")
  : tree && typeof tree === "object" && "props" in tree ? text(tree.props.children)
  : typeof tree === "string" || typeof tree === "number" ? String(tree) : "";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json" },
});
const ok = (data: unknown) => json({ success: true, data });
const success = (data: unknown) => json({ success: true, operationStatus: "SUCCESS", data });
const unknown = () => json({ success: false, operationStatus: "UNKNOWN", retryWithSameKey: true,
  error: { code: "OPERATION_STATUS_UNKNOWN", message: "Synthetic lost acknowledgement" } }, 503);
const failure = (code = "COMPANION_REVISION_CONFLICT", status = 409) => json({ success: false,
  operationStatus: "FAILED", error: { code, message: "Synthetic rejection" } }, status);
type Request = { url: string; method: string; body: any; key: string | null };
let bundleText: string;

async function setup(component: string, input: Record<string, any> = {}, handler?: (request: Request) => Response | Promise<Response | undefined> | undefined) {
  if (!bundleText) {
    const bundle = await build({
      stdin: { contents: `
        export { CompanionGroupView } from './companion-group-view';
        export { CompanionManagementView } from './companion-management-view';
        export { CompanionIntroductionView } from './companion-introduction-view';
        export { companionGroupFixture } from '../../modules/trip-companions/companion-group-fixtures';
        export { companionHistoryFixture, companionMessageFixture } from '../../modules/trip-companions/companion-chat-fixtures';
        export { companionManageFixture } from '../../modules/trip-companions/companion-management-fixtures';
        export { publicCompanionFixture } from '../../modules/trip-companions/companion-fixtures';
        export { companionMembersFixture } from '../../modules/trip-companions/companion-members-fixtures';
      `, resolveDir: fileURLToPath(new URL("./", import.meta.url)), loader: "tsx" },
      bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic", logLevel: "silent",
      external: ["react", "react/*", "next/*", "lucide-react", "sonner", "@KLTN/ui/*", "@/lib/auth-client", "@/components/trip-planner/itinerary-map"],
    });
    bundleText = bundle.outputFiles[0]!.text;
  }
  const require = createRequire(import.meta.url);
  const slots: Slot[] = [], requests: Request[] = [];
  const timers: { fn: () => unknown; ms: number; active: boolean }[] = [];
  const listeners = new Map<string, Set<() => void>>();
  const addEventListener = (name: string, fn: () => void) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name)!.add(fn); };
  const removeEventListener = (name: string, fn: () => void) => listeners.get(name)?.delete(fn);
  const session = { data: { user: { id: "synthetic-member" } } as any, isPending: false, error: null };
  const document = { visibilityState: "visible", addEventListener, removeEventListener };
  const push = vi.fn(), refresh = vi.fn(), replace = vi.fn();
  let cursor = 0, queued: (() => void)[] = [], dirty = false, tree: Element, childKey: string | undefined;
  const slot = () => slots[cursor++] ?? (slots[cursor - 1] = {});
  const equal = (a: any[] | undefined, b: any[] | undefined) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const memo = (fn: () => any, deps: any[]) => { const s = slot(); if (!equal(s.deps, deps)) { s.value = fn(); s.deps = deps; } return s.value; };
  const hooks = { ...require("react"),
    useState(initial: any) { const s = slot(); if (!("value" in s)) s.value = typeof initial === "function" ? initial() : initial;
      return [s.value, (next: any) => { const value = typeof next === "function" ? next(s.value) : next; if (!Object.is(value, s.value)) { s.value = value; dirty = true; } }]; },
    useRef(initial: any) { const s = slot(); return s.value ?? (s.value = { current: initial }); },
    useId() { const s = slot(); return s.value ?? (s.value = `flow-${cursor}`); },
    useMemo: memo,
    useCallback(fn: () => any, deps: any[]) { return memo(() => fn, deps); },
    useEffect(fn: () => void | (() => void), deps: any[]) { const s = slot(); if (!equal(s.deps, deps)) { s.deps = deps; queued.push(() => { s.cleanup?.(); s.cleanup = fn() || undefined; }); } },
  };
  const jsx = (type: any, props: Record<string, any>, key?: string) => ({ type, props, key });
  const module = { exports: {} as Record<string, any> };
  new Function("require", "module", "exports", bundleText)((id: string) => {
    if (id === "react") return hooks;
    if (id === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (id === "next/navigation") return { useRouter: () => ({ push, refresh, replace }) };
    if (id === "next/link") return { default: "Link", __esModule: true };
    if (id === "lucide-react") return new Proxy({ __esModule: true }, { get: (o: any, key) => key in o ? o[key] : String(key) });
    if (id === "sonner") return { toast: { success() {}, error() {} } };
    if (id === "@/lib/auth-client") return { authClient: { useSession: () => session } };
    if (id === "@/components/trip-planner/itinerary-map") return { ItineraryMap: "Map" };
    if (id.startsWith("@KLTN/ui/")) return { Card: "Card" };
    return require(id);
  }, module, module.exports);
  const fixture = module.exports;
  const defaultProps = component === "CompanionManagementView" ? { management: structuredClone(fixture.companionManageFixture) }
    : component === "CompanionIntroductionView" ? { ...structuredClone(fixture.publicCompanionFixture), isGuest: false }
    : { group: structuredClone(fixture.companionGroupFixture), initialTab: "chat", currentUserId: "synthetic-member", initialHistory: structuredClone(fixture.companionHistoryFixture) };
  let props = { ...defaultProps, ...input };
  const rects = new Map<string, { top: number; bottom: number }>();
  const container = { scrollHeight: 1000, scrollTop: 800, clientHeight: 200,
    getBoundingClientRect: () => ({ top: 0, bottom: 200 }),
    querySelectorAll: () => nodes(tree).filter(n => n.props["data-companion-sequence"]).map(n => ({
      dataset: { companionSequence: n.props["data-companion-sequence"] },
      getAttribute: () => n.props["data-companion-sequence"],
      getBoundingClientRect: () => rects.get(n.props["data-companion-sequence"]) ?? { top: 10, bottom: 50 },
    })),
    addEventListener, removeEventListener,
  };
  vi.stubGlobal("document", document);
  const browserWindow = { innerHeight: 200, addEventListener, removeEventListener };
  vi.stubGlobal("window", browserWindow);
  vi.stubGlobal("setInterval", (fn: () => unknown, ms: number) => { const timer = { fn, ms, active: true }; timers.push(timer); return timer; });
  vi.stubGlobal("clearInterval", (timer: typeof timers[number]) => { if (timer) timer.active = false; });
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const request = { url: String(url), method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : null, key: new Headers(init.headers).get("Idempotency-Key") };
    requests.push(request);
    const result = await handler?.(request); if (result) return result;
    if (request.url.endsWith("/read")) return success({ publicationId: props.group?.publicationId ?? "synthetic-publication", sequence: request.body.sequence });
    if (request.url.endsWith("/unread")) return ok({ items: [], nextCursor: null });
    if (request.url.includes("/messages/delta")) { const after = new URL(request.url, "http://test.invalid").searchParams.get("after"); return ok({ publicationId: props.group.publicationId, items: [], nextCursor: after, highWaterCursor: after, hasMore: false, canSend: true, relationship: "MEMBER" }); }
    if (request.url.endsWith("/members")) return ok(fixture.companionMembersFixture);
    if (request.url.endsWith("/group")) return ok(props.group);
    return ok(fixture.companionHistoryFixture);
  });
  const render = () => {
    cursor = 0; dirty = false; tree = fixture[component](props);
    while (typeof tree.type === "function") {
      if (tree.key !== childKey) { for (const s of slots.slice(cursor)) s.cleanup?.(); slots.length = cursor; childKey = tree.key; }
      tree = tree.type(tree.props);
    }
    for (const s of slots.splice(cursor)) s.cleanup?.();
    for (const n of nodes(tree)) if (n.props.ref && typeof n.props.ref === "object") n.props.ref.current = n.props["data-testid"] === "companion-chat-transcript" ? container : { scrollIntoView() {} };
    return nodes(tree);
  };
  const find = (id: string) => render().find(n => n.props["data-testid"] === id);
  const flush = async () => { for (let i = 0; i < 10; i++) { render(); const effects = queued; queued = []; for (const effect of effects) effect(); await tick(); if (!dirty && !queued.length) break; } render(); };
  const emit = async (event: string) => { for (const fn of listeners.get(event) ?? []) fn(); await flush(); };
  const poll = async () => { await timers.find(t => t.active && t.ms === 3000)?.fn(); await flush(); };
  const submit = async () => { render().find(n => n.type === "form")!.props.onSubmit({ preventDefault() {} }); await flush(); };
  return { fixture, props, render, find, flush, submit, emit, poll, document, browserWindow, session, rects, container, requests, timers, push, refresh, replace,
    writes: () => requests.filter(r => r.method === "PATCH" || r.url.endsWith("/messages")),
    rerender: (next: Record<string, any>) => { props = { ...props, ...next }; return render(); },
  };
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("Companion reviewed interaction regressions", () => {
  it("uses the server-rendered group on mount and revalidates on the next interval", async () => {
    const t = await setup("CompanionGroupView", { initialTab: "itinerary" });
    await t.flush();
    expect(t.requests.filter(r => r.url.endsWith("/group"))).toHaveLength(0);
    expect(t.requests.filter(r => r.url.endsWith("/unread"))).toHaveLength(1);
    await t.timers.find(timer => timer.active && timer.ms === 15000)!.fn();
    await t.flush();
    expect(t.requests.filter(r => r.url.endsWith("/group"))).toHaveLength(1);
  });

  it("coalesces unread revalidation while visibility and reconnect events overlap", async () => {
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const t = await setup("CompanionGroupView", { initialTab: "itinerary" }, r =>
      r.url.endsWith("/unread") ? pending.then(() => ok({ items: [], nextCursor: null })) : undefined);
    await t.flush();
    await t.emit("visibilitychange");
    await t.emit("online");
    expect(t.requests.filter(r => r.url.endsWith("/unread"))).toHaveLength(1);
    release();
    await t.flush();
  });

  it("freezes a management UNKNOWN attempt and retries the exact original body/key", async () => {
    const t = await setup("CompanionManagementView", {}, r => r.method === "PATCH" ? unknown() : undefined);
    const staleChange = t.find("manage-title-input")!.props.onChange;
    staleChange({ target: { value: "First attempted title" } }); await t.submit();
    expect(t.find("manage-title-input")!.props.disabled).toBe(true);
    staleChange({ target: { value: "Must not change the attempt" } });
    await t.submit();
    expect(t.writes()).toHaveLength(2);
    expect(t.writes()[1]).toEqual(t.writes()[0]);
  });

  it.each(["toggle-recruitment-btn", "toggle-visibility-btn"])("does not announce a confirmed change when %s fails", async button => {
    const t = await setup("CompanionManagementView", {}, r => r.method === "PATCH" ? failure() : undefined);
    const previous = text(t.find(button));
    await t.find(button)!.props.onClick(); await t.flush();
    expect(text(t.find(button))).toBe(previous);
  });

  it("keeps a pending management request exclusive and releases a known failure for a new edit", async () => {
    let resolve!: (r: Response) => void;
    const pending = new Promise<Response>(r => { resolve = r; });
    let attempt = 0;
    const t = await setup("CompanionManagementView", {}, r => r.method === "PATCH" ? (++attempt === 1 ? pending : failure()) : undefined);
    t.find("manage-title-input")!.props.onChange({ target: { value: "First title" } });
    const oldSubmit = t.render().find(n => n.type === "form")!.props.onSubmit;
    oldSubmit({ preventDefault() {} }); oldSubmit({ preventDefault() {} });
    expect(t.writes()).toHaveLength(1);
    resolve(failure()); await t.flush();
    t.find("manage-title-input")!.props.onChange({ target: { value: "Second title" } }); await t.submit();
    expect(t.writes()[1]!.key).not.toBe(t.writes()[0]!.key);
  });

  it("retries an uncertain close through Save without reversing the requested toggle", async () => {
    const t = await setup("CompanionManagementView", {}, r => r.method === "PATCH" ? unknown() : undefined);
    const previous = text(t.find("toggle-recruitment-btn"));
    await t.find("toggle-recruitment-btn")!.props.onClick(); await t.flush();
    expect(text(t.find("toggle-recruitment-btn"))).toBe(previous);
    expect(t.find("manage-save-btn")!.props.disabled).toBe(false);
    await t.submit();
    expect(t.writes()[0]!.body.recruitmentOpen).toBe(false);
    expect(t.writes()[1]).toEqual(t.writes()[0]);
  });

  it("keeps chat UNKNOWN text immutable for both reconciliation and resend", async () => {
    const t = await setup("CompanionGroupView", {}, r => r.method === "POST" && /\/messages(?:\/reconcile)?$/.test(r.url) ? unknown() : undefined);
    const staleChange = t.find("companion-chat-input")!.props.onChange;
    staleChange({ target: { value: "Original message" } }); await t.submit();
    expect(t.find("companion-chat-input")!.props.disabled).toBe(true);
    staleChange({ target: { value: "Changed while uncertain" } });
    await t.find("companion-chat-reconcile-btn")!.props.onClick(); await t.flush();
    await t.find("companion-chat-retry-btn")!.props.onClick(); await t.flush();
    const attempts = t.requests.filter(r => r.method === "POST" && /\/messages(?:\/reconcile)?$/.test(r.url));
    expect(attempts).toHaveLength(3);
    expect(attempts.map(r => r.body)).toEqual([{ text: "Original message" }, { text: "Original message" }, { text: "Original message" }]);
    expect(new Set(attempts.map(r => r.key)).size).toBe(1);
  });

  it("receives unseen earlier messages after an own-send acknowledgement and sorts the merged transcript", async () => {
    let fixture: any;
    let page = 0;
    const t = await setup("CompanionGroupView", {}, r => {
      if (r.method === "POST" && r.url.endsWith("/messages")) return success({ publicationId: "synthetic-publication", messageId: "m-3", sequence: "3" });
      if (r.url.includes("/messages/delta")) return ok({ publicationId: "synthetic-publication", items: ++page === 1 ? [
        { ...fixture.companionMessageFixture, id: "m-2", sequence: "2" },
      ] : [{ ...fixture.companionMessageFixture, id: "m-3", sequence: "3" }],
        nextCursor: page === 1 ? "2" : "3", highWaterCursor: "3", hasMore: page === 1, canSend: true, relationship: "MEMBER" });
    });
    fixture = t.fixture; await t.flush();
    t.find("companion-chat-input")!.props.onChange({ target: { value: "My third message" } }); await t.submit(); await t.poll();
    expect(t.requests.find(r => r.url.includes("/messages/delta"))!.url).toContain("after=1");
    await t.poll();
    expect(t.requests.filter(r => r.url.includes("/messages/delta"))[1]!.url).toContain("after=2");
    const ids = t.render().filter(n => String(n.props["data-testid"] ?? "").startsWith("companion-msg-")).map(n => n.props["data-testid"]);
    expect(ids).toEqual(["companion-msg-synthetic-message", "companion-msg-m-2", "companion-msg-m-3"]);
  });

  it("prevents stale Enter handlers or input callbacks from duplicating a pending send", async () => {
    let resolve!: (r: Response) => void;
    const pending = new Promise<Response>(r => { resolve = r; });
    const t = await setup("CompanionGroupView", {}, r => r.method === "POST" && r.url.endsWith("/messages") ? pending : undefined);
    const change = t.find("companion-chat-input")!.props.onChange;
    change({ target: { value: "One attempted message" } });
    const submit = t.render().find(n => n.type === "form")!.props.onSubmit;
    void submit({ preventDefault() {} }); void submit({ preventDefault() {} });
    change({ target: { value: "Stale edit while pending" } });
    expect(t.writes()).toHaveLength(1);
    resolve(success({ publicationId: "synthetic-publication", messageId: "sent", sequence: "2" })); await t.flush();
    expect(t.writes()[0]!.body).toEqual({ text: "One attempted message" });
    expect(t.find("companion-chat-input")!.props.value).toBe("");
  });

  it("clears private content and stops polling after a revoked delta response", async () => {
    const t = await setup("CompanionGroupView", {}, r => r.url.includes("/messages/delta") ? failure("COMPANION_GROUP_FORBIDDEN", 403) : undefined);
    await t.flush(); await t.poll();
    expect(t.find("companion-group-access-lost")).toBeDefined();
    expect(t.find("companion-msg-synthetic-message")).toBeUndefined();
    expect(t.find("companion-chat-input")).toBeUndefined();
    expect(t.timers.some(timer => timer.active)).toBe(false);
  });

  it("discards a late successful response after the session switches accounts", async () => {
    let resolve!: (r: Response) => void;
    const pending = new Promise<Response>(r => { resolve = r; });
    const t = await setup("CompanionGroupView", {}, r => r.url.includes("/messages/delta") ? pending : undefined);
    await t.flush(); void t.poll(); await tick();
    t.session.data = { user: { id: "another-account" } }; await t.flush();
    resolve(ok({ publicationId: "synthetic-publication", items: [{ ...t.fixture.companionMessageFixture, id: "late-message", sequence: "2" }], nextCursor: "2", highWaterCursor: "2", hasMore: false, canSend: true, relationship: "MEMBER" }));
    await t.flush();
    expect(t.find("companion-group-access-lost")).toBeDefined();
    expect(t.find("companion-msg-late-message")).toBeUndefined();
  });

  it("does not mark hidden or below-viewport messages read; marks visible messages after scrolling", async () => {
    const t = await setup("CompanionGroupView");
    t.document.visibilityState = "hidden"; await t.flush();
    expect(t.requests.filter(r => r.url.endsWith("/read"))).toHaveLength(0);
    t.rects.set("1", { top: 250, bottom: 290 });
    t.document.visibilityState = "visible"; await t.emit("visibilitychange");
    expect(t.requests.filter(r => r.url.endsWith("/read"))).toHaveLength(0);
    t.rects.set("1", { top: 10, bottom: 50 }); await t.emit("scroll");
    expect(t.requests.filter(r => r.url.endsWith("/read")).map(r => r.body)).toEqual([{ sequence: "1" }]);
  });

  it("bounds read markers to the browser viewport, even when the transcript extends below the window", async () => {
    const t = await setup("CompanionGroupView");
    t.props.initialHistory.items.push({ ...t.fixture.companionMessageFixture, id: "below-window", sequence: "2" });
    t.props.initialHistory.highWaterCursor = "2";
    t.browserWindow.innerHeight = 80;
    t.rects.set("1", { top: 10, bottom: 50 }); t.rects.set("2", { top: 100, bottom: 140 });
    await t.flush();
    expect(t.requests.filter(r => r.url.endsWith("/read")).map(r => r.body)).toEqual([{ sequence: "1" }]);
    t.browserWindow.innerHeight = 200; await t.emit("resize");
    expect(t.requests.filter(r => r.url.endsWith("/read")).map(r => r.body)).toEqual([{ sequence: "1" }, { sequence: "2" }]);
  });

  it.each(["CLOSED", "DEPARTED", "COMPLETED", "WITHDRAWN", "CANCELED"])("disables joining for authoritative %s despite spare capacity", async recruitmentStatus => {
    const t = await setup("CompanionIntroductionView", { recruitmentStatus });
    const button = t.find("companion-join-btn");
    expect(button === undefined || button.props.disabled === true).toBe(true);
  });

  it("shows the closed status to Guests instead of inviting them to log in and join", async () => {
    const t = await setup("CompanionIntroductionView", { recruitmentStatus: "CLOSED", isGuest: true });
    expect(t.find("companion-guest-login-cta")).toBeUndefined();
    expect(text(t.find("companion-closed-btn"))).toContain("đóng tuyển");
  });

  it("uses Vietnam midnight for the fallback when server recruitment status is absent", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2030-11-14T17:30:00.000Z"));
    const t = await setup("CompanionIntroductionView", { recruitmentStatus: undefined });
    expect(t.find("companion-departed-btn")).toBeDefined();
    expect(t.find("companion-join-btn")).toBeUndefined();
  });
});
