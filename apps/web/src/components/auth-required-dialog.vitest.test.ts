import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AuthRequiredDialog } from "./auth-required-dialog";
import { AUTH_INTENT_CONFIGS, type AuthIntent } from "@/lib/auth-intent-config";

describe("AuthRequiredDialog rendering and accessibility", () => {
  it("renders with role=dialog, aria-modal=true and accessible label/description", () => {
    const html = renderToStaticMarkup(
      createElement(AuthRequiredDialog, {
        open: true,
        intent: "favorites",
        returnTo: "/favorites",
        onClose: vi.fn(),
      })
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("aria-labelledby=");
    expect(html).toContain("aria-describedby=");
    expect(html).toContain(AUTH_INTENT_CONFIGS.favorites.title);
    expect(html).toContain(AUTH_INTENT_CONFIGS.favorites.description);
  });

  it("renders contextual copy for all supported intents", () => {
    const intents: AuthIntent[] = [
      "favorites",
      "planner",
      "trips",
      "trip_save",
      "dashboard",
      "account",
      "session_expired",
      "generic",
    ];

    for (const intent of intents) {
      const html = renderToStaticMarkup(
        createElement(AuthRequiredDialog, {
          open: true,
          intent,
          returnTo: "/test",
          onClose: vi.fn(),
        })
      );

      expect(html).toContain(AUTH_INTENT_CONFIGS[intent].title);
      expect(html).toContain(AUTH_INTENT_CONFIGS[intent].description);
    }
  });

  it("provides Sign In, Sign Up and Later actions with safe returnTo links", () => {
    const html = renderToStaticMarkup(
      createElement(AuthRequiredDialog, {
        open: true,
        intent: "planner",
        returnTo: "/trips/new",
        onClose: vi.fn(),
      })
    );

    expect(html).toContain('href="/login?returnTo=%2Ftrips%2Fnew"');
    expect(html).toContain('href="/login?mode=signup&amp;returnTo=%2Ftrips%2Fnew"');
    expect(html).toContain("Đăng nhập");
    expect(html).toContain("Tạo tài khoản");
    expect(html).toContain("Để sau");
    expect(html).toContain('aria-label="Đóng cửa sổ"');
  });

  it("renders nothing when open is false", () => {
    const html = renderToStaticMarkup(
      createElement(AuthRequiredDialog, {
        open: false,
        intent: "favorites",
        returnTo: "/favorites",
        onClose: vi.fn(),
      })
    );

    expect(html).toBe("");
  });
});
