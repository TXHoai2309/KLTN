import type {
  EditorialLayout,
  EditorialLayoutV1,
  EditorialLayoutV2,
  EditorialNodeV2,
  EditorialContext,
  ResolvedEditorial,
} from "./editorial-contract";
import { isV1Layout, isV2Layout, defaultEditorialDesign } from "./editorial-contract";
import { buildEditorialContentUnits as buildCanonicalContentAst, type CanonicalContentAst } from "./editorial-content-units";
import { usableEditorialMedia, isEligibleEditorialSource } from "./editorial-engine";
import { editorialImageDimensions } from "./editorial-image-quality";
import { stripMarkdownHeading } from "./editorial-content";
import {
  editorialValue,
  hasEditorialCoordinates,
  hasEditorialFacts,
} from "./editorial-display-policy";

export type CompiledNode = {
  id: string;
  type: EditorialNodeV2["type"] | EditorialLayoutV1["blocks"][number]["type"];
  hidden: boolean;
  locked: boolean;
  title: string;
  text: string;
  caption: string;
  deck: string;
  emphasis: "STANDARD" | "FEATURED" | "ACCENT" | "SUBTLE";
  mediaIds: string[];
  sourceIds: string[];
  columns: number;
  columnRatio?: "EQUAL" | "TEXT_WIDE" | "MEDIA_WIDE";
  compositionNotes?: Array<"TEXT_BALANCE_STACK" | "PROSE_COLUMN_CAP" | "LONG_TEXT_BREAK">;
  gap: "NONE" | "SMALL" | "MEDIUM" | "LARGE";
  aspectRatio: string;
  crop: "wide" | "portrait" | "square" | "original";
  placement: "left" | "right" | "full" | "center";
  gallery: "mosaic" | "grid" | "strip" | "masonry";
  focalX: number;
  focalY: number;
  entries: Array<{ label: string; text: string; sourceIds: string[] }>;
  children: CompiledNode[];
  responsiveRules: {
    mobileCols: number;
    tabletCols: number;
    desktopCols: number;
    stackOnMobile: boolean;
  };
};

export type CompiledEditorialTree = {
  schemaVersion: 1 | 2;
  mode: "TEMPLATE_DRIVEN" | "GENERATIVE";
  design: {
    typography: string;
    palette: string;
    rhythm: string;
    containerWidth: string;
  };
  nodes: CompiledNode[];
  media: ResolvedEditorial["media"];
  sources: ResolvedEditorial["sources"];
  context: {
    id: string;
    name: string;
    category: string;
    area: string;
  };
};

function groupReadingHeadings(nodes: CompiledNode[]): void {
  for (let index = 0; index < nodes.length - 1; index++) {
    const heading = nodes[index]!, following = nodes[index + 1]!;
    if (heading.type === "HEADING" && ["PARAGRAPH", "LEAD"].includes(following.type) && !following.title && following.text) {
      following.title = heading.title || heading.text;
      nodes.splice(index, 1);
      index--;
    }
  }
}

/**
 * Deterministic layout compiler that validates and maps an EditorialLayout
 * (V1 or V2) into a safe, normalized, responsive render tree.
 */
export function compileEditorialLayout(
  layout: EditorialLayout,
  context: EditorialContext,
  options: { ast?: CanonicalContentAst } = {}
): CompiledEditorialTree {
  const ast = options.ast ?? buildCanonicalContentAst(context);
  const eligibleMedia = usableEditorialMedia(context);
  const eligibleSources = context.sources.filter(isEligibleEditorialSource);
  const eligibleMediaIds = new Set(eligibleMedia.map(m => m.id));
  const eligibleSourceIds = new Set(eligibleSources.map(s => s.id));
  const seenMediaIds = new Set<string>();

  if (isV1Layout(layout)) {
    return compileV1Layout(layout, context, eligibleMedia, eligibleSources, eligibleMediaIds, eligibleSourceIds, seenMediaIds);
  }

  return compileV2Layout(layout, context, ast, eligibleMedia, eligibleSources, eligibleMediaIds, eligibleSourceIds, seenMediaIds);
}

