import { describe, expect, it, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import FavoriteButton from "./favorite-button";
import { authClient } from "@/lib/auth-client";
import { resolveFavoriteClickAction } from "./favorite-mutation-logic";

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: vi.fn(),
  },
}));

describe("FavoriteButton Guest UX v2", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders safe initial skeleton on SSR without exposing private data to guests", () => {
    vi.mocked(authClient.useSession).mockReturnValue({
      data: null,
      isPending: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    const html = renderToStaticMarkup(
      createElement(FavoriteButton, {
        targetType: "destinations",
        targetId: "dest-dong-van",
        initialIsFavorite: false,
      })
    );

    // SSR renders skeleton placeholder avoiding hydration mismatch and hiding private state
    expect(html).toContain("favorite-button-skeleton");
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain("owned-private-trip");
  });

  it("determines LOGIN click action for unauthenticated Guest without mutating", () => {
    // Confirmed unauthenticated guest
    expect(resolveFavoriteClickAction(undefined, false)).toBe("LOGIN");
    // Session error still resolves to LOGIN boundary rather than silent mutation
    expect(resolveFavoriteClickAction(undefined, true)).toBe("LOGIN");
  });

  it("determines MUTATE click action for authenticated TRAVELER and ADMIN", () => {
    expect(resolveFavoriteClickAction("TRAVELER", false)).toBe("MUTATE");
    expect(resolveFavoriteClickAction("ADMIN", false)).toBe("MUTATE");
    // Unsupported role is ignored
    expect(resolveFavoriteClickAction("ANONYMOUS", false)).toBe("IGNORE");
  });
});
