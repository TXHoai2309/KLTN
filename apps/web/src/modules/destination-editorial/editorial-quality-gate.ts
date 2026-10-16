import type { EditorialLayout, EditorialContext } from "./editorial-contract";
import { compileEditorialLayout, type CompiledEditorialTree, type CompiledNode } from "./editorial-compiler";
import { buildCanonicalContentAst, type CanonicalContentAst } from "./editorial-ast";
import { normalizeEditorialText } from "./editorial-content";
import { getAllLayoutNodes } from "./editorial-engine";

export type QualityIssueCode =
  | "EMPTY_SECTION"
  | "DUPLICATE_HEADING"
  | "OVERSIZED_HEADING"
  | "DUPLICATE_MEDIA"
  | "MISSING_HERO"
  | "MULTIPLE_HERO"
  | "CONTENT_LOSS"
  | "IMBALANCED_MEDIA"
  | "GRID_TEXT_BALANCE"
  | "NARROW_PROSE"
  | "CONTRAST_RISK";

export type QualityIssue = {
  code: QualityIssueCode;
  message: string;
  severity: "ERROR" | "WARNING";
  nodeId?: string;
};

export type QualityReport = {
  passed: boolean;
  score: number; // 0 - 100
  issues: QualityIssue[];
  metrics: {
    sectionCount: number;
    nodeCount: number;
    mediaCount: number;
    wordCount: number;
    contentPreservationRatio: number;
    totalCanonicalParagraphs: number;
    preservedParagraphs: number;
    missingUnitIds: string[];
    missingUnitHashes: string[];
  };
};

/**
 * Evaluates an Editorial Layout against quality and aesthetic heuristics
 * to ensure that valid JSON also represents a readable, balanced publication.
 */
