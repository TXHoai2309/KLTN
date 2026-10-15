import { publicHttpsUrl } from "../content-profile/content-profile-contract";
import { isDestinationMediaUsable } from "../destination/destination-media-eligibility";
import { editorialBlockSchema, editorialLayoutSchema, type EditorialLayout, type EditorialContext, type ResolvedEditorial, type EditorialBlock } from "./editorial-contract";
import { groupEditorialSections, prepareEditorialContent, splitSourcedSection, stripMarkdownHeading } from "./editorial-content";
import { editorialImageDimensions } from "./editorial-image-quality";
import { heroFocalLocked } from "./editorial-hero";
import { editorialValue, editorialVisitData, hasEditorialCoordinates, hasEditorialFacts } from "./editorial-display-policy";
export function chooseFamily(category: string): EditorialLayout["family"] {
  const c = category.normalize("NFC").toLocaleLowerCase("vi");
  if (/di tích|lịch sử|kiến trúc/.test(c)) return "HERITAGE_STORY";
  if (/làng|bản làng/.test(c)) return "VILLAGE_CULTURE";
  if (/thiên nhiên|thắng cảnh|công viên địa chất/.test(c)) return "NATURE_SHOWCASE";
  return "JOURNEY_EDITORIAL";
}
export function usableEditorialMedia(context: EditorialContext) { return context.media.filter(m => isDestinationMediaUsable(m, context.id)); }
export function isEligibleEditorialSource(s: EditorialContext["sources"][number]) {
  return Boolean(
    editorialValue(s.title) &&
    s.websiteRights !== "REJECTED" &&
    (!s.url || publicHttpsUrl.safeParse(s.url).success)
  );
}

