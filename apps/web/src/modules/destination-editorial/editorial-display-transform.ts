import { cleanPlaceDisplayName } from "@/lib/traveler-display-clean";
import { editorialParagraphs, normalizeEditorialText, stripMarkdownHeading } from "./editorial-content";
import type { EditorialBlock, EditorialNodeV2 } from "./editorial-contract";

export type EditorialTocItem = {
  id: string;
  title: string;
};

export type EditorialHeadingPresentation = {
  kind: "h2" | "lead";
  text: string;
  anchorId?: string;
};

const CLAUSE_OR_SENTENCE_START =
  /^(?:ngoài|khi\s+tham\s+quan|về\s+mặt|theo\s+|tại\s+đây|du\s+khách|hành\s+trình\s+này|năm\s+\d{4}|ngày\s+\d)/iu;

const SENTENCE_PREDICATE =
  /\b(?:nổi\s+bật\s+với|là\s+khu\s+vực|là\s+nơi|là\s+một\s+trong|nằm\s+cách|tọa\s+lạc|có\s+thể\s+tham\s+quan|mở\s+cửa\s+cả\s+ngày)\b/iu;

const SAFE_ABBREVIATION_END = /\b(?:TP|TX|TT|TNHH|UNESCO)\.$/u;

/**
 * Classifies whether an editorial subheading is sentence-like (over ~60 chars, sentence punctuation,
 * or full clause/predicate) so the public reader renders it as a bold lead paragraph instead of <h2>.
 */
export function isSentenceLikeEditorialHeading(rawTitle: string): boolean {
  const title = stripMarkdownHeading(rawTitle).trim();
  if (!title) return false;
  if (title.length > 60) return true;
  if (/[?!]$/u.test(title)) return true;
  if (/\.(?:\s|$)/u.test(title) && !SAFE_ABBREVIATION_END.test(title)) return true;
  if (/,\s+/u.test(title) && title.length > 40) return true;
  if (CLAUSE_OR_SENTENCE_START.test(title)) return true;
  if (SENTENCE_PREDICATE.test(title)) return true;
  return false;
}

export function buildEditorialAnchorId(title: string, index: number): string {
  const slug = normalizeEditorialText(title)
    .replace(/\s+/gu, "-")
    .replace(/[^a-z0-9-]/gu, "")
    .slice(0, 48)
    .replace(/^-+|-+$/gu, "");
  return `sec-${index + 1}${slug ? `-${slug}` : ""}`;
}

function dedupeParagraphs(
  text: string,
  seenParagraphs: Set<string>,
): { text: string; hadText: boolean; keptCount: number } {
  const paragraphs = editorialParagraphs(text);
  if (paragraphs.length === 0) return { text: "", hadText: false, keptCount: 0 };
  const kept: string[] = [];
  for (const p of paragraphs) {
    const cleanP = cleanPlaceDisplayName(p) || p;
    const norm = normalizeEditorialText(cleanP);
    if (!norm || seenParagraphs.has(norm)) continue;
    seenParagraphs.add(norm);
    kept.push(cleanP);
  }
  return { text: kept.join("\n\n"), hadText: true, keptCount: kept.length };
}

/**
 * Display-only projection for V1 editorial layouts (P3):
 * deduplicates repeated sections/paragraphs/headings and turns sentence-like headings into bold leads
 * without altering stored database records or admin editing flows.
 */
export function projectPublicEditorialV1(blocks: readonly EditorialBlock[]): {
  blocks: EditorialBlock[];
  headings: Map<string, EditorialHeadingPresentation>;
  toc: EditorialTocItem[];
} {
  const seenHeadings = new Set<string>();
  const seenParagraphs = new Set<string>();
  const headings = new Map<string, EditorialHeadingPresentation>();
  const toc: EditorialTocItem[] = [];
  const projected: EditorialBlock[] = [];

  for (const block of blocks) {
    if (block.hidden) continue;
    if (block.type === "HERO" || block.type === "HIGHLIGHT_FACTS" || block.type === "VISIT_INFORMATION" || block.type === "MAP" || block.type === "SOURCES") {
      if (block.type === "HERO" && block.text.trim()) {
        for (const p of editorialParagraphs(block.text)) {
          const norm = normalizeEditorialText(p);
          if (norm) seenParagraphs.add(norm);
        }
      }
      projected.push(block);
      continue;
    }

    const bodyCheck = dedupeParagraphs(block.text, seenParagraphs);
    const hasMedia = block.mediaIds.length > 0 || block.entries.length > 0;
    if (bodyCheck.hadText && bodyCheck.keptCount === 0 && !hasMedia) {
      continue;
    }

    const cleanedTitle = cleanPlaceDisplayName(stripMarkdownHeading(block.title));
    const normHeading = normalizeEditorialText(cleanedTitle);
    let nextTitle = cleanedTitle;

    if (cleanedTitle) {
      if (seenHeadings.has(normHeading)) {
        if (!hasMedia && bodyCheck.keptCount === 0) continue;
        nextTitle = "";
      } else if (isSentenceLikeEditorialHeading(cleanedTitle)) {
        headings.set(block.id, { kind: "lead", text: cleanedTitle });
        nextTitle = "";
      } else {
        seenHeadings.add(normHeading);
        const anchorId = buildEditorialAnchorId(cleanedTitle, toc.length);
        headings.set(block.id, { kind: "h2", text: cleanedTitle, anchorId });
        toc.push({ id: anchorId, title: cleanedTitle });
      }
    }

    projected.push({
      ...block,
      title: nextTitle,
      text: bodyCheck.hadText ? bodyCheck.text : block.text,
    });
  }

  return { blocks: projected, headings, toc };
}

