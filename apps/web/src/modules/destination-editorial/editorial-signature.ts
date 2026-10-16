import type { EditorialLayout, EditorialBlock, EditorialNodeV2 } from "./editorial-contract";
import { defaultEditorialDesign, isV2Layout } from "./editorial-contract";
import { getAllLayoutNodes } from "./editorial-engine";

export type BodyStructuralSignature = {
  // Primitives in the story body (excluding HERO, and trailing MAP/SOURCES/VISIT)
  bodyPrimitiveSequence: string[];
  // Does the body contain multi-column grids or columns (COLUMNS, GRID >= 2)
  hasMultiColumn: boolean;
  // Maximum columns in any body container
  maxColumns: number;
  // Count of nested child nodes across all containers
  nestedChildCount: number;
  // Types of containers used (e.g. GRID, COLUMNS, STACK)
  containerTypes: string[];
  // Placements of IMAGE_TEXT nodes (e.g. ["right", "left"])
  imageTextPlacements: string[];
  // Specialized story blocks present in body (TIMELINE, FACTS, QUOTE, IMAGE_MOSAIC, GALLERY)
  specializedBlocks: string[];
  // Gallery patterns
  galleryPatterns: string[];
  // Media assignments in the body
  bodyMediaDistribution: number[];
  // Total body section count
  bodySectionCount: number;
};

export type VisualSignature = {
  heroComposition: string;
  heroMediaId: string | null;
  heroCrop: string;
  heroFocal: `${number},${number}`;
  typography: string;
  palette: string;
  rhythm: string;
  containerWidth: string;
};

export type LayoutSignature = {
  schemaVersion: number;
  family?: EditorialLayout["family"];
  variant?: EditorialLayout["variant"];
  heroMediaId: string | null;
  heroCrop: string;
  heroComposition: string;
  heroFocal: `${number},${number}`;
  typography: string;
  palette: string;
  rhythm: string;
  containerWidth: string;
  blockTypes: string[];
  blockCount: number;
  sectionCount: number;
  mediaAssignments: Array<{ blockId: string; mediaIds: string[] }>;
  placements: Array<{ blockId: string; placement: string }>;
  bodyStructural: BodyStructuralSignature;
  visual: VisualSignature;
};

export type LayoutDiversityLevel = "SAME" | "MINOR" | "SIGNIFICANT";

export type LayoutDiversityResult = {
  level: LayoutDiversityLevel;
  score: number;
  bodyScore: number;
  visualScore: number;
  differences: string[];
  bodyDifferences: string[];
  visualDifferences: string[];
};

