import { z } from "zod";
import { referenceId, publicHttpsUrl } from "../content-profile/content-profile-contract";
export const families = ["NATURE_SHOWCASE", "HERITAGE_STORY", "VILLAGE_CULTURE", "JOURNEY_EDITORIAL"] as const;
export const variants = ["PANORAMA", "SPLIT", "EDITORIAL"] as const;
export const blockTypes = ["HERO", "INTRO", "TEXT_SECTION", "IMAGE_TEXT_SPLIT", "FULL_WIDTH_IMAGE", "IMAGE_GRID", "IMAGE_GALLERY", "HIGHLIGHT_FACTS", "TIMELINE", "QUOTE", "VISIT_INFORMATION", "MAP", "SOURCES"] as const;
export const familyLabels = { NATURE_SHOWCASE: "Thiên nhiên · Nature Showcase", HERITAGE_STORY: "Di sản · Heritage Story", VILLAGE_CULTURE: "Bản làng · Village Culture", JOURNEY_EDITORIAL: "Hành trình · Journey Editorial" };
export const variantLabels = { PANORAMA: "Toàn cảnh · Hero mở rộng", SPLIT: "Đối thoại · Chữ và ảnh song song", EDITORIAL: "Ấn phẩm · Tiêu đề dẫn chuyện" };
const plain = (max: number) => z.string().trim().max(max).refine(v => !/<\/?[a-z][^>]*>/i.test(v), "Chỉ nhập văn bản, không dùng HTML.");
export const editorialBlockSchema = z.object({
  id: referenceId, type: z.enum(blockTypes), hidden: z.boolean().default(false),
  title: plain(200).default(""), text: plain(12000).default(""), caption: plain(1000).default(""),
  mediaIds: z.array(referenceId).max(20).default([]), sourceIds: z.array(referenceId).max(30).default([]),
  placement: z.enum(["left", "right", "full"]).default("left"),
  gallery: z.enum(["mosaic", "grid", "strip"]).default("mosaic"),
  crop: z.enum(["wide", "portrait", "square", "original"]).default("wide"),
  focalX: z.number().min(0).max(100).default(50), focalY: z.number().min(0).max(100).default(50),
  entries: z.array(z.object({ label: plain(100), text: plain(2000), sourceIds: z.array(referenceId).min(1).max(10) }).strict()).max(20).default([]),
}).strict();
export const editorialLayoutSchema = z.object({ schemaVersion: z.literal(1), family: z.enum(families), variant: z.enum(variants), blocks: z.array(editorialBlockSchema).min(1).max(30) }).strict().superRefine((layout, ctx) => {
  if (new Set(layout.blocks.map(b => b.id)).size !== layout.blocks.length) ctx.addIssue({ code: "custom", message: "Block trùng ID." });
  if (layout.blocks.filter(b => b.type === "HERO" && !b.hidden).length > 1) ctx.addIssue({ code: "custom", message: "Chỉ có một hero." });
  const photos = layout.blocks.filter(b => !b.hidden).flatMap(b => b.mediaIds);
  if (new Set(photos).size !== photos.length) ctx.addIssue({ code: "custom", message: "Mỗi ảnh chỉ xuất hiện một lần trong bố cục." });
  if (layout.blocks.some(b => b.type === "HERO" && b.mediaIds.length > 1)) ctx.addIssue({ code: "custom", message: "Hero chỉ dùng một ảnh; chọn ảnh còn lại cho các section." });
});
export type EditorialLayout = z.infer<typeof editorialLayoutSchema>;
export type EditorialBlock = z.infer<typeof editorialBlockSchema>;
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
export const resolvedMediaSchema = z.object({ id: referenceId, url: publicHttpsUrl, alt: z.string(), caption: z.string().nullable(), author: z.string().nullable(), sourceUrl: publicHttpsUrl.nullable() }).strict();
export const resolvedEditorialSchema = z.object({ layout: editorialLayoutSchema, media: z.array(resolvedMediaSchema), sources: z.array(z.object({ id: referenceId, title: z.string(), url: publicHttpsUrl.nullable() }).strict()) }).strict();
export type ResolvedEditorial = z.infer<typeof resolvedEditorialSchema>;
export const editorialContextSchema = z.object({
  id: referenceId, name: z.string(), description: z.string(), category: z.string(), area: z.string(), latitude: z.number(), longitude: z.number(), suggestedDurationMinutes: z.number().nullable(),
  openingDays: z.array(z.object({ dayOfWeek: z.string(), status: z.string(), intervals: z.array(z.object({ opensAt: z.string(), closesAt: z.string() })) })),
  media: z.array(resolvedMediaSchema.extend({ isCover: z.boolean(), websiteRights: z.string(), storageReference: z.string().nullable().optional() })),
  sources: z.array(z.object({ id: referenceId, title: z.string(), url: z.string().nullable(), websiteRights: z.string() })),
});
export const editorialStateSchema = z.object({ available: z.boolean(), reason: z.string().nullable(), context: editorialContextSchema,
  draft: editorialLayoutSchema.nullable(), published: editorialLayoutSchema.nullable(), previousPublished: editorialLayoutSchema.nullable(),
  draftRevision: z.number().int(), publishedRevision: z.number().int(), updatedAt: z.string().nullable(), publishedAt: z.string().nullable(), contentChanged: z.boolean(), aiConfigured: z.boolean(),
}).strict();
export type EditorialState = z.infer<typeof editorialStateSchema>;