function compileV1Layout(
  layout: EditorialLayoutV1,
  context: EditorialContext,
  eligibleMedia: EditorialContext["media"],
  eligibleSources: EditorialContext["sources"],
  eligibleMediaIds: Set<string>,
  eligibleSourceIds: Set<string>,
  seenMediaIds: Set<string>
): CompiledEditorialTree {
  const design = layout.design ?? defaultEditorialDesign;
  const nodes: CompiledNode[] = layout.blocks
    .filter(b => !b.hidden)
    .map(b => {
      const validMediaIds = b.mediaIds.filter(id => eligibleMediaIds.has(id) && !seenMediaIds.has(id) && Boolean(seenMediaIds.add(id)));
      const validSourceIds = b.sourceIds.filter(id => eligibleSourceIds.has(id));
      const cleanTitle = stripMarkdownHeading(editorialValue(b.title));

      return {
        id: b.id,
        type: b.type,
        hidden: b.hidden,
        locked: false,
        title: cleanTitle,
        text: editorialValue(b.text),
        caption: editorialValue(b.caption),
        deck: editorialValue(b.deck),
        emphasis: b.emphasis ?? "STANDARD",
        mediaIds: validMediaIds,
        sourceIds: validSourceIds,
        columns: b.type === "IMAGE_GRID" ? 3 : b.type === "IMAGE_TEXT_SPLIT" ? 2 : 1,
        gap: "MEDIUM" as const,
        aspectRatio: b.crop === "portrait" ? "4:5" : b.crop === "square" ? "1:1" : "16:9",
        crop: b.crop,
        placement: b.placement,
        gallery: b.gallery,
        focalX: b.focalX,
        focalY: b.focalY,
        entries: b.entries.map(e => ({
          label: editorialValue(e.label),
          text: editorialValue(e.text),
          sourceIds: e.sourceIds.filter(id => eligibleSourceIds.has(id)),
        })),
        children: [],
        responsiveRules: {
          mobileCols: 1,
          tabletCols: b.type === "IMAGE_GRID" ? 2 : 1,
          desktopCols: b.type === "IMAGE_GRID" ? 3 : b.type === "IMAGE_TEXT_SPLIT" ? 2 : 1,
          stackOnMobile: true,
        },
      };
    })
    .filter(node => isUsefulNode(node, context));

  return {
    schemaVersion: 1,
    mode: "TEMPLATE_DRIVEN",
    design: {
      typography: design.typography,
      palette: design.palette,
      rhythm: design.rhythm,
      containerWidth: "STANDARD",
    },
    nodes,
    media: eligibleMedia.filter(m => seenMediaIds.has(m.id)).map(m => ({
      id: m.id,
      url: m.url,
      alt: m.alt,
      caption: m.caption,
      author: m.author,
      sourceUrl: m.sourceUrl,
      ...editorialImageDimensions(m),
    })),
    sources: eligibleSources.map(({ id, title, url }) => ({ id, title, url })),
    context: {
      id: context.id,
      name: context.name,
      category: context.category,
      area: context.area,
    },
  };
}

