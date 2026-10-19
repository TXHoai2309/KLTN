import { z } from "zod";
import { referenceId, publicHttpsUrl } from "../content-profile/content-profile-contract";

export const families = ["NATURE_SHOWCASE", "HERITAGE_STORY", "VILLAGE_CULTURE", "JOURNEY_EDITORIAL"] as const;
export const variants = ["PANORAMA", "SPLIT", "EDITORIAL"] as const;
export const blockTypes = ["HERO", "INTRO", "TEXT_SECTION", "IMAGE_TEXT_SPLIT", "FULL_WIDTH_IMAGE", "IMAGE_GRID", "IMAGE_GALLERY", "HIGHLIGHT_FACTS", "TIMELINE", "QUOTE", "VISIT_INFORMATION", "MAP", "SOURCES"] as const;
export const familyLabels = { NATURE_SHOWCASE: "Thiên nhiên · Nature Showcase", HERITAGE_STORY: "Di sản · Heritage Story", VILLAGE_CULTURE: "Bản làng · Village Culture", JOURNEY_EDITORIAL: "Hành trình · Journey Editorial" };
export const variantLabels = { PANORAMA: "Toàn cảnh · Hero mở rộng", SPLIT: "Đối thoại · Chữ và ảnh song song", EDITORIAL: "Ấn phẩm · Tiêu đề dẫn chuyện" };
export const typeStyles = ["LITERARY", "MODERN", "HUMANIST"] as const;
export const colorStyles = ["FOREST", "SLATE", "EARTH"] as const;
export const rhythms = ["IMMERSIVE", "COMPACT"] as const;
export const typeStyleLabels = { LITERARY: "Tạp chí · Chữ có chân", MODERN: "Hiện đại · Chữ không chân", HUMANIST: "Gần gũi · Chữ mềm mại" };
export const colorStyleLabels = { FOREST: "Xanh rừng", SLATE: "Đá núi", EARTH: "Đất ấm" };
export const rhythmLabels = { IMMERSIVE: "Khoáng đạt", COMPACT: "Gọn gàng" };

export const editorialDesignSchema = z.object({ typography: z.enum(typeStyles), palette: z.enum(colorStyles), rhythm: z.enum(rhythms) }).strict();
export type EditorialDesign = z.infer<typeof editorialDesignSchema>;
export const defaultEditorialDesign: EditorialDesign = { typography: "LITERARY", palette: "FOREST", rhythm: "IMMERSIVE" };

const plain = (max: number) => z.string().trim().max(max).refine(v => !/<\/?[a-z][^>]*>/i.test(v), "Chỉ nhập văn bản, không dùng HTML.");

// ==========================================
// V1 CONTRACT (Backward Compatibility)
// ==========================================
export const editorialBlockSchema = z.object({
  id: referenceId, type: z.enum(blockTypes), hidden: z.boolean().default(false),
  title: plain(200).default(""), text: plain(12000).default(""), caption: plain(1000).default(""),
  deck: plain(180).optional(), emphasis: z.enum(["STANDARD", "FEATURED"]).optional(),
  headingProvenance: z.object({ blockId: referenceId, excerpt: plain(70) }).strict().optional(),
  mediaIds: z.array(referenceId).max(20).default([]), sourceIds: z.array(referenceId).max(30).default([]),
  placement: z.enum(["left", "right", "full"]).default("left"),
  gallery: z.enum(["mosaic", "grid", "strip"]).default("mosaic"),
  crop: z.enum(["wide", "portrait", "square", "original"]).default("wide"),
  focalX: z.number().min(0).max(100).default(50), focalY: z.number().min(0).max(100).default(50),
  entries: z.array(z.object({ label: plain(100), text: plain(2000), sourceIds: z.array(referenceId).min(1).max(10) }).strict()).max(20).default([]),
}).strict();
export type EditorialBlock = z.infer<typeof editorialBlockSchema>;
export type EditorialBlockV1 = EditorialBlock;