export function getLayoutSignature(layout: EditorialLayout): LayoutSignature {
  if (isV2Layout(layout)) {
    const allNodes = getAllLayoutNodes(layout);
    const hero = allNodes.find(n => n.type === "HERO" && !n.hidden);
    const heroNode = hero as any;
    const design = layout.design ?? {
      typography: "LITERARY",
      palette: "FOREST",
      rhythm: "IMMERSIVE",
      containerWidth: "STANDARD",
    };

    // Body sections: exclude HERO and trailing utilities (MAP, SOURCES, VISIT_INFORMATION)
    const trailingTypes = new Set(["MAP", "SOURCES", "VISIT_INFORMATION"]);
    const canonicalBody = (nodes: EditorialNodeV2[]): EditorialNodeV2[] => nodes.filter(n => !n.hidden && n.type !== "HERO" && !trailingTypes.has(n.type)).flatMap(node => {
      const children = canonicalBody(node.children ?? []);
      const transparent = ["PAGE", "SECTION", "STACK", "CONTAINER"].includes(node.type) || (["GRID", "COLUMNS"].includes(node.type) && (node.columns ?? 2) === 1);
      if (transparent && !node.title && !node.text && !node.mediaIds?.length) return children;
      const type = ["PAGE", "SECTION", "STACK", "CONTAINER"].includes(node.type) ? "SECTION"
        : node.type === "COLUMNS" ? "GRID" : node.type;
      return [{ ...node, type, children }];
    });
    const bodySections = canonicalBody(layout.sections);
    const flatten = (nodes: EditorialNodeV2[]): EditorialNodeV2[] => nodes.flatMap(node => [node, ...flatten(node.children ?? [])]);
    const bodyNodes = flatten(bodySections);

    const containerTypes = bodyNodes
      .filter(s => ["GRID", "COLUMNS", "STACK", "CONTAINER"].includes(s.type))
      .map(s => s.type);

    const hasMultiColumn = bodyNodes.some(s =>
      (s.type === "COLUMNS" || s.type === "GRID") && (s.columns ?? 2) >= 2
    );

    const maxColumns = Math.max(
      1,
      ...bodyNodes.filter(s => s.type === "GRID" || s.type === "COLUMNS").map(s => s.columns ?? 2)
    );

    let nestedChildCount = 0;
    for (const s of bodyNodes) {
      if (s.children?.length) nestedChildCount += s.children.length;
    }

    const imageTextPlacements = bodyNodes
      .filter(s => s.type === "IMAGE_TEXT")
      .map(s => s.placement ?? "right");

    const specializedBlocks = bodyNodes
      .filter(s => ["TIMELINE", "FACTS", "QUOTE", "IMAGE_MOSAIC", "GALLERY", "PANORAMA"].includes(s.type))
      .map(s => s.type);

    const galleryPatterns = bodySections
      .filter(s => s.gallery)
      .map(s => s.gallery as string);

    const bodyMediaDistribution = bodySections.map(s => s.mediaIds?.length ?? 0);

    const bodyStructural: BodyStructuralSignature = {
      bodyPrimitiveSequence: bodySections.map(s => s.type),
      hasMultiColumn,
      maxColumns,
      nestedChildCount,
      containerTypes,
      imageTextPlacements,
      specializedBlocks,
      galleryPatterns,
      bodyMediaDistribution,
      bodySectionCount: bodySections.length,
    };

    const visual: VisualSignature = {
      heroComposition: layout.hero?.composition ?? layout.variant ?? "PANORAMA",
      heroMediaId: heroNode?.mediaIds?.[0] ?? null,
      heroCrop: heroNode?.crop ?? "wide",
      heroFocal: `${heroNode?.focalX ?? 50},${heroNode?.focalY ?? 50}`,
      typography: design.typography,
      palette: design.palette,
      rhythm: design.rhythm,
      containerWidth: design.containerWidth ?? "STANDARD",
    };

    return {
      schemaVersion: 2,
      family: layout.family,
      variant: layout.variant,
      heroMediaId: visual.heroMediaId,
      heroCrop: visual.heroCrop,
      heroComposition: visual.heroComposition,
      heroFocal: visual.heroFocal,
      typography: visual.typography,
      palette: visual.palette,
      rhythm: visual.rhythm,
      containerWidth: visual.containerWidth,
      blockTypes: allNodes.filter(n => !n.hidden).map(n => n.type),
      blockCount: allNodes.filter(n => !n.hidden).length,
      sectionCount: layout.sections.length,
      mediaAssignments: allNodes.filter(n => !n.hidden && n.mediaIds?.length).map(n => ({ blockId: n.id, mediaIds: [...(n.mediaIds ?? [])] })),
      placements: allNodes.filter(n => !n.hidden && (n as any).placement).map(n => ({ blockId: n.id, placement: (n as any).placement })),
      bodyStructural,
      visual,
    };
  }

  // V1 Compatibility
  const hero = layout.blocks.find(b => b.type === "HERO" && !b.hidden);
  const design = layout.design ?? defaultEditorialDesign;
  const trailingTypes = new Set(["MAP", "SOURCES", "VISIT_INFORMATION"]);
  const bodyBlocks = layout.blocks.filter(b => !b.hidden && b.type !== "HERO" && !trailingTypes.has(b.type));

  const bodyStructural: BodyStructuralSignature = {
    bodyPrimitiveSequence: bodyBlocks.map(b => b.type),
    hasMultiColumn: bodyBlocks.some(b => b.type === "IMAGE_GRID" || b.type === "IMAGE_TEXT_SPLIT"),
    maxColumns: bodyBlocks.some(b => b.type === "IMAGE_GRID") ? 3 : bodyBlocks.some(b => b.type === "IMAGE_TEXT_SPLIT") ? 2 : 1,
    nestedChildCount: 0,
    containerTypes: [],
    imageTextPlacements: bodyBlocks.filter(b => b.type === "IMAGE_TEXT_SPLIT").map(b => b.placement),
    specializedBlocks: bodyBlocks.filter(b => ["TIMELINE", "HIGHLIGHT_FACTS", "QUOTE", "IMAGE_GALLERY", "IMAGE_GRID"].includes(b.type)).map(b => b.type),
    galleryPatterns: bodyBlocks.filter(b => b.gallery).map(b => b.gallery),
    bodyMediaDistribution: bodyBlocks.map(b => b.mediaIds.length),
    bodySectionCount: bodyBlocks.length,
  };

  const visual: VisualSignature = {
    heroComposition: layout.hero?.composition ?? layout.variant,
    heroMediaId: hero?.mediaIds[0] ?? null,
    heroCrop: hero?.crop ?? "wide",
    heroFocal: `${hero?.focalX ?? 50},${hero?.focalY ?? 50}`,
    typography: design.typography,
    palette: design.palette,
    rhythm: design.rhythm,
    containerWidth: "STANDARD",
  };

  return {
    schemaVersion: 1,
    family: layout.family,
    variant: layout.variant,
    heroMediaId: visual.heroMediaId,
    heroCrop: visual.heroCrop,
    heroComposition: visual.heroComposition,
    heroFocal: visual.heroFocal,
    typography: visual.typography,
    palette: visual.palette,
    rhythm: visual.rhythm,
    containerWidth: "STANDARD",
    blockTypes: layout.blocks.filter(b => !b.hidden).map(b => b.type),
    blockCount: layout.blocks.filter(b => !b.hidden).length,
    sectionCount: layout.blocks.length,
    mediaAssignments: layout.blocks.filter(b => !b.hidden && b.mediaIds.length).map(b => ({ blockId: b.id, mediaIds: [...b.mediaIds] })),
    placements: layout.blocks.filter(b => !b.hidden && b.placement).map(b => ({ blockId: b.id, placement: b.placement })),
    bodyStructural,
    visual,
  };
}