export function evaluateLayoutQuality(
  layout: EditorialLayout,
  context: EditorialContext,
  options: { ast?: CanonicalContentAst; compiled?: CompiledEditorialTree } = {}
): QualityReport {
  const ast = options.ast ?? buildCanonicalContentAst(context);
  const compiled = options.compiled ?? compileEditorialLayout(layout, context, { ast });

  const issues: QualityIssue[] = [];
  let score = 100;

  // 1. Hero Check
  const heroNodes = findAllNodes(compiled.nodes, n => n.type === "HERO");
  if (heroNodes.length === 0) {
    issues.push({ code: "MISSING_HERO", message: "Bố cục thiếu phần mở đầu Hero.", severity: "ERROR" });
    score -= 30;
  } else if (heroNodes.length > 1) {
    issues.push({ code: "MULTIPLE_HERO", message: "Có nhiều hơn 1 Hero trong cùng bố cục.", severity: "ERROR" });
    score -= 20;
  }

  // 2. Headings & Duplication Check
  const seenHeadings = new Set<string>();
  const headingNodes = findAllNodes(compiled.nodes, n => Boolean(n.title));
  for (const h of headingNodes) {
    const norm = normalizeEditorialText(h.title);
    if (!norm) continue;
    if (seenHeadings.has(norm)) {
      issues.push({
        code: "DUPLICATE_HEADING",
        message: `Tiêu đề "${h.title}" bị lặp lại trong bài viết.`,
        severity: "ERROR",
        nodeId: h.id,
      });
      score -= 15;
    } else {
      seenHeadings.add(norm);
    }

    if (h.title.length > 85 || norm.split(/\s+/).length > 12) {
      issues.push({
        code: "OVERSIZED_HEADING",
        message: `Tiêu đề "${h.title.slice(0, 30)}..." quá dài (> 12 từ hoặc > 85 ký tự).`,
        severity: "WARNING",
        nodeId: h.id,
      });
      score -= 5;
    }
  }

  // 3. Media Duplication Check
  const allMediaIds = compiled.nodes.flatMap(n => collectMediaIds(n));
  const seenMedia = new Set<string>();
  for (const mId of allMediaIds) {
    if (seenMedia.has(mId)) {
      issues.push({
        code: "DUPLICATE_MEDIA",
        message: `Hình ảnh ID "${mId}" xuất hiện nhiều hơn một lần trong bố cục.`,
        severity: "ERROR",
      });
      score -= 20;
    }
    seenMedia.add(mId);
  }

  // 4. Empty Section Check
  const rawNodes = getAllLayoutNodes(layout);
  for (const n of rawNodes) {
    if (["SECTION", "CONTAINER", "GRID", "COLUMNS"].includes(n.type)) {
      const anyChildren = (n as any).children?.length ?? 0;
      if (!anyChildren && !n.title && !n.text && !(n.mediaIds?.length)) {
        issues.push({
          code: "EMPTY_SECTION",
          message: `Khối cấu trúc ${n.type} (id: ${n.id}) hoàn toàn trống rỗng.`,
          severity: "ERROR",
          nodeId: n.id,
        });
        score -= 10;
      }
    }
  }

  // 5. Zero Content Loss & Content Preservation Ratio
  const allNodes = flattenNodes(compiled.nodes);
  const proseWeight = (node: CompiledNode): number => node.text.length + node.children.reduce((sum, child) => sum + proseWeight(child), 0);
  for (const node of allNodes) {
    if (!["GRID", "COLUMNS"].includes(node.type) || node.columns <= 1) continue;
    const weights = node.children.map(proseWeight);
    if (node.columns > 2 && weights.some(weight => weight > 160)) {
      issues.push({ code: "NARROW_PROSE", message: "Đoạn văn dài cần cột đọc rộng hơn.", severity: "ERROR", nodeId: node.id });
    }
    const totals = Array.from({ length: node.columns }, (_, col) => weights.filter((_, index) => index % node.columns === col).reduce((sum, weight) => sum + weight, 0));
    if (node.children.length < node.columns || (weights.some(weight => weight > 160) && !node.children.some(child => collectMediaIds(child).length) && Math.max(...totals) / Math.max(1, Math.min(...totals)) > 2.2)) {
      issues.push({ code: "GRID_TEXT_BALANCE", message: "Các cột nội dung mất cân đối.", severity: "ERROR", nodeId: node.id });
    }
  }
  const compiledProse = allNodes.map(n => [n.title, n.text, ...n.entries.flatMap(e => [e.label, e.text])].join(" ")).join(" ");
  const exactText = (text: string) => text.normalize("NFC").replace(/\s+/gu, " ").trim();
  const normCompiled = exactText(compiledProse);
  let preservedCount = 0;
  const canonicalParas = ast.units.filter(u => u.provenance.sourceField === "description");
  const missingUnitIds: string[] = [];
  const missingUnitHashes: string[] = [];

  for (const p of canonicalParas) {
    const pNorm = exactText(p.text);
    if (normCompiled.includes(pNorm) || !pNorm) {
      preservedCount++;
    } else {
      missingUnitIds.push(p.id);
      missingUnitHashes.push(p.hash);
    }
  }

  const preservationRatio = canonicalParas.length > 0 ? preservedCount / canonicalParas.length : 1;
  if (missingUnitIds.length > 0 || preservationRatio < 1.0) {
    issues.push({
      code: "CONTENT_LOSS",
      message: `Tỷ lệ bảo toàn nội dung chưa đạt 100% (${Math.round(preservationRatio * 100)}%). Thiếu ${missingUnitIds.length} đơn vị nội dung: [${missingUnitIds.join(", ")}].`,
      severity: "ERROR",
    });
    score -= 25;
  }

  // 6. Metrics Calculation
  const totalWords = compiledProse.split(/\s+/).filter(Boolean).length;
  const metrics = {
    sectionCount: compiled.nodes.length,
    nodeCount: allNodes.length,
    mediaCount: seenMedia.size,
    wordCount: totalWords,
    contentPreservationRatio: preservationRatio,
    totalCanonicalParagraphs: canonicalParas.length,
    preservedParagraphs: preservedCount,
    missingUnitIds,
    missingUnitHashes,
  };

  const finalScore = Math.max(0, Math.min(100, score));
  const hasErrors = issues.some(i => i.severity === "ERROR");

  return {
    passed: !hasErrors && finalScore >= 70,
    score: finalScore,
    issues,
    metrics,
  };
}

function findAllNodes(nodes: CompiledNode[], predicate: (n: CompiledNode) => boolean): CompiledNode[] {
  const result: CompiledNode[] = [];
  for (const n of nodes) {
    if (predicate(n)) result.push(n);
    if (n.children.length) result.push(...findAllNodes(n.children, predicate));
  }
  return result;
}

function flattenNodes(nodes: CompiledNode[]): CompiledNode[] {
  const result: CompiledNode[] = [];
  for (const n of nodes) {
    result.push(n);
    if (n.children.length) result.push(...flattenNodes(n.children));
  }
  return result;
}

function collectMediaIds(node: CompiledNode): string[] {
  const ids = [...node.mediaIds];
  for (const c of node.children) {
    ids.push(...collectMediaIds(c));
  }
  return ids;
}