export const editorialLayoutV1Schema = z.object({
  schemaVersion: z.literal(1), family: z.enum(families), variant: z.enum(variants),
  design: editorialDesignSchema.optional(),
  hero: z.object({ composition: z.enum(variants), locked: z.boolean(), focalLocked: z.boolean().optional() }).strict().optional(),
  blocks: z.array(editorialBlockSchema).min(1).max(30)
}).strict().superRefine((layout, ctx) => {
  if (new Set(layout.blocks.map(b => b.id)).size !== layout.blocks.length) ctx.addIssue({ code: "custom", message: "Block trùng ID." });
  if (layout.blocks.filter(b => b.type === "HERO" && !b.hidden).length > 1) ctx.addIssue({ code: "custom", message: "Chỉ có một hero." });
  const photos = layout.blocks.filter(b => !b.hidden).flatMap(b => b.mediaIds);
  if (new Set(photos).size !== photos.length) ctx.addIssue({ code: "custom", message: "Mỗi ảnh chỉ xuất hiện một lần trong bố cục." });
  if (layout.blocks.some(b => b.type === "HERO" && b.mediaIds.length > 1)) ctx.addIssue({ code: "custom", message: "Hero chỉ dùng một ảnh; chọn ảnh còn lại cho các section." });
});
export type EditorialLayoutV1 = z.infer<typeof editorialLayoutV1Schema>;

// ==========================================
// V2 GENERATIVE LAYOUT DSL PRIMITIVES
// ==========================================
export const structureNodeTypes = ["PAGE", "SECTION", "GRID", "STACK", "COLUMNS", "CONTAINER"] as const;
export const contentNodeTypes = ["HEADING", "PARAGRAPH", "LEAD", "QUOTE", "FACTS", "TIMELINE"] as const;
export const mediaNodeTypes = ["IMAGE", "PANORAMA", "IMAGE_TEXT", "GALLERY", "IMAGE_MOSAIC"] as const;
export const specialNodeTypes = ["HERO", "MAP", "SOURCES", "VISIT_INFORMATION"] as const;
export const allV2NodeTypes = [...structureNodeTypes, ...contentNodeTypes, ...mediaNodeTypes, ...specialNodeTypes] as const;
export type V2NodeType = typeof allV2NodeTypes[number];

export const containerWidths = ["NARROW", "STANDARD", "WIDE", "FULL"] as const;
export const gaps = ["NONE", "SMALL", "MEDIUM", "LARGE"] as const;
export const aspectRatios = ["16:9", "4:3", "3:2", "1:1", "4:5", "3:4", "21:9", "AUTO"] as const;
export const v2Typography = ["LITERARY", "MODERN", "HUMANIST", "EDITORIAL_SERIF", "GEOMETRIC_SANS"] as const;
export const v2Palettes = ["FOREST", "SLATE", "EARTH", "MONOCHROME", "TERRACOTTA", "INDIGO"] as const;
export const v2Rhythms = ["IMMERSIVE", "COMPACT", "RELAXED", "STACCATO"] as const;

export const editorialDesignV2Schema = z.object({
  typography: z.enum(v2Typography).default("LITERARY"),
  palette: z.enum(v2Palettes).default("FOREST"),
  rhythm: z.enum(v2Rhythms).default("IMMERSIVE"),
  containerWidth: z.enum(containerWidths).default("STANDARD"),
}).strict();
export type EditorialDesignV2 = z.infer<typeof editorialDesignV2Schema>;
export type EditorialDesignTokens = EditorialDesignV2;

// Base properties for any DSL v2 node
const nodeBaseSchema = z.object({
  id: referenceId,
  type: z.enum(allV2NodeTypes),
  hidden: z.boolean().default(false),
  locked: z.boolean().default(false),
  contentRef: z.string().trim().max(100).nullable().optional(),
  title: plain(200).nullable().default("").transform(v => v ?? ""),
  text: plain(12000).nullable().default("").transform(v => v ?? ""),
  caption: plain(1000).nullable().default("").transform(v => v ?? ""),
  deck: plain(180).nullable().optional(),
  emphasis: z.enum(["STANDARD", "FEATURED", "ACCENT", "SUBTLE"]).default("STANDARD"),
  headingProvenance: z.object({ blockId: referenceId, excerpt: plain(70) }).strict().optional(),
  mediaIds: z.array(referenceId).max(12).default([]),
  sourceIds: z.array(referenceId).max(10).default([]),
  columns: z.number().int().min(1).max(4).nullable().optional(),
  columnRatio: z.enum(["EQUAL", "TEXT_WIDE", "MEDIA_WIDE"]).nullable().optional(),
  gap: z.enum(gaps).nullable().optional(),
  aspectRatio: z.enum(aspectRatios).nullable().optional(),
  crop: z.enum(["wide", "portrait", "square", "original"]).default("wide"),
  placement: z.enum(["left", "right", "full", "center"]).default("left"),
  gallery: z.enum(["mosaic", "grid", "strip", "masonry"]).default("mosaic"),
  focalX: z.number().min(0).max(100).default(50),
  focalY: z.number().min(0).max(100).default(50),
  entries: z.array(z.object({ label: plain(100), text: plain(2000), sourceIds: z.array(referenceId).min(1).max(10) }).strict()).max(20).default([]),
});

