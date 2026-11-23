import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

describe("K1: ModeToggle direct light/dark switch", () => {
  let ModeToggle: typeof import("./mode-toggle").ModeToggle;
  let resolveNextTheme: typeof import("./mode-toggle").resolveNextTheme;

  beforeAll(async () => {
    vi.resetModules();
    vi.doMock("next-themes", () => ({
      useTheme: () => ({
        theme: "light",
        resolvedTheme: "light",
        setTheme: vi.fn(),
      }),
    }));
    ({ ModeToggle, resolveNextTheme } = await import("./mode-toggle"));
  });

  afterAll(() => {
    vi.doUnmock("next-themes");
    vi.resetModules();
  });

  it("renders a single button trigger without dropdown popup attributes", () => {
    const html = renderToStaticMarkup(createElement(ModeToggle, { locale: "vi" }));
    expect(html).toContain('aria-label="Chuyển giao diện sáng/tối"');
    expect(html).toContain('type="button"');
    expect(html).not.toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-pressed="false"');
  });

  it("switches directly from light to dark and back to light", () => {
    expect(
      resolveNextTheme({ mounted: true, theme: "light", resolvedTheme: "light", domDark: false }),
    ).toBe("dark");
    expect(
      resolveNextTheme({ mounted: true, theme: "dark", resolvedTheme: "dark", domDark: true }),
    ).toBe("light");
  });

  it("switches from light-resolved system mode directly to dark instead of system/light", () => {
    expect(
      resolveNextTheme({ mounted: true, theme: "system", resolvedTheme: "light", domDark: false }),
    ).toBe("dark");
    expect(
      resolveNextTheme({ mounted: true, theme: "system", resolvedTheme: "dark", domDark: true }),
    ).toBe("light");
    expect(
      resolveNextTheme({ mounted: false, theme: undefined, resolvedTheme: undefined, domDark: false }),
    ).toBe("dark");
    expect(
      resolveNextTheme({ mounted: false, theme: undefined, resolvedTheme: undefined, domDark: true }),
    ).toBe("light");
  });
});
