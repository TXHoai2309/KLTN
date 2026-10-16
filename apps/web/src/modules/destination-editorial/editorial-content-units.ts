import { groupEditorialSections, stripMarkdownHeading } from "./editorial-content";
import type { EditorialContext } from "./editorial-contract";

export type ContentAstUnitType =
  | "INTRO"
  | "CHAPTER_HEADING"
  | "PARAGRAPH"
  | "HISTORICAL_EVENT"
  | "GEOGRAPHICAL_FACT"
  | "CULTURAL_INFO"
  | "VISITOR_GUIDANCE"
  | "CITATION"
  | "IMAGE_CAPTION";

export type ContentAstUnit = {
  id: string;
  type: ContentAstUnitType;
  title?: string;
  text: string;
  provenance: {
    sourceField: "description" | "name" | "category" | "area" | "facts" | "sources" | "media";
    excerpt: string;
    originalIndex?: number;
  };
  semanticTopic?: "heritage" | "nature" | "culture" | "journey" | "visitor_guidance" | "general";
};

export type CanonicalContentAst = {
  destinationId: string;
  destinationName: string;
  category: string;
  area: string;
  units: ContentAstUnit[];
  mediaSummary: Array<{ id: string; alt: string; caption: string | null; isCover: boolean }>;
  sourcesSummary: Array<{ id: string; title: string; url: string | null }>;
};


/**
 * Normalizes canonical Destination description and metadata into an immutable
 * Content AST with stable unit IDs and verified provenance.
 */
export function buildEditorialContentUnits(context: EditorialContext): CanonicalContentAst {
  const units: ContentAstUnit[] = [];
  const { introText, sections } = groupEditorialSections(context.description, context.category);

  // 1. Introduction Lead Unit
  if (introText) {
    units.push({
      id: "ast-intro",
      type: "INTRO",
      text: introText,

      provenance: {
        sourceField: "description",
        excerpt: introText.slice(0, 100),
        originalIndex: 0,
      },
      semanticTopic: "general",
    });
  }

  // 2. Sections / Chapters / Paragraph Units
  sections.forEach((sec, sIdx) => {
    const chapterId = `ast-chapter-${sIdx}`;
    const cleanTitle = stripMarkdownHeading(sec.title);

    if (cleanTitle) {
      units.push({
        id: chapterId,
        type: "CHAPTER_HEADING",
        title: cleanTitle,
        text: cleanTitle,

        provenance: {
          sourceField: "description",
          excerpt: cleanTitle,
          originalIndex: sIdx,
        },
        semanticTopic: detectTopic(cleanTitle, sec.text),
      });
    }

    // Split section into individual paragraphs to preserve granular facts
    const paragraphs = sec.text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    paragraphs.forEach((p, pIdx) => {
      const paraId = `ast-para-${sIdx}-${pIdx}`;
      const isGuidance = /^(?:do|lưu ý|khuyến cáo|giờ mở cửa|giá vé|vé vào|thời tiết)/i.test(p);
      units.push({
        id: paraId,
        type: isGuidance ? "VISITOR_GUIDANCE" : "PARAGRAPH",
        text: p,

        provenance: {
          sourceField: "description",
          excerpt: p.slice(0, 80),
          originalIndex: pIdx,
        },
        semanticTopic: isGuidance ? "visitor_guidance" : detectTopic(cleanTitle, p),
      });
    });
  });

  // 3. Media Summary & Captions
  const mediaSummary = context.media.map(m => {
    if (m.caption) {
      units.push({
        id: `ast-caption-${m.id}`,
        type: "IMAGE_CAPTION",
        text: m.caption,

        provenance: {
          sourceField: "media",
          excerpt: m.caption.slice(0, 60),
        },
      });
    }
    return {
      id: m.id,
      alt: m.alt,
      caption: m.caption,
      isCover: m.isCover,
    };
  });

  // 4. Sources Summary
  const sourcesSummary = context.sources.map(s => {
    units.push({
      id: `ast-source-${s.id}`,
      type: "CITATION",
      title: s.title,
      text: s.url || s.title,

      provenance: {
        sourceField: "sources",
        excerpt: s.title,
      },
    });
    return {
      id: s.id,
      title: s.title,
      url: s.url,
    };
  });

  return {
    destinationId: context.id,
    destinationName: context.name,
    category: context.category,
    area: context.area,
    units,
    mediaSummary,
    sourcesSummary,
  };
}

function detectTopic(title: string, text: string): ContentAstUnit["semanticTopic"] {
  const combined = `${title} ${text}`.toLowerCase();
  if (/lịch sử|kháng chiến|tù nhân|cách mạng|di tích|chiến sĩ|thuộc địa|pháp/.test(combined)) return "heritage";
  if (/địa chất|hóa thạch|karst|550 triệu năm|đá vôi|hang động|vách đá/.test(combined)) return "nature";
  if (/bản làng|dân tộc|h'mông|dao|lô lô|văn hóa|nhà trình tường|chợ phiên/.test(combined)) return "culture";
  if (/cung đường|đèo|mã pí lèng|nho quế|tu sản|hành trình|khám phá/.test(combined)) return "journey";
  if (/giờ mở cửa|giá vé|du khách|lưu ý|khuyến cáo|tham quan/.test(combined)) return "visitor_guidance";
  return "general";
}

/** Look up an AST unit by ID */
export function getAstUnit(ast: CanonicalContentAst, id: string): ContentAstUnit | undefined {
  return ast.units.find(u => u.id === id);
}