export type EditorialNodeV2 = {
  id: string;
  type: V2NodeType;
  hidden?: boolean;
  locked?: boolean;
  contentRef?: string | null;
  title?: string;
  text?: string;
  caption?: string;
  deck?: string | null;
  emphasis?: "STANDARD" | "FEATURED" | "ACCENT" | "SUBTLE";
  headingProvenance?: { blockId: string; excerpt: string };
  mediaIds?: string[];
  sourceIds?: string[];
  columns?: number | null;
  columnRatio?: "EQUAL" | "TEXT_WIDE" | "MEDIA_WIDE" | null;
  gap?: (typeof gaps)[number] | null;
  aspectRatio?: (typeof aspectRatios)[number] | null;
  crop?: "wide" | "portrait" | "square" | "original";
  placement?: "left" | "right" | "full" | "center";
  gallery?: "mosaic" | "grid" | "strip" | "masonry";
  focalX?: number;
  focalY?: number;
  entries?: Array<{ label: string; text: string; sourceIds: string[] }>;
  children?: EditorialNodeV2[];
};

export const editorialNodeV2Schema: z.ZodType<EditorialNodeV2> = nodeBaseSchema.extend({
  children: z.lazy(() => z.array(editorialNodeV2Schema).max(10)).nullable().optional().default([]).transform(v => v ?? []),
}).strict() as unknown as z.ZodType<EditorialNodeV2>;

export const editorialLayoutV2Schema = z.object({
  schemaVersion: z.literal(2),
  mode: z.literal("GENERATIVE").default("GENERATIVE"),
  family: z.enum(families).optional(),
  variant: z.enum(variants).optional(),
  design: editorialDesignV2Schema.optional(),
  hero: z.object({ composition: z.enum(variants), locked: z.boolean(), focalLocked: z.boolean().optional() }).strict().optional(),
  sections: z.array(editorialNodeV2Schema).min(1).max(25),
  contentReferences: z.record(z.string(), z.string()).optional(),
  metadata: z.object({
    model: z.string().optional(),
    generatedAt: z.string().optional(),
    qualityScore: z.number().optional(),
    repairs: z.array(z.object({ code: z.string().regex(/^[A-Z_]+$/).max(64), nodePath: z.string().regex(/^[a-zA-Z0-9_.$]+$/).max(240) }).strict()).max(200).optional(),
  }).strict().optional(),
}).strict().superRefine((layout, ctx) => {
  const ids = new Set<string>(), photos = new Set<string>();
  let total = 0, heroes = 0;
  const visit = (nodes: EditorialNodeV2[], parent: (string | number)[], depth: number, visible: boolean) => {
    nodes.forEach((node, index) => {
      const path = [...parent, index];
      const issue = (field: string, issueCode: string) => ctx.addIssue({ code: "custom", path: [...path, field], message: issueCode, params: { issueCode } });
      if (ids.has(node.id)) issue("id", "DUPLICATE_NODE_ID");
      ids.add(node.id);
      if (++total === 51) issue("id", "NODE_LIMIT");
      if (depth === 4) issue("children", "DEPTH_LIMIT");
      const shown = visible && !node.hidden;
      if (shown && node.type === "HERO" && (++heroes > 1 || depth !== 1 || index !== layout.sections.findIndex(section => !section.hidden))) issue("type", "HERO_POSITION");
      if (["HERO", "IMAGE", "PANORAMA", "IMAGE_TEXT"].includes(node.type) && (node.mediaIds?.length ?? 0) > 1) issue("mediaIds", "SINGLE_IMAGE_ROLE");
      if (shown) (node.mediaIds ?? []).forEach((id, mediaIndex) => {
        if (photos.has(id)) ctx.addIssue({ code: "custom", path: [...path, "mediaIds", mediaIndex], message: "DUPLICATE_MEDIA", params: { issueCode: "DUPLICATE_MEDIA" } });
        photos.add(id);
      });
      visit(node.children ?? [], [...path, "children"], depth + 1, shown);
    });
  };
  visit(layout.sections, ["sections"], 1, true);
});
export type EditorialLayoutV2 = z.infer<typeof editorialLayoutV2Schema>;

