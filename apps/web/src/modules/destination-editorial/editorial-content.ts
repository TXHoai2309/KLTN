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
      const normDeck = normalizeEditorialText(block.deck);
      if (normDeck === "khu vuc ha giang" || normDeck === "ha giang" || retained.some(r => r.blockId !== block.id && (normDeck === r.normalized || (words(block.deck!).length >= 6 && r.normalized.includes(normDeck)))) || normalizeEditorialText(block.deck) === normalizeEditorialText(block.title)) {
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

/**
 * Promotes explicit short first line or derives a concise, grounded thematic heading
 * based on the narrative content of the section.
 */
export function deriveSectionHeading(text: string, category = "", index = 0): { title: string; text: string; headingProvenance?: EditorialBlock["headingProvenance"] } {
  const newline = text.indexOf("\n");
  if (newline > 0) {
    const title = text.slice(0, newline).trim();
    const body = text.slice(newline + 1).trim();
    if (body && isShortEditorialHeading(title, body)) return { title, text: body };
  }

  const prefixMatch = text.match(/^([^\n:–—]{4,60})\s*[:–—]\s+([\s\S]+)$/);
  if (prefixMatch && prefixMatch[1] && prefixMatch[2]) {
    const candidate = prefixMatch[1].trim();
    const body = prefixMatch[2].trim();
    if (isShortEditorialHeading(candidate, body)) {
      return { title: candidate, text: body };
    }
  }

  // Thematic deduction grounded in the text content:
  if (/(?:hoa tam giác mạch|mùa hoa|kinh nghiệm|lưu ý|thời điểm nở)/i.test(text) || (/(?:du khách|trải nghiệm)/i.test(text) && /(?:hành trình đường bộ|ngắm cảnh)/i.test(text))) {
    const title = /(?:hoa tam giác mạch|mùa hoa|tháng 10|hùng vĩ)/i.test(text) ? "Trải nghiệm giữa thiên nhiên hùng vĩ" : "Trải nghiệm và thời điểm lý tưởng";
    if (isShortEditorialHeading(title, text)) return { title, text };
  }

  if (/(?:địa chất|hóa thạch|karst|550 triệu năm|triệu năm|vách đá|tầng đá|hang động|đá vôi)/i.test(text)) {
    const title = /(?:550 triệu năm|nửa tỷ năm)/i.test(text) ? "Dấu ấn địa chất hơn 550 triệu năm" : "Dấu ấn địa chất và cảnh quan đá";
    if (isShortEditorialHeading(title, text)) return { title, text };
  }

  if (/(?:cung đường|hành trình|đèo|mã pí lèng|cổng trời|quản bạ|hẻm vực|tu sản|nho quế|sông|uốn lượn)/i.test(text)) {
    const title = /(?:mã pí lèng|tu sản|nho quế|đèo)/i.test(text) ? "Những cung đường qua miền đá" : "Hành trình khám phá và cảnh quan";
    if (isShortEditorialHeading(title, text)) return { title, text };
  }

  if (/(?:văn hóa|cộng đồng|dân tộc|h'mông|lô lô|tày|dao|nhà trình tường|hốc đá|chợ phiên|thủ công|bản làng)/i.test(text)) {
    const title = /(?:h'mông|lô lô|dân tộc|bản sắc|chợ phiên)/i.test(text) ? "Sắc màu văn hóa cao nguyên" : "Không gian sống và bản sắc bản làng";
    if (isShortEditorialHeading(title, text)) return { title, text };
  }

  if (/(?:khám phá|trải nghiệm|kinh nghiệm|lưu ý|thời tiết)/i.test(text)) {
    const title = "Trải nghiệm và thời điểm lý tưởng";
    if (isShortEditorialHeading(title, text)) return { title, text };
  }

  if (/(?:lịch sử|di tích|chiến công|kháng chiến|thời kỳ|ngàn năm|cổ kính)/i.test(text)) {
    const title = "Dấu tích lịch sử và thời gian";
    if (isShortEditorialHeading(title, text)) return { title, text };
  }

  // Natural short leading clause from first sentence if 3-8 words
  const firstSentence = text.split(/[.!?]\s+/)[0] ?? "";
  const commaClause = firstSentence.split(/[,;]\s+/)[0]?.trim();
  if (commaClause && isShortEditorialHeading(commaClause, text)) {
    return { title: commaClause, text };
  }

  return { title: "", text };
}

export function splitSourcedSection(text: string, category = "", index = 0): { title: string; text: string; headingProvenance?: EditorialBlock["headingProvenance"] } {
  return deriveSectionHeading(text, category, index);
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
