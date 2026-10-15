import type { EditorialBlock, EditorialLayout } from "./editorial-contract";

export const normalizeEditorialText = (text: string) => text.normalize("NFC").toLocaleLowerCase("vi").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export const editorialParagraphs = (text: string) => text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
const words = (text: string) => normalizeEditorialText(text).split(/\s+/).filter(Boolean);

export function stripMarkdownHeading(text: string): string {
  return text
    .replace(/^#{1,6}\s+/, "")
    .replace(/^\*{2}(.+?)\*{2}:?$/, "$1")
    .replace(/^_{2}(.+?)_{2}:?$/, "$1")
    .replace(/^["'“](.*)["'”]$/, "$1")
    .replace(/[:–—\s]+$/, "")
    .trim();
}

export function isShortEditorialHeading(title: string, body = "") {
  const clean = stripMarkdownHeading(title);
  const count = words(clean).length;
  if (!clean || clean.length > 70 || count < 2 || count > 10) return false;
  if (/[.!?…]$/.test(clean)) return false;
  if (/(?:^|\s)(là|và|của|với|tại|được|cho|những|các)$/u.test(clean)) return false;
  // Exclude clauses that start with causal/advisory/subordinate words
  if (/^(?:do|vì|theo|nếu|tuy nhiên|mặc dù|ngoài ra|đặc biệt|lưu ý|khuyến cáo|thông tin về|cần lưu ý|du khách|nên|không nên)(?:\s|$|[^\p{L}\p{N}])/iu.test(clean)) return false;
  // Exclude operational/advisory phrases
  if (/(?:giờ mở cửa|giá vé|vé vào|liên hệ|tiếp cận|quy định|chú ý|cảnh báo)(?:\s|$|[^\p{L}\p{N}])/iu.test(clean)) return false;
  if (body) {
    const heading = normalizeEditorialText(clean);
    if (editorialParagraphs(body).some(p => {
      const normalized = normalizeEditorialText(p);
      return normalized === heading || (normalized.includes(heading) && count / words(p).length >= .8);
    })) return false;
  }
  return true;
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
  const seenHeadings = new Set<string>();
  // Give the lead ownership of a repeated opening paragraph, regardless of block ordering.
  const ordered = [...blocks.filter(b => b.type === "INTRO"), ...blocks.filter(b => b.type !== "INTRO")];
  for (const block of ordered) {
    if (block.hidden) continue;
    if (block.type !== "HERO" && block.title) {
      const cleanTitle = stripMarkdownHeading(block.title);
      block.title = cleanTitle;
      const normTitle = normalizeEditorialText(cleanTitle);

      const duplicate = editorialParagraphs(block.text).some(p => normalizeEditorialText(p) === normTitle);
      const duplicateAcrossBlocks = seenHeadings.has(normTitle);

      if (duplicateAcrossBlocks) {
        issues.push({ code: "DUPLICATE_HEADING", blockId: block.id });
        block.title = ""; // Keep the complete body; never repeat heading across sections
      } else if (duplicate || !isShortEditorialHeading(cleanTitle, block.text)) {
        issues.push({ code: duplicate ? "DUPLICATE_HEADING" : "LONG_HEADING", blockId: block.id });
        block.title = ""; // Keep the complete body; never truncate it to rescue a heading.
      } else {
        seenHeadings.add(normTitle);
      }
    }
    if (!narrative.has(block.type)) continue;
    block.text = editorialParagraphs(block.text).filter(p => {
      const normalized = normalizeEditorialText(p);
      if (block.title && normalized === normalizeEditorialText(block.title)) {
        return false;
      }
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
 * based on the narrative content of the section, with category awareness and deduplication.
 */
export function deriveSectionHeading(
  text: string,
  category = "",
  index = 0,
  usedHeadings?: Set<string>
): { title: string; text: string; headingProvenance?: EditorialBlock["headingProvenance"] } {
  const newline = text.indexOf("\n");
  if (newline > 0) {
    const rawTitle = text.slice(0, newline).trim();
    const title = stripMarkdownHeading(rawTitle);
    const body = text.slice(newline + 1).trim();
    if (body && isShortEditorialHeading(title, body)) {
      usedHeadings?.add(normalizeEditorialText(title));
      return { title, text: body, headingProvenance: { blockId: `section-${index}`, excerpt: title } };
    }
  }

  const prefixMatch = text.match(/^([^\n:–—]{4,60})\s*[:–—]\s+([\s\S]+)$/);
  if (prefixMatch && prefixMatch[1] && prefixMatch[2]) {
    const candidate = stripMarkdownHeading(prefixMatch[1].trim());
    const body = prefixMatch[2].trim();
    if (isShortEditorialHeading(candidate, body) && (!usedHeadings || !usedHeadings.has(normalizeEditorialText(candidate)))) {
      usedHeadings?.add(normalizeEditorialText(candidate));
      return { title: candidate, text: body };
    }
  }

  const tryTitle = (candidate: string) => {
    if (isShortEditorialHeading(candidate, text) && (!usedHeadings || !usedHeadings.has(normalizeEditorialText(candidate)))) {
      usedHeadings?.add(normalizeEditorialText(candidate));
      return candidate;
    }
    return null;
  };

  const normCat = category.normalize("NFC").toLocaleLowerCase("vi");
  const isHeritage = /lịch sử|di tích|kiến trúc|danh thắng|bảo tồn/.test(normCat);
  const isNature = /thiên nhiên|thắng cảnh|địa chất|geopark/.test(normCat);
  const isVillage = /làng|bản làng|văn hóa|cộng đồng/.test(normCat);

  // Category-specific thematic deduction
  if (isHeritage) {
    if (/(?:kiến trúc|quy mô|nhà giam|vọng gác|nhà kho|tường đá|xây dựng|hiện vật|hạng mục|2\.500\s*m²|m²)/i.test(text)) {
      const t = tryTitle("Không gian kiến trúc và dấu tích còn lại") ?? tryTitle("Dấu tích kiến trúc và hiện vật xưa");
      if (t) return { title: t, text };
    }
    if (/(?:chiến sĩ|tù nhân|cách mạng|tinh thần|ý chí|xuân thủy|lê giản|nguyên hồng|trần cung|giam giữ|lao tù|kiên cường|đoàn kết)/i.test(text)) {
      const t = tryTitle("Tinh thần cách mạng vượt qua lao tù") ?? tryTitle("Ký ức con người và tinh thần kiên cường");
      if (t) return { title: t, text };
    }
    if (/(?:xếp hạng|di tích quốc gia|trùng tu|tôn tạo|bảo tồn|quyết định|97\/qđ|bộ văn hóa|giá trị giáo dục)/i.test(text)) {
      const t = tryTitle("Di tích lịch sử quốc gia") ?? tryTitle("Dấu mốc di sản và bảo tồn");
      if (t) return { title: t, text };
    }
    if (/(?:thuộc địa|đồn binh|thực dân|pháp|kháng chiến|giai đoạn 19|bối cảnh|lịch sử)/i.test(text)) {
      const t = tryTitle("Dấu tích lịch sử giữa núi rừng") ?? tryTitle("Bối cảnh lịch sử và thời gian");
      if (t) return { title: t, text };
    }
    if (/(?:du khách|hành trình|về nguồn|giáo dục truyền thống|tìm hiểu|trải nghiệm|tham quan)/i.test(text)) {
      const t = tryTitle("Hành trình tìm hiểu lịch sử") ?? tryTitle("Hành trình về nguồn và trải nghiệm");
      if (t) return { title: t, text };
    }
  }

  // Deep geology / geoheritage (specific indicators)
  if (/(?:550 triệu năm|nửa tỷ năm|hóa thạch|lịch sử địa chất|tiến hóa của vỏ trái đất)/i.test(text)) {
    const t = tryTitle(/(?:550 triệu năm|nửa tỷ năm)/i.test(text) ? "Dấu ấn địa chất hơn 550 triệu năm" : "Dấu ấn địa chất và cảnh quan đá");
    if (t) return { title: t, text };
  }

  if (/(?:cung đường|đường đèo|đèo|mã pí lèng|cổng trời|quản bạ|tu sản|dốc thẩm mã|uốn lượn)/i.test(text)) {
    const t = tryTitle(/(?:mã pí lèng|tu sản|nho quế|đèo)/i.test(text) ? "Những cung đường qua miền đá" : "Hành trình khám phá và cảnh quan");
    if (t) return { title: t, text };
  }

  if (/(?:hoa tam giác mạch|mùa hoa|kinh nghiệm|lưu ý|thời điểm nở|tháng 10)/i.test(text) || (/(?:du khách|trải nghiệm|khám phá)/i.test(text) && /(?:hành trình|đường bộ|ngắm cảnh|đi thuyền|sông nho quế)/i.test(text))) {
    const t = tryTitle(/(?:hoa tam giác mạch|mùa hoa|tháng 10|hùng vĩ)/i.test(text) ? "Trải nghiệm giữa thiên nhiên hùng vĩ" : "Trải nghiệm và thời điểm lý tưởng");
    if (t) return { title: t, text };
  }

  if (/(?:văn hóa|cộng đồng|dân tộc|h'mông|lô lô|tày|dao|nhà trình tường|hốc đá|chợ phiên|thủ công|bản làng)/i.test(text)) {
    const t = tryTitle(/(?:h'mông|lô lô|dân tộc|bản sắc|chợ phiên)/i.test(text) ? "Sắc màu văn hóa cao nguyên" : "Không gian sống và bản sắc bản làng");
    if (t) return { title: t, text };
  }

  if (isNature || !isHeritage) {
    if (/(?:địa chất|hóa thạch|karst|550 triệu năm|triệu năm|tầng đá|hang động|đá vôi)/i.test(text)) {
      const t = tryTitle(/(?:550 triệu năm|nửa tỷ năm)/i.test(text) ? "Dấu ấn địa chất hơn 550 triệu năm" : "Dấu ấn địa chất và cảnh quan đá");
      if (t) return { title: t, text };
    }
  }

  if (/(?:khám phá|trải nghiệm|kinh nghiệm|thời tiết)/i.test(text)) {
    const t = tryTitle("Trải nghiệm và thời điểm lý tưởng");
    if (t) return { title: t, text };
  }

  if (/(?:lịch sử|di tích|chiến công|kháng chiến|thời kỳ|ngàn năm|cổ kính)/i.test(text)) {
    const t = tryTitle("Dấu tích lịch sử và thời gian");
    if (t) return { title: t, text };
  }

  // Natural short leading clause from first sentence if 3-8 words and not an advisory notice
  const firstSentence = text.split(/[.!?]\s+/)[0] ?? "";
  const commaClause = firstSentence.split(/[,;]\s+/)[0]?.trim();
  if (commaClause && isShortEditorialHeading(commaClause, text)) {
    const t = tryTitle(commaClause);
    if (t) return { title: t, text };
  }

  return { title: "", text };
}

export function splitSourcedSection(
  text: string,
  category = "",
  index = 0,
  usedHeadings?: Set<string>
): { title: string; text: string; headingProvenance?: EditorialBlock["headingProvenance"] } {
  return deriveSectionHeading(text, category, index, usedHeadings);
}

export type EditorialSectionSeed = {
  title: string;
  text: string;
  headingProvenance?: EditorialBlock["headingProvenance"];
};

/**
 * Semantically groups canonical description into coherent editorial chapters,
 * respecting explicit Markdown headings, paragraph themes, and avoiding micro-fragmentation.
 */
export function groupEditorialSections(
  description: string,
  category = ""
): { introText: string; sections: EditorialSectionSeed[] } {
  const rawParts = description.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  if (!rawParts.length) return { introText: "", sections: [] };

  const isStandaloneHeading = (p: string) => {
    const trimmed = p.trim();
    if (/^#{1,6}\s+.+$/.test(trimmed)) return true;
    if (/^\*{2}[^*]{3,70}\*{2}:?$/.test(trimmed)) return true;
    if (/^_{2}[^_]{3,70}_{2}:?$/.test(trimmed)) return true;
    return false;
  };

  const hasExplicitHeadings = rawParts.some((p, i) => i > 0 && isStandaloneHeading(p));

  let introText = "";
  let startIndex = 0;
  if (!isStandaloneHeading(rawParts[0]!)) {
    introText = rawParts[0]!;
    startIndex = 1;
  }

  const sections: EditorialSectionSeed[] = [];
  const usedHeadings = new Set<string>();

  if (hasExplicitHeadings) {
    let currentTitle = "";
    let currentBodyParts: string[] = [];

    const flush = () => {
      if (currentTitle || currentBodyParts.length) {
        const body = currentBodyParts.join("\n\n").trim();
        if (body || currentTitle) {
          const cleanTitle = stripMarkdownHeading(currentTitle);
          const prov = cleanTitle && description.includes(cleanTitle)
            ? { blockId: `section-${sections.length}`, excerpt: cleanTitle }
            : undefined;
          sections.push({ title: cleanTitle, text: body, headingProvenance: prov });
        }
      }
    };

    for (let i = startIndex; i < rawParts.length; i++) {
      const part = rawParts[i]!;
      if (isStandaloneHeading(part)) {
        flush();
        currentTitle = stripMarkdownHeading(part);
        currentBodyParts = [];
      } else {
        currentBodyParts.push(part);
      }
    }
    flush();
  } else {
    for (let i = startIndex; i < rawParts.length; i++) {
      const text = rawParts[i]!;
      const derived = deriveSectionHeading(text, category, sections.length, usedHeadings);
      sections.push({
        title: derived.title,
        text: derived.text,
        headingProvenance: derived.headingProvenance ?? (derived.title && description.includes(derived.title) ? { blockId: `section-${sections.length}`, excerpt: derived.title } : undefined),
      });
    }
  }

  return { introText, sections };
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