/**
 * Display-only projection for V2 generative editorial trees (P3):
 * deduplicates repeated sections/paragraphs/headings and turns sentence-like H2s into bold leads.
 */
export function projectPublicEditorialV2(sections: readonly EditorialNodeV2[]): {
  sections: EditorialNodeV2[];
  headings: Map<string, EditorialHeadingPresentation>;
  toc: EditorialTocItem[];
} {
  const seenHeadings = new Set<string>();
  const seenParagraphs = new Set<string>();
  const headings = new Map<string, EditorialHeadingPresentation>();
  const toc: EditorialTocItem[] = [];

  const transformNode = (node: EditorialNodeV2): EditorialNodeV2 | null => {
    if (node.hidden) return null;
    if (node.type === "HERO") {
      if (node.text?.trim()) {
        for (const p of editorialParagraphs(node.text)) {
          const norm = normalizeEditorialText(p);
          if (norm) seenParagraphs.add(norm);
        }
      }
      return node;
    }
    if (node.type === "FACTS" || node.type === "VISIT_INFORMATION" || node.type === "MAP" || node.type === "SOURCES") {
      return node;
    }

    const rawTitle = node.type === "HEADING"
      ? cleanPlaceDisplayName(stripMarkdownHeading(node.title || node.text || ""))
      : cleanPlaceDisplayName(stripMarkdownHeading(node.title ?? ""));
    const rawBody = node.type === "HEADING" ? "" : (node.text ?? "");
    const bodyCheck = dedupeParagraphs(rawBody, seenParagraphs);

    const nextChildren: EditorialNodeV2[] = [];
    for (const child of node.children ?? []) {
      const transformed = transformNode(child);
      if (transformed) nextChildren.push(transformed);
    }

    const hasMediaOrStructured = Boolean(node.mediaIds?.length || node.entries?.length || nextChildren.length > 0);
    if (node.type !== "HEADING" && node.type !== "QUOTE" && bodyCheck.hadText && bodyCheck.keptCount === 0 && !hasMediaOrStructured) {
      return null;
    }

    const normHeading = normalizeEditorialText(rawTitle);
    let nextTitle = rawTitle;

    if (rawTitle) {
      if (node.type === "TIMELINE") {
        const anchorId = buildEditorialAnchorId(rawTitle, toc.length);
        if (!seenHeadings.has(normHeading)) {
          seenHeadings.add(normHeading);
          headings.set(node.id, { kind: "h2", text: rawTitle, anchorId });
          toc.push({ id: anchorId, title: rawTitle });
        }
      } else if (seenHeadings.has(normHeading)) {
        if (node.type === "HEADING") return null;
        if (!hasMediaOrStructured && bodyCheck.keptCount === 0) return null;
        nextTitle = "";
      } else if (isSentenceLikeEditorialHeading(rawTitle)) {
        headings.set(node.id, { kind: "lead", text: rawTitle });
        if (node.type === "HEADING") {
          return { ...node, type: "PARAGRAPH", title: "", text: rawTitle };
        }
        nextTitle = "";
      } else {
        seenHeadings.add(normHeading);
        const anchorId = buildEditorialAnchorId(rawTitle, toc.length);
        headings.set(node.id, { kind: "h2", text: rawTitle, anchorId });
        toc.push({ id: anchorId, title: rawTitle });
      }
    }

    return {
      ...node,
      ...(node.title !== undefined ? { title: nextTitle } : {}),
      ...(node.text !== undefined && node.type !== "HEADING"
        ? { text: bodyCheck.hadText ? bodyCheck.text : node.text }
        : {}),
      ...(node.children ? { children: nextChildren } : {}),
    };
  };

  const nextSections: EditorialNodeV2[] = [];
  for (const sec of sections) {
    const transformed = transformNode(sec);
    if (transformed) nextSections.push(transformed);
  }

  return { sections: nextSections, headings, toc };
}
