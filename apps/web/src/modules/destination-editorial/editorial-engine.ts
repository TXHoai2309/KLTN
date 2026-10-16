import { publicHttpsUrl } from "../content-profile/content-profile-contract";
import { isDestinationMediaUsable } from "../destination/destination-media-eligibility";
import {
  editorialBlockSchema,
  editorialLayoutSchema,
  editorialLayoutV1Schema,
  editorialLayoutV2Schema,
  isV1Layout,
  isV2Layout,
  type EditorialLayout,
  type EditorialLayoutV1,
  type EditorialLayoutV2,
  type EditorialNodeV2,
  type EditorialContext,
  type ResolvedEditorial,
  type EditorialBlock,
} from "./editorial-contract";
import { groupEditorialSections, prepareEditorialContent, splitSourcedSection, stripMarkdownHeading } from "./editorial-content";
import { editorialImageDimensions } from "./editorial-image-quality";
import { heroFocalLocked } from "./editorial-hero";
import { editorialValue, editorialVisitData, hasEditorialCoordinates, hasEditorialFacts } from "./editorial-display-policy";
import { compileEditorialLayout } from "./editorial-compiler";
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
export function autoLayoutV1(context: EditorialContext, seed?: EditorialLayoutV1): EditorialLayoutV1 {
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
  if (blocks.length > 30 && seed) return editorialLayoutV1Schema.parse(seed);
  if (seed) {
    const original = seed.blocks.find(b => b.type === "HERO");
    const generated = blocks.find(b => b.type === "HERO");
    if (original && generated) {
      generated.crop = original.crop; generated.focalX = original.focalX; generated.focalY = original.focalY;
    }
  }
  return editorialLayoutV1Schema.parse({ schemaVersion: 1, family: seed?.family ?? family, variant: seed?.variant ?? variant, ...(seed?.design ? { design: seed.design } : {}), ...(seed?.hero ? { hero: seed.hero } : {}), blocks });
}