function compileV2Layout(
  layout: EditorialLayoutV2,
  context: EditorialContext,
  ast: CanonicalContentAst,
  eligibleMedia: EditorialContext["media"],
  eligibleSources: EditorialContext["sources"],
  eligibleMediaIds: Set<string>,
  eligibleSourceIds: Set<string>,
  seenMediaIds: Set<string>
): CompiledEditorialTree {
  const design = layout.design ?? {
    typography: "LITERARY",
    palette: "FOREST",
    rhythm: "IMMERSIVE",
    containerWidth: "STANDARD",
  };

  const reservedIds = new Set<string>();
  const reserve = (nodes: EditorialNodeV2[]) => { for (const node of nodes) { reservedIds.add(node.id); reserve(node.children ?? []); } };
  reserve(layout.sections);
  let additionalNodeBudget = Math.max(0, 50 - reservedIds.size);

  const compileNode = (n: EditorialNodeV2, depth = 1): CompiledNode | null => {
    if (n.hidden) return null;

    // Resolve contentRef against AST if present
    let text = editorialValue(n.text);
    let title = stripMarkdownHeading(editorialValue(n.title));
    if (n.contentRef) {
      const astUnit = ast.units.find(u => u.id === n.contentRef);
      if (astUnit) {
        if (!text) text = astUnit.text;
        if (!title && astUnit.title) title = stripMarkdownHeading(astUnit.title);
      }
    }

    const validMediaIds = (n.mediaIds ?? []).filter(
      id => eligibleMediaIds.has(id) && !seenMediaIds.has(id) && Boolean(seenMediaIds.add(id))
    );
    const validSourceIds = (n.sourceIds ?? []).filter(id => eligibleSourceIds.has(id));

    const children: CompiledNode[] = [];
    if (n.children?.length) {
      for (const child of n.children) {
        const compiledChild = compileNode(child, depth + 1);
        if (compiledChild && isUsefulNode(compiledChild, context)) {
          children.push(compiledChild);
        }
      }
    } else if ((n.type === "COLUMNS" || n.type === "GRID") && text && depth < 3 && additionalNodeBudget >= 2) {
      const paras = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
      if (paras.length >= 2) {
        const groupCount = Math.min(10, additionalNodeBudget, paras.length);
        additionalNodeBudget -= groupCount;
        for (let pIdx = 0; pIdx < groupCount; pIdx++) {
          const p = paras.slice(Math.floor(pIdx * paras.length / groupCount), Math.floor((pIdx + 1) * paras.length / groupCount)).join("\n\n");
          let suffix = pIdx;
          let childId = `${n.id.slice(0, 110)}-col-${suffix}`;
          while (reservedIds.has(childId)) childId = `${n.id.slice(0, 110)}-col-${++suffix}`;
          reservedIds.add(childId);
          children.push({
            id: childId,
            type: "PARAGRAPH",
            hidden: false,
            locked: false,
            title: "",
            text: p,
            caption: "",
            deck: "",
            emphasis: n.emphasis ?? "STANDARD",
            mediaIds: [],
            sourceIds: [],
            columns: 1,
            gap: "MEDIUM",
            aspectRatio: "16:9",
            crop: "wide",
            placement: "left",
            gallery: "mosaic",
            focalX: 50,
            focalY: 50,
            entries: [],
            children: [],
            responsiveRules: {
              mobileCols: 1,
              tabletCols: 1,
              desktopCols: 1,
              stackOnMobile: true,
            },
          });
        }
      }
    }

    groupReadingHeadings(children);
    let cols = n.columns ?? (n.type === "GRID" || n.type === "COLUMNS" ? 2 : n.type === "GALLERY" || n.type === "IMAGE_MOSAIC" ? 3 : 1);
    const compositionNotes: NonNullable<CompiledNode["compositionNotes"]> = [];
    const textWeight = (node: CompiledNode): number => (node.text?.length ?? 0) + node.children.reduce((sum, child) => sum + textWeight(child), 0);
    const hasMedia = (node: CompiledNode): boolean => node.mediaIds.length > 0 || node.children.some(hasMedia);
    if (n.type === "COLUMNS" || n.type === "GRID") {
      // Grid cells are complete reading groups. A heading must never become
      // a nearly empty column opposite its paragraph.
      const weights = children.map(textWeight);
      const prose = weights.some(weight => weight > 160) || text.length > 160;
      if (prose && cols > 2) { cols = 2; compositionNotes.push("PROSE_COLUMN_CAP"); }
      const noMedia = !children.some(hasMedia) && !validMediaIds.length;
      const totals = Array.from({ length: Math.max(1, cols) }, (_, col) => weights.filter((_, index) => index % cols === col).reduce((sum, weight) => sum + weight, 0));
      if (cols > 1 && (children.length < cols || (noMedia && (Math.min(...totals) < 160 || Math.max(...totals) / Math.max(1, Math.min(...totals)) > 2.2)))) {
        cols = 1;
        compositionNotes.push("TEXT_BALANCE_STACK");
      }
      // These paragraphs now live in children; never render them twice.
      if (!n.children?.length && children.length && text) text = "";
    }
    let placement = n.placement ?? "left";
    let columnRatio = n.columnRatio ?? "EQUAL";
    let crop = n.crop ?? "original";
    const image = eligibleMedia.find(media => media.id === validMediaIds[0]);
    const dimensions = image ? editorialImageDimensions(image) : undefined;
    if (image && !n.locked && n.type !== "HERO" && (!dimensions?.width || !dimensions.height || (crop === "portrait" && dimensions.width / dimensions.height > 1.3) || (crop === "wide" && dimensions.width / dimensions.height < 1))) crop = "original";
    if (n.type === "IMAGE_TEXT") {
      const characters = text.length + children.reduce((sum, child) => sum + textWeight(child), 0);
      if (!validMediaIds.length || characters > 1800 || placement === "full") {
        cols = 1;
        placement = "full";
        if (characters > 1800) compositionNotes.push("LONG_TEXT_BREAK");
      } else {
        cols = 2;
        columnRatio = characters > 650 ? "TEXT_WIDE" : columnRatio;
      }
    }

    const compiled: CompiledNode = {
      id: n.id,
      type: n.type,
      hidden: false,
      locked: Boolean(n.locked),
      title,
      text,
      caption: editorialValue(n.caption),
      deck: editorialValue(n.deck),
      emphasis: n.emphasis ?? "STANDARD",
      mediaIds: validMediaIds,
      sourceIds: validSourceIds,
      columns: cols,
      columnRatio,
      compositionNotes,
      gap: n.gap ?? "MEDIUM",
      aspectRatio: n.aspectRatio ?? (n.crop === "portrait" ? "4:5" : n.crop === "square" ? "1:1" : "16:9"),
      crop,
      placement,
      gallery: n.gallery ?? "mosaic",
      focalX: n.focalX ?? 50,
      focalY: n.focalY ?? 50,
      entries: (n.entries ?? []).map(e => ({
        label: editorialValue(e.label),
        text: editorialValue(e.text),
        sourceIds: e.sourceIds.filter(id => eligibleSourceIds.has(id)),
      })),
      children,
      responsiveRules: {
        mobileCols: 1,
        tabletCols: (n.type === "GRID" || n.type === "COLUMNS") && children.some(child => textWeight(child) > 160) ? 1 : Math.min(2, cols),
        desktopCols: cols,
        stackOnMobile: cols > 1,
      },
    };

    return isUsefulNode(compiled, context) ? compiled : null;
  };

  const nodes: CompiledNode[] = [];
  for (const s of layout.sections) {
    const compiled = compileNode(s);
    if (compiled) nodes.push(compiled);
  }
  groupReadingHeadings(nodes);

  return {
    schemaVersion: 2,
    mode: "GENERATIVE",
    design: {
      typography: design.typography,
      palette: design.palette,
      rhythm: design.rhythm,
      containerWidth: design.containerWidth,
    },
    nodes,
    media: eligibleMedia.filter(m => seenMediaIds.has(m.id)).map(m => ({
      id: m.id,
      url: m.url,
      alt: m.alt,
      caption: m.caption,
      author: m.author,
      sourceUrl: m.sourceUrl,
      ...editorialImageDimensions(m),
    })),
    sources: eligibleSources.map(({ id, title, url }) => ({ id, title, url })),
    context: {
      id: context.id,
      name: context.name,
      category: context.category,
      area: context.area,
    },
  };
}

