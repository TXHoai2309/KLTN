import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import CultureContent from "./culture-content";
import { serializeRichContent } from "@/modules/culture/culture-rich-content";
it("renders legacy HTML as escaped literal prose", () => {
  const html = renderToStaticMarkup(createElement(CultureContent, { content: '<script>alert(1)</script>\n\n## Literal' }));
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("<script>");
  expect(html).toContain("## Literal");
});
it("renders allowed rich structure while escaping text and ignoring supplied link attributes", () => {
  const content = serializeRichContent({ type: "doc", content: [{ type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Heading" }] }, { type: "paragraph", content: [{ type: "text", text: "<img onerror=alert(1)>", marks: [{ type: "bold" }, { type: "link", attrs: { href: "https://example.org", target: "dangerous", class: "untrusted" } }] }] }] });
  const html = renderToStaticMarkup(createElement(CultureContent, { content }));
  expect(html).toContain("<h3>Heading</h3>");
  expect(html).toContain("<strong>&lt;img");
  expect(html).toContain('rel="noopener noreferrer"');
  expect(html).not.toContain('class="untrusted"');
  expect(html).not.toContain("<img");
});