export function autoLayoutV2(context: EditorialContext, seed?: EditorialLayoutV2): EditorialLayoutV2 {
  const images = [...usableEditorialMedia(context)].sort((a, b) => Number(b.isCover) - Number(a.isCover) || Number(landscape(b)) - Number(landscape(a)));
  const { introText, sections: parsedSections } = groupEditorialSections(context.description, context.category);
  const family = chooseFamily(context.category);
  const variant = !images.length ? "EDITORIAL" : family === "NATURE_SHOWCASE" && (landscape(images[0]!) || images.length >= 4) ? "PANORAMA"
    : family === "HERITAGE_STORY" && context.description.length > 700 ? "EDITORIAL" : family === "JOURNEY_EDITORIAL" && images.length >= 4 ? "EDITORIAL" : "SPLIT";

  const heroImage = images[0];
  const remaining = images.slice(1);
  const storyImage = remaining.shift();

  const sections: EditorialNodeV2[] = [
    {
      id: "hero",
      type: "HERO",
      hidden: false,
      locked: false,
      title: context.name,
      text: "",
      caption: "",
      emphasis: "STANDARD",
      mediaIds: heroImage ? [heroImage.id] : [],
      sourceIds: [],
      crop: "wide",
      placement: "full",
      gallery: "mosaic",
      focalX: 50,
      focalY: 50,
      entries: [],
      children: [],
    },
    {
      id: "intro",
      type: "LEAD",
      hidden: false,
      locked: false,
      contentRef: "ast-intro",
      title: "",
      text: introText,
      caption: "",
      emphasis: "STANDARD",
      mediaIds: [],
      sourceIds: [],
      crop: "wide",
      placement: "left",
      gallery: "mosaic",
      focalX: 50,
      focalY: 50,
      entries: [],
      children: [],
    },
  ];

  for (const [index, sec] of parsedSections.entries()) {
    const isFirstWithImage = index === 0 && storyImage;
    const cleanTitle = stripMarkdownHeading(sec.title);
    const provenance = cleanTitle && context.description.includes(cleanTitle)
      ? { blockId: `section-${index}`, excerpt: cleanTitle }
      : undefined;

    if (isFirstWithImage) {
      sections.push({
        id: `section-${index}`,
        type: "IMAGE_TEXT",
        hidden: false,
        locked: false,
        title: cleanTitle,
        text: sec.text,
        caption: "",
        emphasis: "FEATURED",
        placement: "right",
        columns: 2,
        gap: "MEDIUM",
        aspectRatio: landscape(storyImage) ? "16:9" : "4:5",
        mediaIds: [storyImage.id],
        sourceIds: [],
        crop: landscape(storyImage) ? "wide" : "portrait",
        gallery: "mosaic",
        focalX: 50,
        focalY: 50,
        entries: [],
        children: [],
        ...(provenance ? { headingProvenance: provenance } : {}),
      });
    } else {
      sections.push({
        id: `section-${index}`,
        type: "SECTION",
        hidden: false,
        locked: false,
        title: cleanTitle,
        text: sec.text,
        caption: "",
        emphasis: "STANDARD",
        columns: 1,
        gap: "SMALL",
        aspectRatio: "16:9",
        mediaIds: [],
        sourceIds: [],
        crop: "wide",
        placement: "left",
        gallery: "mosaic",
        focalX: 50,
        focalY: 50,
        entries: [],
        children: [],
        ...(provenance ? { headingProvenance: provenance } : {}),
      });
    }
  }

  if (remaining.length >= 2) {
    sections.push({
      id: "gallery",
      type: "IMAGE_MOSAIC",
      hidden: false,
      locked: false,
      title: "",
      text: "",
      caption: "",
      emphasis: "STANDARD",
      columns: Math.min(remaining.length, 3),
      gap: "MEDIUM",
      aspectRatio: "16:9",
      mediaIds: remaining.map(m => m.id),
      sourceIds: [],
      crop: "wide",
      placement: "full",
      gallery: "mosaic",
      focalX: 50,
      focalY: 50,
      entries: [],
      children: [],
    });
  }

  if (hasEditorialFacts(context)) {
    sections.push({
      id: "facts",
      type: "FACTS",
      hidden: false,
      locked: false,
      title: "",
      text: "",
      caption: "",
      emphasis: "STANDARD",
      mediaIds: [],
      sourceIds: [],
      crop: "wide",
      placement: "full",
      gallery: "mosaic",
      focalX: 50,
      focalY: 50,
      entries: [],
      children: [],
    });
  }

  if (hasEditorialCoordinates(context)) {
    sections.push({
      id: "map",
      type: "MAP",
      hidden: false,
      locked: false,
      title: "Vị trí tham chiếu",
      text: "",
      caption: "",
      emphasis: "STANDARD",
      mediaIds: [],
      sourceIds: [],
      crop: "wide",
      placement: "full",
      gallery: "mosaic",
      focalX: 50,
      focalY: 50,
      entries: [],
      children: [],
    });
  }

  const sources = context.sources.filter(isEligibleEditorialSource);
  if (sources.length) {
    sections.push({
      id: "sources",
      type: "SOURCES",
      hidden: false,
      locked: false,
      title: "Nguồn tham khảo",
      text: "",
      caption: "",
      emphasis: "STANDARD",
      sourceIds: sources.map(s => s.id),
      mediaIds: [],
      crop: "wide",
      placement: "full",
      gallery: "mosaic",
      focalX: 50,
      focalY: 50,
      entries: [],
      children: [],
    });
  }

  const designTokens = {
    typography: family === "HERITAGE_STORY" ? "LITERARY" as const : family === "NATURE_SHOWCASE" ? "MODERN" as const : "HUMANIST" as const,
    palette: family === "HERITAGE_STORY" ? "FOREST" as const : family === "NATURE_SHOWCASE" ? "SLATE" as const : "EARTH" as const,
    rhythm: "IMMERSIVE" as const,
    containerWidth: "STANDARD" as const,
  };

  return editorialLayoutV2Schema.parse({
    schemaVersion: 2,
    mode: "GENERATIVE",
    family: seed?.family ?? family,
    variant: seed?.variant ?? variant,
    design: seed?.design ?? designTokens,
    hero: seed?.hero ?? { composition: variant, locked: false },
    sections,
    metadata: {
      generatedAt: new Date().toISOString(),
      qualityScore: 95,
    },
  });
}