function landscape(media: EditorialContext["media"][number]) {
  const d = editorialImageDimensions(media);
  return Boolean(d.width && d.height && d.width / d.height >= 1.5);
}
export function autoLayout(context: EditorialContext, seed?: EditorialLayout): EditorialLayout {
  const images = [...usableEditorialMedia(context)].sort((a, b) => Number(b.isCover) - Number(a.isCover) || Number(landscape(b)) - Number(landscape(a)));
  const keepHeroImage = seed && heroFocalLocked(seed);
  if (keepHeroImage) {
    const previous = seed.blocks.find(b => b.type === "HERO" && !b.hidden)?.mediaIds[0];
    const at = images.findIndex(m => m.id === previous);
    if (at > 0) images.unshift(...images.splice(at, 1));
  }
  const first = images[0] && editorialImageDimensions(images[0]);
  if (!keepHeroImage && first?.width && first.width < 1000) {
    const better = images.findIndex(m => (editorialImageDimensions(m).width ?? 0) >= 1200 && landscape(m));
    if (better > 0) images.unshift(...images.splice(better, 1));
  }
  const { introText, sections: parsedSections } = groupEditorialSections(context.description, context.category);
  const family = chooseFamily(context.category);
  const variant = !images.length ? "EDITORIAL" : family === "NATURE_SHOWCASE" && (landscape(images[0]!) || images.length >= 4) ? "PANORAMA"
    : family === "HERITAGE_STORY" && context.description.length > 700 ? "EDITORIAL" : family === "JOURNEY_EDITORIAL" && images.length >= 4 ? "EDITORIAL" : "SPLIT";
  const block = (id: string, type: EditorialBlock["type"], extra = {}) => editorialBlockSchema.parse({ id, type, ...extra });
  const blocks = [block("hero", "HERO", { mediaIds: images[0] ? [images[0].id] : [], title: context.name }), block("intro", "INTRO", { text: introText })];
  const remaining = images.slice(1);
  const galleryCount = images.length >= 5 ? Math.min(remaining.length - 1, 5) : 0;
  const storyImages = remaining.splice(0, remaining.length - galleryCount);
  const curated = (seed?.blocks ?? []).filter(b => b.hidden || !/^(?:hero|intro|section-\d+|image-break-\d+|gallery|facts|visit|map|sources)$/.test(b.id) || ["TIMELINE", "QUOTE"].includes(b.type) ||
    (["INTRO", "TEXT_SECTION", "IMAGE_TEXT_SPLIT"].includes(b.type) && b.text && !context.description.includes(b.text)));
  // Reserve capacity for every manually authored block before splitting prose.
  const capacity = Math.max(1, 22 - curated.length);
  const sections = parsedSections.slice(0, Math.min(19, capacity));
  if (parsedSections.length > sections.length) {
    const overflow = parsedSections.slice(sections.length - 1);
    sections[sections.length - 1] = {
      ...sections[sections.length - 1]!,
      text: overflow.map(s => s.text).filter(Boolean).join("\n\n"),
    };
  }
  for (const [index, sec] of sections.entries()) {
    const image = storyImages.shift();
    const bleed = image && index % 2 === 1 && landscape(image) && (editorialImageDimensions(image).width ?? 0) >= 1200;
    const provenance = sec.headingProvenance ?? (sec.title && (sec.text.includes(sec.title) || context.description.includes(sec.title)) ? { blockId: `section-${index}`, excerpt: sec.title } : undefined);
    blocks.push(block(`section-${index}`, image && !bleed ? "IMAGE_TEXT_SPLIT" : "TEXT_SECTION", {
      title: sec.title,
      text: sec.text,
      ...(provenance ? { headingProvenance: provenance } : {}),
      mediaIds: image && !bleed ? [image.id] : [],
      placement: index % 2 ? "right" : "left",
      crop: image && !landscape(image) ? "portrait" : "wide"
    }));
    if (bleed) blocks.push(block(`image-break-${index}`, "FULL_WIDTH_IMAGE", { mediaIds: [image.id], crop: "wide" }));
  }
  remaining.unshift(...storyImages);
  if (remaining.length) blocks.push(block("gallery", remaining.length >= 3 ? "IMAGE_GRID" : "IMAGE_GALLERY", { mediaIds: remaining.map(m => m.id), gallery: family === "HERITAGE_STORY" ? "grid" : family === "JOURNEY_EDITORIAL" ? "strip" : "mosaic" }));
  if (hasEditorialFacts(context)) blocks.push(block("facts", "HIGHLIGHT_FACTS"));
  if (editorialVisitData(context).area || editorialVisitData(context).duration || editorialVisitData(context).hours.length) blocks.push(block("visit", "VISIT_INFORMATION"));
  if (hasEditorialCoordinates(context)) blocks.push(block("map", "MAP"));
  const sources = context.sources.filter(isEligibleEditorialSource);
  if (sources.length) blocks.push(block("sources", "SOURCES", { sourceIds: sources.map(s => s.id) }));
  // Retain Admin-curated supplementary prose and provenance-backed material.
  // Reuse only text/citations here: image roles are freshly allocated, never duplicated.
  for (const b of curated) {
    let sameId = blocks.findIndex(existing => existing.id === b.id);
    if (sameId < 0 && ["HERO", "HIGHLIGHT_FACTS", "VISIT_INFORMATION", "MAP", "SOURCES"].includes(b.type)) {
      sameId = blocks.findIndex(existing => existing.type === b.type && ["hero", "facts", "visit", "map", "sources"].includes(existing.id));
    }
    const retained = { ...b, type: b.type === "IMAGE_TEXT_SPLIT" || (b.type === "INTRO" && b.id !== "intro") ? "TEXT_SECTION" as const : b.type,
      mediaIds: b.type === "HERO" && !b.hidden && sameId >= 0 ? blocks[sameId]!.mediaIds : [] };
    if (sameId >= 0) blocks[sameId] = retained;
    else if (["INTRO", "TEXT_SECTION", "IMAGE_TEXT_SPLIT", "QUOTE", "TIMELINE"].includes(retained.type)) {
      const practical = blocks.findIndex(existing => ["HIGHLIGHT_FACTS", "VISIT_INFORMATION", "MAP", "SOURCES"].includes(existing.type));
      blocks.splice(practical < 0 ? blocks.length : practical, 0, retained);
    } else blocks.push(retained);
  }
  // If a manually filled layout reaches the contract ceiling, keep its text and
  // provenance and chosen presentation intact instead of truncating the layout.
  if (blocks.length > 30 && seed) return editorialLayoutSchema.parse(seed);
  if (seed) {
    const original = seed.blocks.find(b => b.type === "HERO");
    const generated = blocks.find(b => b.type === "HERO");
    if (original && generated) {
      generated.crop = original.crop; generated.focalX = original.focalX; generated.focalY = original.focalY;
    }
  }
  return editorialLayoutSchema.parse({ schemaVersion: 1, family: seed?.family ?? family, variant: seed?.variant ?? variant, ...(seed?.design ? { design: seed.design } : {}), ...(seed?.hero ? { hero: seed.hero } : {}), blocks });
}
export function validateLayoutReferences(layout: EditorialLayout, context: EditorialContext, publishing: boolean) {
  const media = new Set(context.media.filter(m => !publishing || isDestinationMediaUsable(m, context.id)).map(m => m.id));
  const sources = new Set(context.sources.filter(s => !publishing || s.websiteRights !== "REJECTED").map(s => s.id));
  for (const b of layout.blocks) {
    if (b.headingProvenance && (b.headingProvenance.blockId !== b.id || b.headingProvenance.excerpt !== b.title || (!b.text.includes(b.title) && !context.description.includes(b.title)))) throw Error("Heading không còn khớp trích đoạn nguồn.");
    if (b.hidden && publishing) continue;
    if (b.mediaIds.some(id => !media.has(id)) || [...b.sourceIds, ...b.entries.flatMap(e => e.sourceIds)].some(id => !sources.has(id))) throw Error("Ảnh hoặc nguồn không thuộc điểm đến hoặc không còn khả dụng.");
    if (publishing && b.type === "QUOTE" && b.text && !b.sourceIds.length && !context.description.includes(b.text)) throw Error("Trích dẫn cần nguồn được duyệt hoặc đoạn nguyên văn trong mô tả.");
    if (publishing && b.type === "TIMELINE" && b.entries.some(e => !e.label || !e.text || !e.sourceIds.length)) throw Error("Mốc thời gian cần nội dung và nguồn.");
  }
}
export type EditorialDisplayIssue = { blockId: string; reason: "ADMIN_HIDDEN" | "EMPTY_CONTENT" | "DUPLICATE_BLOCK" };
export function resolveEditorialDisplay(layout: EditorialLayout, context: EditorialContext) {
  const issues: EditorialDisplayIssue[] = layout.blocks.filter(b => b.hidden).map(b => ({ blockId: b.id, reason: "ADMIN_HIDDEN" }));
  layout = prepareEditorialContent(layout, context.description).layout;
  const media = usableEditorialMedia(context);
  const sources = context.sources.filter(isEligibleEditorialSource);
  const sourceIds = new Set(sources.map(s => s.id));
  const seen = new Set<string>();
  const seenSourceIds = new Set<string>();
  const singletons = new Set<string>();
  const factsShown = layout.blocks.some(b => b.type === "HIGHLIGHT_FACTS" && !b.hidden) && hasEditorialFacts(context);
  const seenDisplayTitles = new Set<string>();
  const blocks = layout.blocks.filter(b => !b.hidden).map((b, bIdx) => {
    const rawSourceIds = b.type === "SOURCES" && !b.sourceIds.length ? sources.map(s => s.id) : b.sourceIds;
    let title = stripMarkdownHeading(editorialValue(b.title));
    if (title && seenDisplayTitles.has(title.toLowerCase())) {
      title = "";
    }
    if (!title && ["TEXT_SECTION", "IMAGE_TEXT_SPLIT"].includes(b.type) && b.text) {
      const derived = splitSourcedSection(b.text, context.category, bIdx, seenDisplayTitles);
      if (derived.title && !seenDisplayTitles.has(derived.title.toLowerCase())) {
        title = derived.title;
      }
    }
    if (title) {
      seenDisplayTitles.add(title.toLowerCase());
    }
    return {
      ...b,
      title,
      text: editorialValue(b.text),
      deck: editorialValue(b.deck),
      mediaIds: b.mediaIds.filter(id => media.some(m => m.id === id) && !seen.has(id) && Boolean(seen.add(id))),
      sourceIds: [...new Set(rawSourceIds)].filter(id => sourceIds.has(id) && (b.type !== "SOURCES" || (!seenSourceIds.has(id) && Boolean(seenSourceIds.add(id))))),
      entries: b.entries.filter(e => editorialValue(e.label) && editorialValue(e.text) && e.sourceIds.length && e.sourceIds.every(id => sourceIds.has(id))),
    };
  }).filter(b => {
    let useful = true;
    if (["FULL_WIDTH_IMAGE", "IMAGE_GRID", "IMAGE_GALLERY"].includes(b.type)) useful = b.mediaIds.length > 0;
    if (["INTRO", "TEXT_SECTION", "IMAGE_TEXT_SPLIT"].includes(b.type)) useful = Boolean(b.title || b.text || b.mediaIds.length);
    if (b.type === "QUOTE") useful = Boolean(b.text && (b.sourceIds.length || context.description.includes(b.text)));
    if (b.type === "TIMELINE") useful = b.entries.length > 0;
    if (b.type === "SOURCES") useful = b.sourceIds.length > 0;
    if (b.type === "MAP") useful = hasEditorialCoordinates(context);
    if (b.type === "HIGHLIGHT_FACTS") useful = hasEditorialFacts(context);
    if (b.type === "VISIT_INFORMATION") { const v = editorialVisitData(context); useful = Boolean((!factsShown && v.area) || v.duration || v.hours.length); }
    if (!useful) { issues.push({ blockId: b.id, reason: "EMPTY_CONTENT" }); return false; }
    // These types render the same canonical fields; repeated blocks add no data.
    if (["INTRO", "HIGHLIGHT_FACTS", "MAP", "VISIT_INFORMATION", "SOURCES"].includes(b.type)) {
      if (singletons.has(b.type)) { issues.push({ blockId: b.id, reason: "DUPLICATE_BLOCK" }); return false; }
      singletons.add(b.type);
    }
    return true;
  });
  if (!blocks.some(b => b.type === "SOURCES") && sources.length > 0) {
    blocks.push({
      id: "sources",
      type: "SOURCES",
      hidden: false,
      title: "",
      text: "",
      caption: "",
      deck: "",
      mediaIds: [],
      sourceIds: sources.map(s => s.id),
      placement: "left",
      gallery: "mosaic",
      crop: "wide",
      focalX: 50,
      focalY: 50,
      entries: [],
    });
  }
  const editorial: ResolvedEditorial | null = !blocks.length ? null : { layout: { ...layout, blocks }, media: media.filter(m => seen.has(m.id)).map(m => ({ id: m.id, url: m.url, alt: m.alt, caption: m.caption, author: m.author, sourceUrl: m.sourceUrl, ...editorialImageDimensions(m) })), sources: sources.map(({ id, title, url }) => ({ id, title, url })) };
  return { editorial, issues };
}
export function resolveEditorial(layout: EditorialLayout, context: EditorialContext): ResolvedEditorial | null {
  return resolveEditorialDisplay(layout, context).editorial;
}
