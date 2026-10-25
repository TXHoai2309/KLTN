import { describe, expect, it, vi } from "vitest";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

type Element = { type: unknown; props: Record<string, any> };
type Slot = { value?: any; deps?: unknown[]; cleanup?: () => void };
const data = (name = "server") => ({ items: [{ id: name, name, area: "Đồng Văn", category: "Cảnh quan", latitude: 23, longitude: 105 }], filters: { categories: [], regions: [] } });

async function setup() {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL("./explore-results.tsx", import.meta.url))],
    bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic", logLevel: "silent",
    external: ["react", "react/*", "next/*", "@/components/map/destination-map", "./destination-card", "./destination-search-form", "@/modules/destination/destination-search-client"],
  });
  const require = createRequire(import.meta.url), slots: Slot[] = [], pending: Array<() => void> = [];
  let cursor = 0, query = "";
  const events = new Map<string, () => void>();
  const slot = () => slots[cursor++] ?? (slots[cursor - 1] = {});
  const changed = (before: unknown[] | undefined, after: unknown[] | undefined) => !before || !after || before.length !== after.length || before.some((value, index) => !Object.is(value, after[index]));
  const hooks = { ...require("react"),
    useState: (initial: any) => { const s = slot(); if (!("value" in s)) s.value = typeof initial === "function" ? initial() : initial; return [s.value, (value: any) => { s.value = typeof value === "function" ? value(s.value) : value; }]; },
    useRef: (initial: any) => { const s = slot(); return s.value ?? (s.value = { current: initial }); },
    useMemo: (make: () => unknown, deps: unknown[]) => { const s = slot(); if (changed(s.deps, deps)) { s.value = make(); s.deps = deps; } return s.value; },
    useCallback: (callback: unknown, deps: unknown[]) => { const s = slot(); if (changed(s.deps, deps)) { s.value = callback; s.deps = deps; } return s.value; },
    useEffect: (work: () => (() => void) | undefined, deps: unknown[]) => { const s = slot(); if (changed(s.deps, deps)) { s.deps = deps; pending.push(() => { s.cleanup?.(); s.cleanup = work(); }); } },
  };
  const request = vi.fn((_params: URLSearchParams, onState: (state: unknown) => void) => { onState({ status: "loading" }); return vi.fn(); });
  const jsx = (type: unknown, props: Record<string, any>): Element => ({ type, props });
  const module = { exports: {} as { default: (props: object) => Element } };
  new Function("require", "module", "exports", "window", bundle.outputFiles[0]!.text)((id: string) => {
    if (id === "react") return hooks;
    if (id === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (id === "next/navigation") return { useSearchParams: () => new URLSearchParams(query), useRouter: () => ({ push() {} }) };
    if (id === "@/modules/destination/destination-search-client") return { startDestinationRequest: request };
    if (id === "@/components/map/destination-map" || id === "./destination-card") return { default: () => null };
    if (id === "./destination-search-form") return { DestinationSearchForm: "SearchForm", DestinationResultStatus: "ResultStatus" };
    return require(id);
  }, module, module.exports, { addEventListener: (name: string, handler: () => void) => events.set(name, handler), removeEventListener: (name: string) => events.delete(name) });
  const render = (props: object, search = "") => { query = search; cursor = 0; const tree = module.exports.default(props); for (const effect of pending.splice(0)) effect(); return tree; };
  const elements = (tree: any): Element[] => Array.isArray(tree) ? tree.flatMap(elements) : tree && typeof tree === "object" && "props" in tree ? [tree, ...elements(tree.props.children)] : [];
  return { render, request, elements, events };
}

describe("Explore server data hydration", () => {
  it("keeps matching server results visible while the no-store freshness read is pending", async () => {
    const t = await setup(), props = { data: data(), initialQuery: "" };
    t.render(props);
    const tree = t.render(props);
    expect(t.request).toHaveBeenCalledTimes(1);
    expect(t.elements(tree).find(element => element.type === "ResultStatus")!.props.state.status).toBe("ready");
  });

  it("uses matching server results on filter navigation, ignores old responses and revalidates retry and remount", async () => {
    const t = await setup();
    t.render({ data: data(), initialQuery: "" });
    const props = { data: data("filtered"), initialQuery: "q=filtered" };
    let tree = t.render(props, "q=filtered");
    expect(t.request).toHaveBeenCalledTimes(2);
    t.request.mock.calls[0]![1]({ status: "ready", data: data("obsolete") });
    tree = t.render(props, "q=filtered");
    expect(t.elements(tree).find(element => element.type === "ResultStatus")!.props.state.data.items[0].id).toBe("filtered");
    t.elements(tree).find(element => element.type === "ResultStatus")!.props.onRetry();
    tree = t.render(props, "q=filtered");
    expect(t.request).toHaveBeenCalledTimes(3);
    const restored = await setup();
    restored.render(props, "q=filtered");
    expect(restored.request).toHaveBeenCalledTimes(1);
  });

  it("preserves error semantics and never substitutes old-query data", async () => {
    const t = await setup();
    const props = { error: "Unavailable", initialQuery: "q=first" };
    let tree = t.render(props, "q=first");
    expect(t.request).toHaveBeenCalledTimes(1);
    expect(t.elements(tree).find(element => element.type === "ResultStatus")!.props.state.status).toBe("error");
    tree = t.render(props, "q=other");
    expect(t.request).toHaveBeenCalledTimes(2);
    expect(t.elements(tree).find(element => element.type === "ResultStatus")!.props.state.status).toBe("loading");
  });
});
