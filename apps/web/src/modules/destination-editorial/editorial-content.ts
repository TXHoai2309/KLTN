import type { EditorialBlock, EditorialLayout } from "./editorial-contract";

export const normalizeEditorialText = (text: string) => text.normalize("NFC").toLocaleLowerCase("vi").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export const editorialParagraphs = (text: string) => text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
const words = (text: string) => normalizeEditorialText(text).split(/\s+/).filter(Boolean);
export function isShortEditorialHeading(title: string, body = "") {
  const count = words(title).length;
  return Boolean(title.trim()) && title.length <= 70 && count >= 2 && count <= 10 &&
    !/[.!?…]$/.test(title.trim()) && !/(?:^|\s)(là|và|của|với|tại|được|cho|những|các)$/u.test(title.trim()) &&
    !editorialParagraphs(body).some(p => {
      const normalized = normalizeEditorialText(p), heading = normalizeEditorialText(title);
      return normalized === heading || (normalized.includes(heading) && count / words(p).length >= .8);
    });
}
export function nearDuplicateEditorialText(a: string, b: string) {
  const x = words(a), y = words(b);
  if (Math.min(x.length, y.length) < 12) return false;
  const left = new Set(x), right = new Set(y);
  const intersection = [...left].filter(w => right.has(w)).length;
  return intersection / new Set([...left, ...right]).size >= .82;
}
export type EditorialContentIssue = { code: "LONG_HEADING" | "DUPLICATE_HEADING" | "DUPLICATE_PARAGRAPH" | "NEAR_DUPLICATE"; blockId: string; relatedBlockId?: string };
const narrative = new Set(["HERO", "INTRO", "TEXT_SECTION", "IMAGE_TEXT_SPLIT"]);

/** A read-only presentation projection. Canonical records and stored draft JSON are never mutated. */
export function prepareEditorialContent(layout: EditorialLayout, canonicalSource = "") {
  const issues: EditorialContentIssue[] = [];
  const blocks = layout.blocks.map(b => ({ ...b }));
  const retained: { text: string; normalized: string; blockId: string }[] = [];
  // Give the lead ownership of a repeated opening paragraph, regardless of block ordering.
  const ordered = [...blocks.filter(b => b.type === "INTRO"), ...blocks.filter(b => b.type !== "INTRO")];
  for (const block of ordered) {
    if (block.hidden) continue;
    if (block.type !== "HERO" && block.title) {
      const duplicate = editorialParagraphs(block.text).some(p => normalizeEditorialText(p) === normalizeEditorialText(block.title));
      if (duplicate || !isShortEditorialHeading(block.title, block.text)) {
        issues.push({ code: duplicate ? "DUPLICATE_HEADING" : "LONG_HEADING", blockId: block.id });
        block.title = ""; // Keep the complete body; never truncate it to rescue a heading.
      }
    }
    if (!narrative.has(block.type)) continue;
    block.text = editorialParagraphs(block.text).filter(p => {
      const normalized = normalizeEditorialText(p);
      const exact = retained.find(r => r.normalized === normalized);
      if (exact) { issues.push({ code: "DUPLICATE_PARAGRAPH", blockId: block.id, relatedBlockId: exact.blockId }); return false; }
      const near = retained.find(r => nearDuplicateEditorialText(r.text, p));
      // Similar paragraphs can differ in a date/name/qualifier. Surface them for review,
      // rather than deleting a potentially distinct fact using a similarity threshold.
      if (near) issues.push({ code: "NEAR_DUPLICATE", blockId: block.id, relatedBlockId: near.blockId });
      retained.push({ text: p, normalized, blockId: block.id }); return true;
    }).join("\n\n");
    if (block.type === "HERO" && block.deck) {
      if (retained.some(r => r.blockId !== block.id && (normalizeEditorialText(block.deck!) === r.normalized || (words(block.deck!).length >= 6 && r.normalized.includes(normalizeEditorialText(block.deck!))))) || normalizeEditorialText(block.deck) === normalizeEditorialText(block.title)) {
        issues.push({ code: "DUPLICATE_PARAGRAPH", blockId: block.id }); block.deck = "";
      }
    }
  }
  const hero = blocks.find(b => b.type === "HERO" && !b.hidden);
  const lead = blocks.find(b => b.type === "INTRO" && !b.hidden);
  return {
    canonicalSource,
    layout: { ...layout, blocks }, issues,
    heroTitle: hero?.title ?? "",
    heroDeck: hero?.deck || (hero && hero.text.length <= 180 ? hero.text : ""),
    leadParagraphs: editorialParagraphs(lead?.text ?? ""),
    sections: blocks.filter(b => ["TEXT_SECTION", "IMAGE_TEXT_SPLIT"].includes(b.type)).map(b => ({ blockId: b.id, heading: b.title, body: b.text, caption: b.caption, provenance: b.headingProvenance })),
  };
}

/** Only an explicit short first line is promoted; never truncate a sentence into a heading. */
export function splitSourcedSection(text: string): { title: string; text: string; headingProvenance?: EditorialBlock["headingProvenance"] } {
  const newline = text.indexOf("\n");
  if (newline > 0) {
    const title = text.slice(0, newline).trim(), body = text.slice(newline + 1).trim();
    if (body && isShortEditorialHeading(title, body)) return { title, text: body };
  }
  return { title: "", text };
}

/** Keep the title in 2–3 word phrases so desktop line breaks cannot strand one word. */
export function editorialTitlePhrases(title: string) {
  const tokens = title.trim().split(/\s+/), phrases: string[] = [];
  for (let i = 0; i < tokens.length;) {
    const count = tokens.length - i === 3 ? 3 : 2;
    phrases.push(tokens.slice(i, i + count).join(" ")); i += count;
  }
  return phrases;
}
