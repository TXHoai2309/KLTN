import { publicHttpsUrl } from "../content-profile/content-profile-contract";
import { editorialBlockSchema, editorialLayoutSchema, type EditorialLayout, type EditorialContext, type ResolvedEditorial, type EditorialBlock } from "./editorial-contract";
export function chooseFamily(category: string): EditorialLayout["family"] {
  const c = category.normalize("NFC").toLocaleLowerCase("vi");
  if (/di tích|lịch sử|kiến trúc/.test(c)) return "HERITAGE_STORY";
  if (/làng|bản làng/.test(c)) return "VILLAGE_CULTURE";
  if (/thiên nhiên|thắng cảnh/.test(c)) return "NATURE_SHOWCASE";
  return "JOURNEY_EDITORIAL";
}
export function approvedMedia(context: EditorialContext) { return context.media.filter(m => m.websiteRights === "APPROVED" && publicHttpsUrl.safeParse(m.url).success); }
function landscape(media: EditorialContext["media"][number]) {
  try {
    const r = JSON.parse(media.storageReference ?? "null");
    if (r?.provider !== "cloudinary" || !r.assetId || !r.publicId || !r.version || !media.url.startsWith(`https://res.cloudinary.com/${r.cloud}/image/upload/v${r.version}/`) || !Number.isFinite(r.width) || !Number.isFinite(r.height) || r.width < 1 || r.height < 1 || r.width * r.height > 25_000_000) return false;
    return r.width / r.height >= 1.5;
  } catch { return false; }
}
export function autoLayout(context: EditorialContext, seed?: EditorialLayout): EditorialLayout {
  const images = [...approvedMedia(context)].sort((a, b) => Number(b.isCover) - Number(a.isCover) || Number(landscape(b)) - Number(landscape(a)));
  const paragraphs = context.description.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const family = chooseFamily(context.category);
  const variant = !images.length ? "EDITORIAL" : family === "NATURE_SHOWCASE" && (landscape(images[0]!) || images.length >= 4) ? "PANORAMA"
    : family === "HERITAGE_STORY" && context.description.length > 700 ? "EDITORIAL" : family === "JOURNEY_EDITORIAL" && images.length >= 4 ? "EDITORIAL" : "SPLIT";
  const block = (id: string, type: EditorialBlock["type"], extra = {}) => editorialBlockSchema.parse({ id, type, ...extra });
  const blocks = [block("hero", "HERO", { mediaIds: images[0] ? [images[0].id] : [], title: context.name }), block("intro", "INTRO", { text: paragraphs.shift() ?? "" })];
  const remaining = images.slice(1);
  const curated = (seed?.blocks ?? []).filter(b => ["TIMELINE", "QUOTE"].includes(b.type) ||
    (["INTRO", "TEXT_SECTION", "IMAGE_TEXT_SPLIT"].includes(b.type) && b.text && !context.description.includes(b.text)));
  // Reserve capacity for every manually authored block before splitting prose.
  const capacity = Math.max(1, 22 - curated.length);
  const sections = paragraphs.slice(0, Math.min(19, capacity));
  if (paragraphs.length > sections.length) sections[sections.length - 1] = paragraphs.slice(sections.length - 1).join("\n\n");
  for (const [index, text] of sections.entries()) {
    const image = remaining.length > (images.length >= 4 ? 2 : 0) ? remaining.shift() : undefined;
    blocks.push(block(`section-${index}`, image ? "IMAGE_TEXT_SPLIT" : "TEXT_SECTION", { text, mediaIds: image ? [image.id] : [], placement: index % 2 ? "right" : "left" }));
  }
  if (remaining.length) blocks.push(block("gallery", remaining.length >= 3 ? "IMAGE_GRID" : "IMAGE_GALLERY", { mediaIds: remaining.map(m => m.id), gallery: family === "HERITAGE_STORY" ? "grid" : family === "JOURNEY_EDITORIAL" ? "strip" : "mosaic" }));
  // Retain Admin-curated supplementary prose and provenance-backed material.
  // Reuse only text/citations here: image roles are freshly allocated, never duplicated.
  for (const [index, b] of curated.entries()) blocks.push({ ...b, id: `curated-${index}`,
    type: b.type === "IMAGE_TEXT_SPLIT" || b.type === "INTRO" ? "TEXT_SECTION" : b.type, mediaIds: [] });
  if (context.category || context.area) blocks.push(block("facts", "HIGHLIGHT_FACTS"));
  if (context.suggestedDurationMinutes !== null || context.openingDays.some(d => d.status !== "UNKNOWN")) blocks.push(block("visit", "VISIT_INFORMATION"));
  if (Number.isFinite(context.latitude) && Number.isFinite(context.longitude)) blocks.push(block("map", "MAP"));
  const sources = context.sources.filter(s => s.websiteRights === "APPROVED");
  if (sources.length) blocks.push(block("sources", "SOURCES", { sourceIds: sources.map(s => s.id) }));
  // If a manually filled layout reaches the contract ceiling, keep its text and
  // provenance intact; only update the template decision instead of truncating it.
  if (blocks.length > 30 && seed) return editorialLayoutSchema.parse({ ...seed, family, variant });
  return editorialLayoutSchema.parse({ schemaVersion: 1, family, variant, blocks });
}
export function validateLayoutReferences(layout: EditorialLayout, context: EditorialContext, publishing: boolean) {
  const media = new Set(context.media.filter(m => !publishing || m.websiteRights === "APPROVED").map(m => m.id));
  const sources = new Set(context.sources.filter(s => !publishing || s.websiteRights === "APPROVED").map(s => s.id));
  for (const b of layout.blocks) {
    if (b.hidden && publishing) continue;
    if (b.mediaIds.some(id => !media.has(id)) || [...b.sourceIds, ...b.entries.flatMap(e => e.sourceIds)].some(id => !sources.has(id))) throw Error("Ảnh/nguồn không thuộc điểm đến hoặc chưa được duyệt.");
    if (publishing && b.type === "QUOTE" && b.text && !b.sourceIds.length && !context.description.includes(b.text)) throw Error("Trích dẫn cần nguồn được duyệt hoặc đoạn nguyên văn trong mô tả.");
    if (publishing && b.type === "TIMELINE" && b.entries.some(e => !e.label || !e.text || !e.sourceIds.length)) throw Error("Mốc thời gian cần nội dung và nguồn.");
  }
}
export function resolveEditorial(layout: EditorialLayout, context: EditorialContext): ResolvedEditorial | null {
  const media = approvedMedia(context);
  const sources = context.sources.filter(s => s.websiteRights === "APPROVED" && (!s.url || publicHttpsUrl.safeParse(s.url).success));
  const sourceIds = new Set(sources.map(s => s.id));
  const seen = new Set<string>();
  const blocks = layout.blocks.filter(b => !b.hidden).map(b => ({ ...b,
    mediaIds: b.mediaIds.filter(id => media.some(m => m.id === id) && !seen.has(id) && Boolean(seen.add(id))),
    sourceIds: b.sourceIds.filter(id => sourceIds.has(id)),
    entries: b.entries.filter(e => e.sourceIds.length && e.sourceIds.every(id => sourceIds.has(id))),
  })).filter(b => {
    if (["FULL_WIDTH_IMAGE", "IMAGE_GRID", "IMAGE_GALLERY"].includes(b.type)) return b.mediaIds.length > 0;
    if (["INTRO", "TEXT_SECTION", "IMAGE_TEXT_SPLIT"].includes(b.type)) return Boolean(b.text || b.mediaIds.length);
    if (b.type === "QUOTE") return Boolean(b.text && (b.sourceIds.length || context.description.includes(b.text)));
    if (b.type === "TIMELINE") return b.entries.length > 0;
    if (b.type === "SOURCES") return b.sourceIds.length > 0;
    if (b.type === "MAP") return Number.isFinite(context.latitude) && Number.isFinite(context.longitude);
    return true;
  });
  if (!blocks.length) return null;
  return { layout: { ...layout, blocks }, media: media.filter(m => seen.has(m.id)).map(({ id, url, alt, caption, author, sourceUrl }) => ({ id, url, alt, caption, author, sourceUrl })), sources: sources.map(({ id, title, url }) => ({ id, title, url })) };
}
