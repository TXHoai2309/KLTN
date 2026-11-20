import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TripsageMemoryPanel } from "./tripsage-memory-panel";

describe("TripSage memory control", () => {
  it("has no memory UI if the server flag is off", () => {
    expect(renderToStaticMarkup(createElement(TripsageMemoryPanel, { enabled: false }))).toBe("");
  });

  it("renders the labeled keyboard-operable disclosure and privacy explanation when enabled", () => {
    const html = renderToStaticMarkup(createElement(TripsageMemoryPanel, { enabled: true }));
    expect(html).toContain("<summary>Bộ nhớ của tôi</summary>");
    expect(html).toContain("Trợ lý chỉ lưu sở thích bạn muốn nhớ");
  });
});
