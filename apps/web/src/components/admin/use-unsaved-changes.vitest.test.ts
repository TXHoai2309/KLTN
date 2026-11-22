import { afterEach, describe, expect, it, vi } from "vitest";

const effects = vi.hoisted(() => ({ run: null as null | (() => void | (() => void)) }));
vi.mock("react", () => ({
  useRef: (current: unknown) => ({ current }),
  useEffect: (run: typeof effects.run) => { effects.run = run; },
}));
import { useUnsavedChanges } from "./use-unsaved-changes";

afterEach(() => vi.unstubAllGlobals());
describe("unsaved-change unload guard", () => {
  it.each([false, true])("keeps edits on Stay and only resumes confirmed navigation (busy=%s)", busy => {
    class Node extends EventTarget {
      children: Node[] = []; textContent = ""; className = ""; id = "";
      type = ""; autofocus = false; removed = false;
      append(...children: Node[]) { this.children.push(...children); }
      setAttribute() {}
      showModal() {}
      close() { this.dispatchEvent(new Event("close")); }
      remove() { this.removed = true; }
      focus() {}
      closest() { return anchor; }
      hasAttribute() { return false; }
    }
    const browser = new EventTarget(), root = new Node();
    let navigations = 0;
    const anchor = Object.assign(new Node(), { href: "http://localhost/trips/fixture", target: "", click: () => navigations++ });
    vi.stubGlobal("window", browser); vi.stubGlobal("Element", Node); vi.stubGlobal("HTMLElement", Node);
    vi.stubGlobal("location", new URL("http://localhost/trips/fixture/edit"));
    vi.stubGlobal("document", { activeElement: anchor, createElement: () => new Node(), querySelector: () => root });
    useUnsavedChanges(true, busy);
    const cleanup = effects.run!();
    const click = () => {
      const event = new Event("click", { cancelable: true });
      Object.defineProperties(event, { target: { value: anchor }, button: { value: 0 } });
      browser.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      return root.children.at(-1)!;
    };
    const first = click();
    first.children[2]!.children[0]!.dispatchEvent(new Event("click")); // Stay
    expect(first.removed).toBe(true); expect(navigations).toBe(0);
    const second = click(); // Stay did not clear dirty/busy state.
    expect(second.children[2]!.children).toHaveLength(busy ? 1 : 2);
    if (!busy) {
      second.children[2]!.children[1]!.dispatchEvent(new Event("click"));
      expect(navigations).toBe(1);
    }
    if (typeof cleanup === "function") cleanup();
  });
  it.each([[false, false, false], [true, false, true], [false, true, true]])(
    "dirty=%s busy=%s blocks refresh=%s and cleans up its listener",
    (dirty, busy, blocked) => {
      const browser = new EventTarget();
      vi.stubGlobal("window", browser);
      const allowLeave = useUnsavedChanges(dirty, busy, ".trip-shell");
      const cleanup = effects.run!();
      const refresh = new Event("beforeunload", { cancelable: true });
      browser.dispatchEvent(refresh);
      expect(refresh.defaultPrevented).toBe(blocked);
      allowLeave();
      const afterSave = new Event("beforeunload", { cancelable: true });
      browser.dispatchEvent(afterSave);
      expect(afterSave.defaultPrevented).toBe(false);
      if (typeof cleanup === "function") cleanup();
      const afterUnmount = new Event("beforeunload", { cancelable: true });
      browser.dispatchEvent(afterUnmount);
      expect(afterUnmount.defaultPrevented).toBe(false);
    },
  );
});
