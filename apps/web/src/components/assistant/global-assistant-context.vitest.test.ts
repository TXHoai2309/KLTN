import { expect, it } from "vitest";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

it("switches the destination widget to the registered page and ignores stale registration cleanup", async () => {
  const bundle = await build({ entryPoints: [fileURLToPath(new URL("./global-assistant.tsx", import.meta.url))], bundle: true, write: false, format: "cjs", platform: "node", jsx: "automatic", loader: { ".css": "empty", ".module.css": "empty" }, external: ["react", "react/*", "react-dom", "next/navigation"], logLevel: "silent" });
  const require = createRequire(import.meta.url);
  const slots: unknown[] = []; let cursor = 0;
  let pathname = "/destinations/a";
  const effects: (() => void)[] = [];
  const hooks = { ...require("react"), useState: (init: unknown) => { const index = cursor++; if (!(index in slots)) slots[index] = typeof init === "function" ? init() : init; return [slots[index], (value: unknown) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }]; },
    useEffect: (effect: () => void) => effects.push(effect), useRef: () => ({ current: null }), useId: () => "page-context", useCallback: (fn: unknown) => fn };
  type Element = { props: Record<string, any> };
  const jsx = (type: unknown, props: Record<string, any>) => ({ type, props });
  const module = { exports: {} as { GlobalAssistantProvider: (props: Record<string, unknown>) => Element } };
  new Function("require", "module", "exports", bundle.outputFiles[0]!.text)((id: string) => id === "react" ? hooks : id === "react/jsx-runtime" ? { jsx, jsxs: jsx } : id === "react-dom" ? { createPortal: (node: unknown) => node } : id === "next/navigation" ? { usePathname: () => pathname } : require(id), module, module.exports);
  const elements = (value: unknown): Element[] => Array.isArray(value) ? value.flatMap(elements) : value && typeof value === "object" && "props" in value ? [value as Element, ...elements((value as Element).props.children)] : [];
  const render = () => { cursor = 0; effects.length = 0; return module.exports.GlobalAssistantProvider({ children: null }); };
  // Only the first effect marks the portal mounted; no DOM/browser is required.
  render(); effects[0]!();
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { configurable: true, value: { body: {} } });
  try {
    const cleanupA = render().props.value({ id: "a", name: "Fixture A" });
    elements(render()).find(e => e.props["aria-label"] === "Hỏi trợ lý AI")!.props.onClick();
    const panel = () => elements(render()).find(e => e.props.panelId === "page-context")!;
    expect(panel().props.context).toEqual({ type: "DESTINATION", destinationId: "a" });
    pathname = "/destinations/b";
    render().props.value({ id: "b", name: "Fixture B" });
    cleanupA();
    expect(panel().props.context).toEqual({ type: "DESTINATION", destinationId: "a" });
    // Registration changes are applied by the destination-switch effect.
    effects[2]!();
    expect(panel().props.context).toEqual({ type: "DESTINATION", destinationId: "b" });
    expect(panel().props.destinationName).toBe("Fixture B");
    pathname = "/explore";
    panel(); effects[2]!();
    expect(panel().props.context).toEqual({ type: "DESTINATION", destinationId: "b" });
  } finally {
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else Reflect.deleteProperty(globalThis, "document");
  }
});
