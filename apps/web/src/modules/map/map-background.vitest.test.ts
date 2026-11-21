import { afterEach, describe, expect, it, vi } from "vitest";
import { mapStyle, readMapBackground, saveMapBackground, stadiaStyles } from "./map-config";

afterEach(() => vi.unstubAllGlobals());

describe("map background", () => {
  it("uses the terrain style regardless of theme, otherwise the themed default", () => {
    expect(mapStyle("dark", "terrain")).toBe(stadiaStyles.terrain);
    expect(mapStyle("dark")).toBe(stadiaStyles.dark);
    expect(mapStyle("light", "default")).toBe(stadiaStyles.light);
  });

  it("remembers the choice on this device", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
    expect(readMapBackground()).toBe("default");
    saveMapBackground("terrain");
    expect(readMapBackground()).toBe("terrain");
  });

  it("falls back to the default when storage is blocked", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } });
    expect(() => saveMapBackground("terrain")).not.toThrow();
    expect(readMapBackground()).toBe("default");
  });
});