function isUsefulNode(node: CompiledNode, context: EditorialContext): boolean {
  if (node.children.length > 0) return true;
  if (["SECTION", "CONTAINER", "PAGE", "GRID", "COLUMNS", "STACK"].includes(node.type)) {
    return Boolean(node.children.length || node.title || node.text || node.mediaIds.length);
  }
  if (["IMAGE", "PANORAMA", "GALLERY", "IMAGE_MOSAIC", "FULL_WIDTH_IMAGE", "IMAGE_GRID", "IMAGE_GALLERY"].includes(node.type)) {
    return node.mediaIds.length > 0;
  }
  if (["HEADING", "PARAGRAPH", "LEAD", "TEXT_SECTION", "INTRO"].includes(node.type)) {
    return Boolean(node.title || node.text);
  }
  if (["IMAGE_TEXT", "IMAGE_TEXT_SPLIT"].includes(node.type)) {
    return Boolean(node.title || node.text || node.mediaIds.length);
  }
  if (node.type === "QUOTE") {
    return Boolean(node.text && (node.sourceIds.length || context.description.includes(node.text)));
  }
  if (node.type === "TIMELINE") {
    return node.entries.length > 0;
  }
  if (node.type === "SOURCES") {
    return node.sourceIds.length > 0;
  }
  if (node.type === "MAP") {
    return hasEditorialCoordinates(context);
  }
  if (node.type === "FACTS" || (node.type as string) === "HIGHLIGHT_FACTS") {
    return hasEditorialFacts(context);
  }
  if (node.type === "VISIT_INFORMATION") {
    return false; // Owner removed the travel preparation panel from Preview/Public.
  }
  if (node.type === "HERO") {
    return true;
  }
  return Boolean(node.title || node.text || node.mediaIds.length);
}
