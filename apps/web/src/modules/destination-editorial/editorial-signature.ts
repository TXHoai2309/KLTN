import type { EditorialLayout, EditorialBlock } from "./editorial-contract";
import { defaultEditorialDesign } from "./editorial-contract";

export type LayoutSignature = {
  family: EditorialLayout["family"];
  variant: EditorialLayout["variant"];
  heroMediaId: string | null;
  heroCrop: EditorialBlock["crop"];
  heroComposition: EditorialLayout["variant"];
  heroFocal: `${number},${number}`;
  typography: string;
  palette: string;
  rhythm: string;
  blockTypes: EditorialBlock["type"][];
  blockCount: number;
  mediaAssignments: Array<{ blockId: string; mediaIds: string[] }>;
  placements: Array<{ blockId: string; placement: EditorialBlock["placement"] }>;
};

export type LayoutDiversityLevel = "SAME" | "MINOR" | "SIGNIFICANT";

export type LayoutDiversityResult = {
  level: LayoutDiversityLevel;
  score: number;
  differences: string[];
};

export function getLayoutSignature(layout: EditorialLayout): LayoutSignature {
  const hero = layout.blocks.find(b => b.type === "HERO" && !b.hidden);
  const design = layout.design ?? defaultEditorialDesign;
  return {
    family: layout.family,
    variant: layout.variant,
    heroMediaId: hero?.mediaIds[0] ?? null,
    heroCrop: hero?.crop ?? "wide",
    heroComposition: layout.hero?.composition ?? layout.variant,
    heroFocal: `${hero?.focalX ?? 50},${hero?.focalY ?? 50}`,
    typography: design.typography,
    palette: design.palette,
    rhythm: design.rhythm,
    blockTypes: layout.blocks.filter(b => !b.hidden).map(b => b.type),
    blockCount: layout.blocks.filter(b => !b.hidden).length,
    mediaAssignments: layout.blocks.filter(b => !b.hidden && b.mediaIds.length).map(b => ({ blockId: b.id, mediaIds: [...b.mediaIds] })),
    placements: layout.blocks.filter(b => !b.hidden && b.placement).map(b => ({ blockId: b.id, placement: b.placement })),
  };
}

export function compareLayoutSignatures(current: LayoutSignature, proposed: LayoutSignature): LayoutDiversityResult {
  const differences: string[] = [];
  let score = 0;
  if (current.heroComposition !== proposed.heroComposition) {
    score += 3;
    differences.push("Đổi cách trình bày Hero");
  }

  if (current.family !== proposed.family) {
    score += 3;
    differences.push(`Đổi nhóm template (${current.family} → ${proposed.family})`);
  }

  if (current.variant !== proposed.variant) {
    score += 3;
    differences.push(`Đổi biến thể bố cục (${current.variant} → ${proposed.variant})`);
  }

  if (current.heroMediaId && proposed.heroMediaId && current.heroMediaId !== proposed.heroMediaId) {
    score += 3;
    differences.push("Đổi ảnh Hero chính");
  }

  if (current.heroCrop !== proposed.heroCrop) {
    score += 1.5;
    differences.push(`Đổi tỷ lệ crop Hero (${current.heroCrop} → ${proposed.heroCrop})`);
  }

  const [cx, cy] = current.heroFocal.split(",").map(Number);
  const [px, py] = proposed.heroFocal.split(",").map(Number);
  if (Math.abs((cx ?? 50) - (px ?? 50)) >= 15 || Math.abs((cy ?? 50) - (py ?? 50)) >= 15) {
    score += 1;
    differences.push("Điều chỉnh trọng tâm focal point Hero");
  }

  if (current.typography !== proposed.typography) {
    score += 1.5;
    differences.push(`Đổi kiểu chữ (${current.typography} → ${proposed.typography})`);
  }

  if (current.palette !== proposed.palette) {
    score += 1.5;
    differences.push(`Đổi sắc độ bảng màu (${current.palette} → ${proposed.palette})`);
  }

  if (current.rhythm !== proposed.rhythm) {
    score += 1;
    differences.push(`Đổi nhịp khoảng cách (${current.rhythm} → ${proposed.rhythm})`);
  }

  // Block types / composition changes:
  const currentTypes = current.blockTypes.join(",");
  const proposedTypes = proposed.blockTypes.join(",");
  if (currentTypes !== proposedTypes) {
    score += 1.5;
    differences.push("Thay đổi nhịp section ảnh và bài đọc");
  }

  // Image placement changes:
  let placementChanges = 0;
  for (const p of proposed.placements) {
    const cur = current.placements.find(c => c.blockId === p.blockId);
    if (cur && cur.placement !== p.placement) placementChanges++;
  }
  if (placementChanges > 0) {
    score += Math.min(placementChanges * 0.5, 1.5);
    differences.push(`Đổi vị trí hình ảnh ở ${placementChanges} section`);
  }

  // Media reassignment:
  let mediaMoved = 0;
  for (const m of proposed.mediaAssignments) {
    const cur = current.mediaAssignments.find(c => c.blockId === m.blockId);
    if (cur && JSON.stringify(cur.mediaIds) !== JSON.stringify(m.mediaIds)) mediaMoved++;
  }
  if (mediaMoved > 0) {
    score += Math.min(mediaMoved * 0.5, 1.5);
    differences.push(`Phân bổ lại ảnh phụ ở ${mediaMoved} block`);
  }

  let level: LayoutDiversityLevel = "SAME";
  if (score >= 3) {
    level = "SIGNIFICANT";
  } else if (score > 0) {
    level = "MINOR";
  }

  return { level, score, differences };
}
