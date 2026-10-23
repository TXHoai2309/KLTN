import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import UserMenu from "./user-menu";

const fixture = vi.hoisted(() => ({ data: null as unknown, isPending: true }));
vi.mock("@/lib/auth-client", () => ({ authClient: { useSession: () => ({ ...fixture, error: null, refetch() {} }) } }));
vi.mock("next/navigation", () => ({ usePathname: () => "/explore", useSearchParams: () => new URLSearchParams() }));

describe("shared UserMenu hydration", () => {
  it("matches pending server HTML when the browser already knows it is a Guest", () => {
    fixture.data = null; fixture.isPending = true;
    const server = renderToStaticMarkup(createElement(UserMenu));
    fixture.isPending = false;
    expect(renderToStaticMarkup(createElement(UserMenu))).toBe(server);
  });

  it.each(["TRAVELER", "ADMIN"])("matches the same first-paint shell with a cached %s session", role => {
    fixture.data = null; fixture.isPending = true;
    const server = renderToStaticMarkup(createElement(UserMenu));
    fixture.isPending = false;
    fixture.data = { user: { id: "fixture", name: "Private Fixture", email: "fixture@example.invalid", role } };
    const firstClient = renderToStaticMarkup(createElement(UserMenu));
    expect(firstClient).toBe(server);
    expect(firstClient).not.toContain("Private Fixture");
  });
});
