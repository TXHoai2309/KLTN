import { afterEach, describe, expect, it, vi } from "vitest";

const effects = vi.hoisted(() => ({ run: null as null | (() => void | (() => void)) }));
vi.mock("react", () => ({
  useRef: (current: unknown) => ({ current }),
  useEffect: (run: typeof effects.run) => { effects.run = run; },
}));
import { useUnsavedChanges } from "./use-unsaved-changes";

afterEach(() => vi.unstubAllGlobals());
describe("unsaved-change unload guard", () => {
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