export function autoLayout(context: EditorialContext): EditorialLayoutV1;
export function autoLayout(context: EditorialContext, seed: EditorialLayoutV2): EditorialLayoutV2;
export function autoLayout(context: EditorialContext, seed: EditorialLayoutV1): EditorialLayoutV1;
export function autoLayout(context: EditorialContext, seed?: EditorialLayout): EditorialLayout;
export function autoLayout(context: EditorialContext, seed?: EditorialLayout): EditorialLayout {
  if (seed && isV2Layout(seed)) {
    return autoLayoutV2(context, seed);
  }
  return autoLayoutV1(context, seed as EditorialLayoutV1 | undefined);
}

export type LayoutNodeDescriptor = {
  id: string;
  type: string;
  hidden?: boolean;
  locked?: boolean;
  title?: string;
  text?: string;
  caption?: string;
  deck?: string;
  emphasis?: "STANDARD" | "FEATURED" | "ACCENT" | "SUBTLE";
  placement?: "left" | "right" | "full" | "center";
  crop?: "wide" | "portrait" | "square" | "original";
  focalX?: number;
  focalY?: number;
  gallery?: "mosaic" | "grid" | "strip" | "masonry";
  mediaIds?: string[];
  sourceIds?: string[];
  entries?: Array<{ label: string; text: string; sourceIds: string[] }>;
  headingProvenance?: { blockId: string; excerpt: string };
};

export function getAllLayoutNodes(layout: EditorialLayout): LayoutNodeDescriptor[] {
  if (isV1Layout(layout)) return layout.blocks;
  const list: LayoutNodeDescriptor[] = [];
  const collect = (nodes: any[]) => {
    for (const n of nodes) {
      list.push(n);
      if (n.children?.length) collect(n.children);
    }
  };
  collect(layout.sections);
  return list;
}

export class EditorialReferenceError extends Error {
  constructor(
    message: string,
    readonly details?: {
      nodeId?: string;
      nodeType?: string;
      field?: "mediaIds" | "sourceIds" | "headingProvenance" | "entries" | "text";
      reason?: "UNUSABLE_MEDIA" | "REJECTED_SOURCE" | "HEADING_PROVENANCE" | "QUOTE_SOURCE_REQUIRED" | "TIMELINE_SOURCE_REQUIRED";
    }
  ) {
    super(message);
    this.name = "EditorialReferenceError";
  }
}

export function validateLayoutReferences(layout: EditorialLayout, context: EditorialContext, publishing: boolean) {
  const media = new Set(context.media.filter(m => !publishing || isDestinationMediaUsable(m, context.id)).map(m => m.id));
  const sources = new Set(context.sources.filter(s => !publishing || s.websiteRights !== "REJECTED").map(s => s.id));
  const nodes = getAllLayoutNodes(layout);
  for (const b of nodes) {
    if (b.headingProvenance && (b.headingProvenance.blockId !== b.id || b.headingProvenance.excerpt !== b.title || (!b.text?.includes(b.title) && !context.description.includes(b.title)))) {
      throw new EditorialReferenceError("Heading không còn khớp trích đoạn nguồn.", {
        nodeId: b.id,
        nodeType: b.type,
        field: "headingProvenance",
        reason: "HEADING_PROVENANCE",
      });
    }
    if (b.hidden && publishing) continue;
    if ((b.mediaIds ?? []).some(id => !media.has(id))) {
      throw new EditorialReferenceError("Ảnh hoặc nguồn không thuộc điểm đến hoặc không còn khả dụng.", {
        nodeId: b.id,
        nodeType: b.type,
        field: "mediaIds",
        reason: "UNUSABLE_MEDIA",
      });
    }
    if ([...(b.sourceIds ?? []), ...(b.entries ?? []).flatMap(e => e.sourceIds)].some(id => !sources.has(id))) {
      throw new EditorialReferenceError("Ảnh hoặc nguồn không thuộc điểm đến hoặc không còn khả dụng.", {
        nodeId: b.id,
        nodeType: b.type,
        field: "sourceIds",
        reason: "REJECTED_SOURCE",
      });
    }
    if (publishing && b.type === "QUOTE" && b.text && !(b.sourceIds ?? []).length && !context.description.includes(b.text)) {
      throw new EditorialReferenceError("Trích dẫn cần nguồn được duyệt hoặc đoạn nguyên văn trong mô tả.", {
        nodeId: b.id,
        nodeType: b.type,
        field: "sourceIds",
        reason: "QUOTE_SOURCE_REQUIRED",
      });
    }
    if (publishing && b.type === "TIMELINE" && (b.entries ?? []).some(e => !e.label || !e.text || !e.sourceIds.length)) {
      throw new EditorialReferenceError("Mốc thời gian cần nội dung và nguồn.", {
        nodeId: b.id,
        nodeType: b.type,
        field: "entries",
        reason: "TIMELINE_SOURCE_REQUIRED",
      });
    }
  }
}

