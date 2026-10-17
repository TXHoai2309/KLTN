import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ProtectedLink } from "./protected-link";

describe("ProtectedLink server rendering", () => {
  it("renders valid semantic <a> element with href and preserved children", () => {
    const html = renderToStaticMarkup(
      createElement(
        ProtectedLink,
        {
          href: "/favorites",
          intent: "favorites",
          className: "test-link",
          "aria-current": "page",
        },
        "Điểm đến yêu thích"
      )
    );

    expect(html).toContain('href="/favorites"');
    expect(html).toContain('class="test-link"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("Điểm đến yêu thích");
  });

  it("renders planner and trips links with valid href attributes", () => {
    const plannerHtml = renderToStaticMarkup(
      createElement(
        ProtectedLink,
        { href: "/trips/new", intent: "planner" },
        "Lập hành trình"
      )
    );
    expect(plannerHtml).toContain('href="/trips/new"');

    const tripsHtml = renderToStaticMarkup(
      createElement(
        ProtectedLink,
        { href: "/trips", intent: "trips" },
        "Chuyến đi của tôi"
      )
    );
    expect(tripsHtml).toContain('href="/trips"');
  });
});