/**
 * Compares two layout signatures and computes structural (body topology)
 * and visual (hero & tokens) diversity.
 *
 * CRITICAL INVARIANT:
 * `level === "SIGNIFICANT"` ONLY when `bodyScore >= 3.0` (genuine body topology variation).
 * Changes restricted to Hero composition, hero photo, or styling tokens can score
 * up to MINOR, but can NEVER trigger SIGNIFICANT on their own.
 */
export function compareLayoutSignatures(current: LayoutSignature, proposed: LayoutSignature): LayoutDiversityResult {
  const bodyDifferences: string[] = [];
  const visualDifferences: string[] = [];
  let bodyScore = 0;
  let visualScore = 0;

  // 1. Version Architecture Shift
  if (current.schemaVersion !== proposed.schemaVersion) {
    bodyScore += 4;
    bodyDifferences.push("Chuyển đổi phiên bản kiến trúc dàn trang");
  }

  // 2. BODY STRUCTURAL TOPOLOGY EVALUATION
  const curBody = current.bodyStructural;
  const propBody = proposed.bodyStructural;

  // A. Multi-column contrast (e.g. linear 1-column vs 2-column COLUMNS/GRID)
  if (curBody.hasMultiColumn !== propBody.hasMultiColumn) {
    bodyScore += 3.5;
    bodyDifferences.push(
      propBody.hasMultiColumn
        ? "Bổ sung cấu trúc đa cột (COLUMNS/GRID)"
        : "Chuyển từ đa cột sang bố cục tuyến tính"
    );
  } else if (curBody.maxColumns !== propBody.maxColumns && propBody.maxColumns > 1) {
    bodyScore += 2.0;
    bodyDifferences.push(`Thay đổi số cột lưới (${curBody.maxColumns} → ${propBody.maxColumns} cột)`);
  }

  // B. Container types contrast (e.g. COLUMNS vs GRID vs STACK)
  const curContainers = curBody.containerTypes.join("/");
  const propContainers = propBody.containerTypes.join("/");
  if (curContainers !== propContainers) {
    bodyScore += 2.0;
    bodyDifferences.push(`Đổi loại container thân bài (${curContainers || "none"} → ${propContainers || "none"})`);
  }

  // C. Nested child nodes structure
  if (Math.abs(curBody.nestedChildCount - propBody.nestedChildCount) >= 2) {
    bodyScore += 1.5;
    bodyDifferences.push(`Tái cấu trúc khối lồng nhau (${curBody.nestedChildCount} → ${propBody.nestedChildCount} phần tử con)`);
  }

  // D. Body primitive sequence comparison
  const curSeq = curBody.bodyPrimitiveSequence.join(",");
  const propSeq = propBody.bodyPrimitiveSequence.join(",");
  if (curSeq !== propSeq) {
    const curSet = new Set(curBody.bodyPrimitiveSequence);
    const propSet = new Set(propBody.bodyPrimitiveSequence);
    const addedTypes = [...propSet].filter(t => !curSet.has(t));
    const removedTypes = [...curSet].filter(t => !propSet.has(t));

    if (addedTypes.length > 0 || removedTypes.length > 0) {
      bodyScore += 2.5;
      bodyDifferences.push(`Tổ hợp primitive thân bài mới: ${[...addedTypes.map(t => `+${t}`), ...removedTypes.map(t => `-${t}`)].join(", ")}`);
    } else {
      bodyScore += 1.5;
      bodyDifferences.push("Thay đổi thứ tự nhịp kể chuyện trong thân bài");
    }
  }

  // E. IMAGE_TEXT narrative split variations
  const curSplits = curBody.imageTextPlacements.join(",");
  const propSplits = propBody.imageTextPlacements.join(",");
  if (curSplits !== propSplits) {
    bodyScore += 2.0;
    bodyDifferences.push(`Phối ảnh-chữ xen kẽ (${propBody.imageTextPlacements.join(" / ") || "không dùng split"})`);
  }

  // F. Specialized blocks comparison (TIMELINE, FACTS, QUOTE, IMAGE_MOSAIC, GALLERY)
  const curSpecial = new Set(curBody.specializedBlocks);
  const propSpecial = new Set(propBody.specializedBlocks);
  const specialDiffs = [
    ...[...propSpecial].filter(s => !curSpecial.has(s)).map(s => `+${s}`),
    ...[...curSpecial].filter(s => !propSpecial.has(s)).map(s => `-${s}`),
  ];
  if (specialDiffs.length > 0) {
    bodyScore += Math.min(specialDiffs.length * 1.5, 3.0);
    bodyDifferences.push(`Cập nhật khối chuyên biệt (${specialDiffs.join(", ")})`);
  }

  // G. Body section count change
  if (Math.abs(curBody.bodySectionCount - propBody.bodySectionCount) >= 2) {
    bodyScore += 1.0;
    bodyDifferences.push(`Thay đổi số lượng phân đoạn thân bài (${curBody.bodySectionCount} → ${propBody.bodySectionCount})`);
  }

  // H. Media redistribution in body
  const curMediaStr = curBody.bodyMediaDistribution.join(",");
  const propMediaStr = propBody.bodyMediaDistribution.join(",");
  if (curMediaStr !== propMediaStr) {
    bodyScore += 1.0;
    bodyDifferences.push("Phân bổ lại vị trí hình ảnh trong các section");
  }

  // 3. VISUAL & PRESENTATION EVALUATION (Hero, Tokens)
  const curVis = current.visual;
  const propVis = proposed.visual;

  if (curVis.heroComposition !== propVis.heroComposition) {
    visualScore += 3.0;
    visualDifferences.push(`Đổi cách trình bày Hero (${curVis.heroComposition} → ${propVis.heroComposition})`);
  }

  if (curVis.heroMediaId && propVis.heroMediaId && curVis.heroMediaId !== propVis.heroMediaId) {
    visualScore += 3.0;
    visualDifferences.push("Đổi ảnh Hero chính");
  }

  if (curVis.heroCrop !== propVis.heroCrop) {
    visualScore += 1.0;
    visualDifferences.push(`Đổi tỷ lệ crop Hero (${curVis.heroCrop} → ${propVis.heroCrop})`);
  }

  const [cx, cy] = curVis.heroFocal.split(",").map(Number);
  const [px, py] = propVis.heroFocal.split(",").map(Number);
  if (Math.abs((cx ?? 50) - (px ?? 50)) >= 15 || Math.abs((cy ?? 50) - (py ?? 50)) >= 15) {
    visualScore += 0.5;
    visualDifferences.push("Điều chỉnh trọng tâm focal point Hero");
  }

  if (curVis.typography !== propVis.typography) {
    visualScore += 1.5;
    visualDifferences.push(`Đổi kiểu chữ (${curVis.typography} → ${propVis.typography})`);
  }

  if (curVis.palette !== propVis.palette) {
    visualScore += 1.5;
    visualDifferences.push(`Đổi sắc độ bảng màu (${curVis.palette} → ${propVis.palette})`);
  }

  if (curVis.rhythm !== propVis.rhythm) {
    visualScore += 0.5;
    visualDifferences.push(`Đổi nhịp khoảng cách (${curVis.rhythm} → ${propVis.rhythm})`);
  }

  if (curVis.containerWidth !== propVis.containerWidth) {
    visualScore += 0.5;
    visualDifferences.push(`Đổi độ rộng trang (${curVis.containerWidth} → ${propVis.containerWidth})`);
  }

  // V1 template family & variant tracking
  if (current.family && proposed.family && current.family !== proposed.family) {
    visualScore += 1.5;
    visualDifferences.push(`Đổi nhóm template (${current.family} → ${proposed.family})`);
  }
  if (current.variant && proposed.variant && current.variant !== proposed.variant) {
    visualScore += 1.5;
    visualDifferences.push(`Đổi biến thể bố cục (${current.variant} → ${proposed.variant})`);
  }

  // 4. COMBINE AND CLASSIFY
  let level: LayoutDiversityLevel = "SAME";
  const isV4 = current.schemaVersion === 2 || proposed.schemaVersion === 2;
  if (isV4) {
    // V4 GENERATIVE INVARIANT: SIGNIFICANT REQUIRES bodyScore >= 3.0.
    // Hero-only or styling-only changes are strictly capped at MINOR.
    if (bodyScore >= 3.0) {
      level = "SIGNIFICANT";
    } else if (bodyScore > 0 || visualScore > 0) {
      level = "MINOR";
    }
  } else {
    // V3.6 TEMPLATE-DRIVEN BACKWARD COMPATIBILITY:
    const v1Total = bodyScore + visualScore;
    if (v1Total >= 3.0) {
      level = "SIGNIFICANT";
    } else if (v1Total > 0) {
      level = "MINOR";
    }
  }

  const totalScore = Math.round((bodyScore + visualScore) * 10) / 10;
  const differences = [...bodyDifferences, ...visualDifferences];

  return {
    level,
    score: totalScore,
    bodyScore: Math.round(bodyScore * 10) / 10,
    visualScore: Math.round(visualScore * 10) / 10,
    differences,
    bodyDifferences,
    visualDifferences,
  };
}
