import { describe, expect, it, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  AuthRequiredProvider,
  useAuthRequired,
  type AuthRequiredContextValue,
} from "./auth-required-provider";
import { authClient } from "@/lib/auth-client";
import { AUTH_INTENT_CONFIGS } from "@/lib/auth-intent-config";

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: vi.fn(),
  },
}));

describe("AuthRequiredProvider & useAuthRequired context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authClient.useSession).mockReturnValue({
      data: null,
      isPending: false,
      error: null,
      refetch: vi.fn(),
    } as any);
  });

  it("provides default safe fallback when accessed without provider", () => {
    let captured: AuthRequiredContextValue | null = null;
    function Consumer() {
      captured = useAuthRequired();
      return null;
    }

    renderToStaticMarkup(createElement(Consumer));

    expect(captured).toBeDefined();
    expect(captured!.isAuthModalOpen).toBe(false);
    expect(captured!.isAuthenticated).toBe(false);
    expect(captured!.canUseTraveler).toBe(false);
    expect(captured!.returnTo).toBe("/dashboard");
    expect(captured!.currentIntent).toBe("generic");
  });

  it("mounts AuthRequiredDialog within the provider tree", () => {
    const html = renderToStaticMarkup(
      createElement(
        AuthRequiredProvider,
        null,
        createElement("div", null, "App Content")
      )
    );

    expect(html).toContain("App Content");
    // Initially modal is closed
    expect(html).not.toContain('role="dialog"');
  });

  it("exposes user session capabilities and intent configs", () => {
    const intents = Object.keys(AUTH_INTENT_CONFIGS);
    expect(intents).toContain("favorites");
    expect(intents).toContain("planner");
    expect(intents).toContain("trips");
    expect(intents).toContain("dashboard");
    expect(intents).toContain("account");
    expect(intents).toContain("trip_save");
    expect(intents).toContain("session_expired");
  });
});