export type EditorialDisplayIssue = { blockId: string; reason: "ADMIN_HIDDEN" | "EMPTY_CONTENT" | "DUPLICATE_BLOCK" };

export type ResolvedEditorialT<T extends EditorialLayout> = {
  layout: T;
  media: ResolvedEditorial["media"];
  sources: ResolvedEditorial["sources"];
};

export function resolveEditorialDisplay<T extends EditorialLayout>(
  layout: T,
  context: EditorialContext
): { editorial: ResolvedEditorialT<T> | null; issues: EditorialDisplayIssue[] } {
  if (isV2Layout(layout)) {
    const compiled = compileEditorialLayout(layout, context);
    const renderNode = (node: typeof compiled.nodes[number]): EditorialNodeV2 => {
      const { responsiveRules: _responsive, compositionNotes: _notes, children, ...values } = node;
      return { ...values, type: node.type as EditorialNodeV2["type"], aspectRatio: node.aspectRatio as EditorialNodeV2["aspectRatio"], children: children.map(renderNode) };
    };
    const editorial: ResolvedEditorialT<T> = {
      layout: { ...layout, sections: compiled.nodes.map(renderNode) },
      media: compiled.media,
      sources: compiled.sources,
    };
    return { editorial, issues: [] };
  }

  const v1Layout = layout as EditorialLayoutV1;
  const issues: EditorialDisplayIssue[] = v1Layout.blocks.filter(b => b.hidden).map(b => ({ blockId: b.id, reason: "ADMIN_HIDDEN" }));
  const prepped = prepareEditorialContent(v1Layout, context.description);
  const currentV1Layout = prepped.layout;
  const media = usableEditorialMedia(context);
  const sources = context.sources.filter(isEligibleEditorialSource);
  const sourceIds = new Set(sources.map(s => s.id));
  const seen = new Set<string>();
  const seenSourceIds = new Set<string>();
  const singletons = new Set<string>();
  const factsShown = currentV1Layout.blocks.some(b => b.type === "HIGHLIGHT_FACTS" && !b.hidden) && hasEditorialFacts(context);
  const seenDisplayTitles = new Set<string>();
  const blocks = currentV1Layout.blocks.filter(b => !b.hidden).map((b, bIdx) => {
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
  const editorial: ResolvedEditorialT<T> | null = !blocks.length ? null : ({ layout: { ...currentV1Layout, blocks } as unknown as T, media: media.filter(m => seen.has(m.id)).map(m => ({ id: m.id, url: m.url, alt: m.alt, caption: m.caption, author: m.author, sourceUrl: m.sourceUrl, ...editorialImageDimensions(m) })), sources: sources.map(({ id, title, url }) => ({ id, title, url })) } as ResolvedEditorialT<T>);
  return { editorial, issues };
}
export function resolveEditorial<T extends EditorialLayout>(layout: T, context: EditorialContext): ResolvedEditorialT<T> | null {
  return resolveEditorialDisplay(layout, context).editorial;
}
