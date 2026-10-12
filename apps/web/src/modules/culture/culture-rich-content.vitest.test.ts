import { describe, it, expect } from "vitest";
import { contentForEditor, parseRichContent, richContentText, serializeRichContent, safeContentLink, RICH_CONTENT_PREFIX, type RichNode } from "./culture-rich-content";
import { cultureInputSchema } from "./culture-contract";
import { canonicalCultureCategory, normalizeCultureCategorySearch, resolveCategoryLabel } from "./culture-categories";
import { cultureProfileSchema } from "../content-profile/content-profile-contract";
const paragraph = (text: string): RichNode => ({ type: "paragraph", content: [{ type: "text", text }] });
describe("Culture rich content compatibility and security", () => {
  it("keeps legacy markup and punctuation literal on open, without emitting a new format", () => {
    const legacy = '<script>alert(1)</script>\n## Literal heading\n*literal* [link](url)';
    expect(parseRichContent(legacy)).toBeNull();
    expect(richContentText(legacy)).toBe(legacy);
    expect(contentForEditor(legacy).content?.[0]).toEqual(paragraph('<script>alert(1)</script>'));
  });
  it("roundtrips headings, nested lists, start numbers, paragraphs, breaks, quotes and marks", () => {
    const doc: RichNode = { type: "doc", content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Heading" }] },
      { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Subheading" }] },
      { type: "orderedList", attrs: { start: 4 }, content: [{ type: "listItem", content: [paragraph("item"), paragraph("second paragraph"), { type: "bulletList", content: [{ type: "listItem", content: [paragraph("nested")] }] }] }] },
      { type: "blockquote", content: [paragraph("quoted")] },
      { type: "paragraph", content: [{ type: "text", text: '<img onerror="alert(1)"> [literal]*', marks: [{ type: "bold" }, { type: "italic" }, { type: "link", attrs: { href: "https://example.org/path?a=1&b=2" } }] }, { type: "hardBreak" }, { type: "text", text: "line" }] },
    ] };
    expect(contentForEditor(serializeRichContent(doc))).toEqual(doc);
    expect(richContentText(serializeRichContent(doc))).toContain("## Heading\n### Subheading\nitem\nsecond paragraph\nnested\nquoted");
  });
  it.each(["javascript:alert(1)", "data:text/html,x", "https://user:pass@example.org", "https://example.org/\n", "mailto:a@b", "https://", 'https://example.org/" onclick="x'])("rejects dangerous or malformed links: %s", href => {
    expect(safeContentLink(href)).toBe(false);
    expect(parseRichContent(serializeRichContent({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "link", marks: [{ type: "link", attrs: { href } }] }] }] }))).toBeNull();
  });
  it("rejects unknown HTML attributes/nodes, malformed and empty rich writes", () => {
    for (const doc of [{ type: "doc", content: [{ type: "script", text: "bad" }] }, { type: "doc", content: [{ type: "paragraph", attrs: { onclick: "bad" } }] }, { type: "doc", content: [] }]) {
      expect(cultureInputSchema.shape.content.safeParse(serializeRichContent(doc)).success).toBe(false);
    }
    expect(cultureInputSchema.shape.content.safeParse(RICH_CONTENT_PREFIX + "broken").success).toBe(false);
    expect(cultureInputSchema.shape.content.safeParse("Legacy content").success).toBe(true);
  });
  it("enforces the existing 20000-character storage contract", () => {
    expect(cultureInputSchema.shape.content.safeParse(serializeRichContent({ type: "doc", content: [paragraph("a".repeat(20000))] })).success).toBe(false);
  });
});
describe("shared category contract", () => {
  it.each(["Lễ hội", " LE HOI ", "lễ HỘI", "le-hoi"])("canonicalizes spelling equivalents: %s", value => expect(canonicalCultureCategory(value)).toBe("le-hoi"));
  it("preserves unknown legacy values, optional null and Vietnamese display", () => {
    expect(canonicalCultureCategory("Legacy category")).toBe("Legacy category");
    expect(cultureProfileSchema.parse({ category: "  LỄ HỘI  " }).category).toBe("le-hoi");
    expect(resolveCategoryLabel("le-hoi")).toBe("Lễ hội");
    expect(normalizeCultureCategorySearch("Đời sống cộng đồng")).toBe("doi song cong dong");
    expect(canonicalCultureCategory(null)).toBeNull();
  });
});