// ==========================================
// DUAL-VERSION DISCRIMINATED UNION
// ==========================================
export const editorialLayoutSchema = z.discriminatedUnion("schemaVersion", [
  editorialLayoutV1Schema,
  editorialLayoutV2Schema,
]);
export type EditorialLayout = z.infer<typeof editorialLayoutSchema>;

export function isV1Layout(l: EditorialLayout): l is EditorialLayoutV1 {
  return l.schemaVersion === 1;
}

export function isV2Layout(l: EditorialLayout): l is EditorialLayoutV2 {
  return l.schemaVersion === 2;
}

export const editorialProposalInputSchema = z.object({
  layout: editorialLayoutSchema.optional(),
  direction: z.enum(["KEEP", "AUTO"]).default("KEEP"),
  mode: z.enum(["PROPOSE", "ALTERNATIVE"]).default("PROPOSE"),
  expectedRevision: z.number().int().min(0).optional(),
  version: z.literal(2).default(2),
  timeoutMs: z.number().int().min(1000).max(240000).optional(),
}).strict();

export type EditorialContext = {
  id: string; name: string; description: string; category: string; area: string;
  latitude: number; longitude: number; suggestedDurationMinutes: number | null;
  openingDays: { dayOfWeek: string; status: string; intervals: { opensAt: string; closesAt: string }[] }[];
  media: { id: string; url: string; alt: string; caption: string | null; author: string | null; sourceUrl: string | null; isCover: boolean; websiteRights: string; storageReference?: string | null }[];
  sources: { id: string; title: string; url: string | null; websiteRights: string }[];
};

export const editorialActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("SAVE"), expectedRevision: z.number().int().min(0), layout: editorialLayoutSchema }).strict(),
  z.object({ action: z.literal("PUBLISH"), expectedRevision: z.number().int().min(0), reviewed: z.literal(true) }).strict(),
  z.object({ action: z.literal("RESTORE_DRAFT"), expectedRevision: z.number().int().min(0) }).strict(),
  z.object({ action: z.literal("ROLLBACK"), expectedRevision: z.number().int().min(0), reviewed: z.literal(true) }).strict(),
]);

export const resolvedMediaSchema = z.object({ id: referenceId, url: publicHttpsUrl, alt: z.string(), caption: z.string().nullable(), author: z.string().nullable(), sourceUrl: publicHttpsUrl.nullable(), width: z.number().int().positive().max(25000000).optional(), height: z.number().int().positive().max(25000000).optional() }).strict();
export const resolvedEditorialSchema = z.object({ layout: editorialLayoutSchema, media: z.array(resolvedMediaSchema), sources: z.array(z.object({ id: referenceId, title: z.string(), url: publicHttpsUrl.nullable() }).strict()) }).strict();
export type ResolvedEditorial = z.infer<typeof resolvedEditorialSchema>;

export const editorialContextSchema = z.object({
  id: referenceId, name: z.string(), description: z.string(), category: z.string(), area: z.string(), latitude: z.number(), longitude: z.number(), suggestedDurationMinutes: z.number().nullable(),
  openingDays: z.array(z.object({ dayOfWeek: z.string(), status: z.string(), intervals: z.array(z.object({ opensAt: z.string(), closesAt: z.string() })) })),
  media: z.array(resolvedMediaSchema.extend({ isCover: z.boolean(), websiteRights: z.string(), storageReference: z.string().nullable().optional() })),
  sources: z.array(z.object({ id: referenceId, title: z.string(), url: z.string().nullable(), websiteRights: z.string() })),
});

export const editorialStateSchema = z.object({
  available: z.boolean(), reason: z.string().nullable(), context: editorialContextSchema,
  draft: editorialLayoutSchema.nullable(), published: editorialLayoutSchema.nullable(), previousPublished: editorialLayoutSchema.nullable(),
  draftRevision: z.number().int(), publishedRevision: z.number().int(), updatedAt: z.string().nullable(), publishedAt: z.string().nullable(), contentChanged: z.boolean(), aiConfigured: z.boolean(),
}).strict();
export type EditorialState = z.infer<typeof editorialStateSchema>;
