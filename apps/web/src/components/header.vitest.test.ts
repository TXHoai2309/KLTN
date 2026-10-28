import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const route = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
vi.mock("./mode-toggle", () => ({ ModeToggle: () => null }));
vi.mock("./user-menu", () => ({ default: () => null }));
vi.mock("./header.css", () => ({}));

import Header from "./header";

function navigation(pathname: string) {
  route.pathname = pathname;
  const html = renderToStaticMarkup(createElement(Header));
  return html.match(/<nav class="site-nav"[^>]*>([\s\S]*?)<\/nav>/)![1];
}

describe("Trip navigation matches the single My Trips entry", () => {
  it("keeps one trips destination before Favorites without a separate creation menu", () => {
    const html = navigation("/");
    expect(html.match(/href="\/trips"/g)).toHaveLength(1);
    expect(html).toContain("Chuyến đi của tôi");
    expect(html).not.toContain('href="/trips/new"');
    expect(html).not.toContain("Lập hành trình");
    expect(html.indexOf('href="/trips"')).toBeLessThan(html.indexOf('href="/favorites"'));
  });

  it.each(["/trips", "/trips/new", "/trips/owned", "/trips/owned/edit", "/trips/owned/in-trip"])(
    "keeps My Trips active at %s",
    pathname => {
      const html = navigation(pathname);
      const trips = html.match(/<a\b[^>]*href="\/trips"[^>]*>/)![0];
      expect(trips).toContain('data-active="true"');
      expect(trips).toContain('aria-current="page"');
      expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    },
  );

  it.each(["/", "/favorites", "/trips-other"])("does not activate My Trips at %s", pathname => {
    const trips = navigation(pathname).match(/<a\b[^>]*href="\/trips"[^>]*>/)![0];
    expect(trips).not.toContain("aria-current");
    expect(trips).not.toContain("data-active");
  });

  it("renders Tìm bạn đồng hành in navigation", () => {
    const html = navigation("/");
    expect(html).toContain("Tìm bạn đồng hành");
    expect(html).toContain('href="/trip-companions"');
  });

  it.each(["/trip-companions", "/trip-companions/pub-sample"])(
    "activates Tìm bạn đồng hành at %s",
    pathname => {
      const html = navigation(pathname);
      const companionLink = html.match(/<a\b[^>]*href="\/trip-companions"[^>]*>/)![0];
      expect(companionLink).toContain('data-active="true"');
      expect(companionLink).toContain('aria-current="page"');
    },
  );
});
