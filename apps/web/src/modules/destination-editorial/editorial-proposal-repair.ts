import "server-only";
import { editorialLayoutV2Schema, EDITORIAL_V2_MAX_ROOT_SECTIONS, EDITORIAL_V2_MAX_TOTAL_NODES, v2Typography, v2Palettes, v2Rhythms, containerWidths, type EditorialContext, type EditorialLayoutV2, type EditorialNodeV2 } from "./editorial-contract";
import { buildCanonicalContentAst } from "./editorial-ast";
import { getAllLayoutNodes, usableEditorialMedia, isEligibleEditorialSource, validateLayoutReferences } from "./editorial-engine";
import { stripMarkdownHeading } from "./editorial-content";
import { compileEditorialLayout } from "./editorial-compiler";
import { evaluateLayoutQuality } from "./editorial-quality-gate";
import { preservesEditorialNodeLocks } from "./editorial-locks";
import { preservesHeroLocks } from "./editorial-hero";
import { EditorialProposalError, editorialLayoutDiagnosticCounts } from "./editorial-ai-diagnostics";

/** Presentation labels carry no new historical claim. Everything else is extractive. */
export const neutralEditorialTitles = ["Dấu ấn lịch sử", "Không gian văn hóa", "Những câu chuyện được lưu truyền", "Hành trình khám phá", "Giá trị của di sản"];
export const utilityEditorialTitles = ["Nguồn tham khảo", "Tài liệu lưu trữ & Nguồn tham khảo", "Vị trí tham chiếu", "Điểm nhấn"];
export type ProposalRepair = { code: string; nodePath: string };
const exact = (s: string) => s.normalize("NFC").replace(/\s+/gu, " ").trim();
const containers = new Set(["PAGE", "SECTION", "GRID", "COLUMNS", "STACK", "CONTAINER", "IMAGE_TEXT"]);
const mediaRoles = new Set(["HERO", "IMAGE", "PANORAMA", "GALLERY", "IMAGE_MOSAIC"]);
const textRoles = new Set(["HEADING", "PARAGRAPH", "LEAD", "QUOTE", "IMAGE", "PANORAMA", "GALLERY", "IMAGE_MOSAIC"]);
const nodeKeys = new Set(["id", "type", "hidden", "locked", "contentRef", "title", "text", "caption", "deck", "emphasis", "headingProvenance", "mediaIds", "sourceIds", "columns", "columnRatio", "gap", "aspectRatio", "crop", "placement", "gallery", "focalX", "focalY", "entries", "children"]);

/** Strict JSON/shape boundary, then bounded, deterministic repairs. Never writes data. */
export function repairEditorialProposal(raw: string, base: EditorialLayoutV2, context: EditorialContext, direction: "KEEP" | "AUTO" = "AUTO"): EditorialLayoutV2 {
  const fail = (code: "SCHEMA" | "LAYOUT_CONTRACT" | "DIRECTION", path: (string | number)[], issueCode: string, stage: "WIRE_SCHEMA" | "TREE_CONTRACT" | "HYDRATION" | "LOCKS" | "QUALITY_GATE" = "WIRE_SCHEMA", limitCounts?: ReturnType<typeof editorialLayoutDiagnosticCounts>): never => {
    throw new EditorialProposalError(code, path, { validationStage: stage, issueCode, ...(limitCounts ? { limitCounts } : {}) });
  };
  if (Buffer.byteLength(raw) > 64 * 1024) throw new EditorialProposalError("OUTPUT_SIZE");
  let data: any;
  try { data = JSON.parse(raw); } catch { throw new EditorialProposalError("JSON_PARSE"); }
  if (!data || typeof data !== "object" || Array.isArray(data) || data.schemaVersion !== 2 || !Array.isArray(data.sections)) fail("SCHEMA", [], "INVALID_ENVELOPE");
  const repairs: ProposalRepair[] = [];
  const record = (code: string, path: (string | number)[]) => { if (repairs.length < 200) repairs.push({ code, nodePath: path.join(".") || "$" }); };
  const ast = buildCanonicalContentAst(context);
  const units = ast.units.filter(u => u.provenance.sourceField === "description");
  const originalNodes = getAllLayoutNodes(base) as EditorialNodeV2[];
  const allowedMedia = new Set(usableEditorialMedia(context).map(m => m.id));
  const sources = context.sources.filter(isEligibleEditorialSource).map(s => s.id);
  const allIds = new Set<string>();
  let count = 0;
  const identity = (preferred: string) => { let id = preferred, suffix = 0; while (allIds.has(id)) id = `${preferred.slice(0, 115)}-${++suffix}`; allIds.add(id); return id; };
  const grounded = (s: string) => !s || [context.description, context.name, context.category, context.area, ...units.flatMap(u => [u.text, u.title ?? ""])].some(source => exact(source).includes(exact(s)));
  // An excerpt of a legend can lose its qualifying language. New body copy must
  // be complete canonical units, never a plausible substring of the source.
  const canonicalProse = (s: string) => !s || exact(s) === exact(context.description) || s.split(/\n\s*\n/).every(part => units.some(u => exact(u.text) === exact(part)));
  const safeTitle = (s: string) => grounded(s) || neutralEditorialTitles.includes(s) || utilityEditorialTitles.includes(s);

  // Bound untrusted recursion before parsing recursive Zod. Unknown keys and
  // markup remain errors, even if their owning node would later be downgraded.
  const normalize = (n: any, path: (string | number)[], depth: number): any => {
    if (!n || typeof n !== "object" || Array.isArray(n)) fail("SCHEMA", path, "INVALID_NODE");
    if (++count > EDITORIAL_V2_MAX_TOTAL_NODES) fail("SCHEMA", path, "NODE_LIMIT", "TREE_CONTRACT", editorialLayoutDiagnosticCounts(data));
    if (depth > 3) fail("SCHEMA", path, "DEPTH_LIMIT", "TREE_CONTRACT");
    for (const key of Object.keys(n)) if (!nodeKeys.has(key)) fail("SCHEMA", [...path, key], "unrecognized_keys");
    for (const key of ["title", "text", "caption", "deck"]) {
      if (n[key] == null) { if (n[key] === null) record("NULLABLE_DEFAULT", [...path, key]); n[key] = ""; }
      if (typeof n[key] !== "string") fail("SCHEMA", [...path, key], "invalid_type");
      if (/<\/?[a-z][^>]*>/i.test(n[key])) fail("SCHEMA", [...path, key], "EXECUTABLE_MARKUP");
    }
    for (const key of ["mediaIds", "sourceIds", "entries", "children"]) {
      if (n[key] == null) n[key] = [];
      if (!Array.isArray(n[key])) fail("SCHEMA", [...path, key], "invalid_type");
    }
    if (n.children.length > 10 || n.entries.length > 20 || n.mediaIds.length > 12) fail("SCHEMA", path, "ARRAY_LIMIT");
    if (n.hidden == null) n.hidden = false;
    if (n.locked == null) n.locked = false;
    if (!n.id) { n.id = identity(`repaired-${count}`); record("NODE_ID_RESTORED", [...path, "id"]); }
    else if (typeof n.id === "string") {
      if (allIds.has(n.id)) { n.id = identity(n.id); record("DUPLICATE_ID_REPAIRED", [...path, "id"]); } else allIds.add(n.id);
    }
    for (const [key, values, fallback] of [
      ["emphasis", ["STANDARD", "FEATURED", "ACCENT", "SUBTLE"], "STANDARD"],
      ["crop", ["wide", "portrait", "square", "original"], "original"],
      ["placement", ["left", "right", "full", "center"], "right"],
      ["gallery", ["mosaic", "grid", "strip", "masonry"], "grid"],
      ["gap", ["NONE", "SMALL", "MEDIUM", "LARGE"], "MEDIUM"],
      ["columnRatio", ["EQUAL", "TEXT_WIDE", "MEDIA_WIDE"], "TEXT_WIDE"],
      ["aspectRatio", ["16:9", "4:3", "3:2", "1:1", "4:5", "3:4", "21:9", "AUTO"], "AUTO"],
    ] as const) if (n[key] == null || !values.some(v => v === n[key])) { const before = n[key]; n[key] = fallback; if (before != null) record("PRESENTATION_DEFAULT", [...path, key]); }
    for (const [key, fallback, min, max] of [["columns", 1, 1, 4], ["focalX", 50, 0, 100], ["focalY", 50, 0, 100]] as const) {
      const before = n[key]; n[key] = typeof before === "number" && Number.isFinite(before) ? Math.max(min, Math.min(max, key === "columns" ? Math.round(before) : before)) : fallback;
      if (before != null && before !== n[key]) record("PRESENTATION_DEFAULT", [...path, key]);
    }
    n.children = n.children.map((child: any, i: number) => normalize(child, [...path, "children", i], depth + 1));
    for (const [i, entry] of n.entries.entries()) {
      if (!entry || typeof entry.label !== "string" || typeof entry.text !== "string" || /<\/?[a-z][^>]*>/i.test(entry.label + entry.text)) fail("SCHEMA", [...path, "entries", i], "INVALID_ENTRY");
    }
    return n;
  };
  if (data.sections.length > EDITORIAL_V2_MAX_ROOT_SECTIONS) fail("SCHEMA", ["sections"], "SECTION_LIMIT", "WIRE_SCHEMA", editorialLayoutDiagnosticCounts(data));
  data.sections = data.sections.map((n: any, i: number) => normalize(n, ["sections", i], 1));
  if (data.design == null) { data.design = base.design; record("PRESENTATION_DEFAULT", ["design"]); }
  if (data.design && typeof data.design === "object" && !Array.isArray(data.design)) {
    for (const [key, choices, fallback] of [["typography", v2Typography, "LITERARY"], ["palette", v2Palettes, "FOREST"], ["rhythm", v2Rhythms, "COMPACT"], ["containerWidth", containerWidths, "STANDARD"]] as const) {
      if (!choices.some(value => value === data.design[key])) { data.design[key] = fallback; record("PRESENTATION_DEFAULT", ["design"]); }
    }
  }
  if (data.mode == null) data.mode = "GENERATIVE";
  if (data.family === null) delete data.family;
  if (data.variant === null) delete data.variant;
  if (direction === "KEEP") { data.family = base.family; data.variant = base.variant; }

  // Restore topmost manual/hidden subtrees verbatim. These may never be repaired
  // by overwriting the Admin's text, including an omitted locked descendant.
  const protectedNodes: EditorialNodeV2[] = [];
  const protect = (nodes: EditorialNodeV2[]) => { for (const n of nodes) { if (n.locked || n.hidden) protectedNodes.push(n); else protect(n.children ?? []); } };
  protect(base.sections);
  const replace = (nodes: any[], original: EditorialNodeV2): boolean => {
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].id === original.id) { nodes[i] = structuredClone(original); return true; }
      if (replace(nodes[i].children ?? [], original)) return true;
    } return false;
  };
  for (const n of protectedNodes) {
    if (!replace(data.sections, n)) data.sections.push(structuredClone(n));
    record("MANUAL_SUBTREE_RESTORED", ["sections"]);
  }
  (getAllLayoutNodes(data) as EditorialNodeV2[]).forEach(n => allIds.add(n.id));
  if (base.hero?.locked || base.hero?.focalLocked) {
    data.hero = structuredClone(base.hero);
    if (base.hero.focalLocked) {
      const old = originalNodes.find(n => n.type === "HERO");
      const next = (getAllLayoutNodes(data) as EditorialNodeV2[]).find(n => n.type === "HERO");
      if (old && next) for (const key of ["mediaIds", "crop", "focalX", "focalY"] as const) (next as any)[key] = structuredClone(old[key]);
    }
    record("HERO_LOCK_RESTORED", ["hero"]);
  }
  const protectedIds = new Set<string>();
  const protectedMedia = new Set<string>();
  const markProtected = (n: EditorialNodeV2) => { protectedIds.add(n.id); (n.mediaIds ?? []).forEach(id => protectedMedia.add(id)); n.children?.forEach(markProtected); };
  protectedNodes.forEach(markProtected);
  if (base.hero?.focalLocked) originalNodes.find(n => n.type === "HERO")?.mediaIds?.forEach(id => protectedMedia.add(id));
  const seenMedia = new Set<string>(), seenText = new Set<string>();
  const seenTitles = new Set<string>();
  const seenRefs = new Set<string>();
  const reviewedTimelines: EditorialNodeV2[] = [];
  const hiddenCanonical = new Set<string>();
  const seedProtected = (n: EditorialNodeV2, hidden = false) => {
    const invisible = hidden || Boolean(n.hidden);
    for (const u of units) if (n.contentRef === u.id || (n.text && exact(n.text).includes(exact(u.text)))) {
      if (invisible) hiddenCanonical.add(u.id); else { seenRefs.add(u.id); if (n.text) seenText.add(exact(n.text)); }
    }
    n.children?.forEach(child => seedProtected(child, invisible));
  };
  protectedNodes.forEach(n => seedProtected(n));
  const repair = (n: any, path: (string | number)[]) => {
    const original = originalNodes.find(node => node.id === n.id);
    if (protectedIds.has(n.id)) return;
    if (n.locked) { n.locked = false; record("AI_LOCK_REMOVED", [...path, "locked"]); }
    if (n.hidden) { n.hidden = false; record("AI_HIDDEN_REMOVED", [...path, "hidden"]); }
    if (!safeTitle(n.title)) record("TITLE_NORMALIZED", [...path, "title"]);
    const allowed = n.mediaIds.filter((id: unknown) => typeof id === "string" && allowedMedia.has(id) && (!protectedMedia.has(id) || n.type === "HERO" && base.hero?.focalLocked) && !seenMedia.has(id) && Boolean(seenMedia.add(id)));
    if (allowed.length !== n.mediaIds.length) record("MEDIA_REFERENCE_REMOVED", [...path, "mediaIds"]);
    n.mediaIds = allowed;
    const unit = units.find(u => u.id === n.contentRef)
      ?? units.find(u => exact(u.text) === exact(n.text) && Boolean(n.text))
      ?? (n.contentRef ? units.find(u => u.id === original?.contentRef) : undefined);
    if (unit && n.contentRef !== unit.id) { record("CONTENT_REF_RECOVERED", [...path, "contentRef"]); n.contentRef = unit.id; }
    if (!unit && n.contentRef) { n.contentRef = null; record("CONTENT_REF_REMOVED", [...path, "contentRef"]); }

    if (n.entries.length) {
      const reviewed = n.entries.filter((entry: any) => originalNodes.some(node => (node.entries ?? []).some(e => e.label === entry.label && e.text === entry.text && e.sourceIds.length > 0 && e.sourceIds.every(id => sources.includes(id)) && JSON.stringify(e.sourceIds) === JSON.stringify(entry.sourceIds))));
      if (reviewed.length !== n.entries.length) {
        // Only canonical prose is narrated; fabricated dates/labels never survive.
        const narrative = n.entries.flatMap((e: any) => units.filter(u => exact(u.text) === exact(e.text)).map(u => u.text));
        if (!reviewed.length && !n.text && narrative.length) n.text = [...new Set(narrative)].join("\n\n");
        record("UNVERIFIED_EVENT_DOWNGRADED", [...path, "entries"]);
      }
      n.entries = reviewed;
    }
    if (n.type === "TIMELINE" && !n.entries.length) { n.type = "SECTION"; record("TIMELINE_TO_NARRATIVE", path); }
    if (n.type !== "TIMELINE" && n.entries.length) { n.type = "TIMELINE"; }
    if (unit) {
      if (seenRefs.has(unit.id)) { n.contentRef = null; n.text = ""; n.title = ""; record("DUPLICATE_CONTENT_REMOVED", path); }
      else {
        seenRefs.add(unit.id);
        n.text = unit.type === "CHAPTER_HEADING" ? "" : unit.text;
        if (unit.type === "CHAPTER_HEADING") n.title = stripMarkdownHeading(unit.title ?? unit.text);
      }
      if (n.type === "HEADING" && unit.type !== "CHAPTER_HEADING") { n.type = "PARAGRAPH"; record("PRIMITIVE_DOWNGRADED", path); }
    } else if (original?.text && !original.contentRef && !grounded(original.text)) {
      n.text = original.text; record("MANUAL_TEXT_RESTORED", [...path, "text"]);
    } else if (!canonicalProse(n.text) && n.text !== original?.text) { n.text = ""; record("UNSOURCED_TEXT_REMOVED", [...path, "text"]); }
    if (!unit && n.text) {
      const parts = n.text.split(/\n\s*\n/);
      if (parts.every((part: string) => units.some(u => exact(u.text) === exact(part)))) {
        n.text = parts.filter((part: string) => {
          const id = units.find(u => exact(u.text) === exact(part))!.id;
          if (seenRefs.has(id)) { record("DUPLICATE_CONTENT_REMOVED", [...path, "text"]); return false; }
          seenRefs.add(id); return true;
        }).join("\n\n");
      }
    }
    const relatedHeading = unit && units.find(u => u.id === `ast-chapter-${unit.id.match(/^ast-para-(\d+)-/)?.[1]}`);
    if (original?.title && !safeTitle(original.title)) n.title = original.title;
    else if (!safeTitle(n.title)) n.title = relatedHeading?.title ?? relatedHeading?.text ?? "";
    if (n.type === "HERO" && !n.title) n.title = context.name;
    const headingUnit = n.title && units.find(u => u.type === "CHAPTER_HEADING" && exact(u.text) === exact(n.title));
    if (headingUnit && headingUnit.id !== unit?.id) {
      if (seenRefs.has(headingUnit.id)) { n.title = ""; record("DUPLICATE_CONTENT_REMOVED", [...path, "title"]); }
      else seenRefs.add(headingUnit.id);
    }
    if (n.title && n.type !== "HERO") {
      const normTitle = exact(n.title);
      if (seenTitles.has(normTitle)) {
        n.title = "";
        record("TITLE_NORMALIZED", [...path, "title"]);
      } else {
        seenTitles.add(normTitle);
      }
    }
    if (n.title && n.text && exact(stripMarkdownHeading(n.text)) === exact(stripMarkdownHeading(n.title))) {
      n.text = "";
      record("DUPLICATE_CONTENT_REMOVED", [...path, "text"]);
    }
    if (n.text && seenText.has(exact(n.text))) { n.text = ""; n.contentRef = null; record("DUPLICATE_CONTENT_REMOVED", [...path, "text"]); }
    else if (n.text) seenText.add(exact(n.text));
    for (const field of ["deck", "caption"] as const) {
      const imageCaption = field === "caption" && usableEditorialMedia(context).some(m => n.mediaIds.includes(m.id) && m.caption === n[field]);
      if (!grounded(n[field]) && n[field] !== original?.[field] && !imageCaption) { n[field] = ""; record("UNSOURCED_TEXT_REMOVED", [...path, field]); }
    }
    const preservedClaim = original?.text === n.text && JSON.stringify(original?.sourceIds ?? []) === JSON.stringify(n.sourceIds);
    if (n.type === "SOURCES") { n.sourceIds = sources.slice(0, 10); n.title = "Nguồn tham khảo"; record("SOURCES_HYDRATED", [...path, "sourceIds"]); }
    else {
      const clean = preservedClaim ? n.sourceIds.filter((id: string) => sources.includes(id)) : [];
      if (JSON.stringify(clean) !== JSON.stringify(n.sourceIds)) record("SOURCE_REFERENCE_REMOVED", [...path, "sourceIds"]);
      n.sourceIds = clean;
    }
    if (n.entries.length && (n.text || n.children.length || n.mediaIds.length)) {
      reviewedTimelines.push({ id: identity("reviewed-events"), type: "TIMELINE", entries: n.entries });
      n.entries = []; n.type = "SECTION"; record("PRIMITIVE_DOWNGRADED", path);
    }
    if ((n.children.length && !containers.has(n.type)) || (n.text && !containers.has(n.type) && !textRoles.has(n.type)) || (n.mediaIds.length && !containers.has(n.type) && !mediaRoles.has(n.type))) {
      n.type = "SECTION"; record("PRIMITIVE_DOWNGRADED", path);
    }
    if (["HERO", "IMAGE", "PANORAMA", "IMAGE_TEXT"].includes(n.type) && n.mediaIds.length > 1) { n.type = "SECTION"; record("PRIMITIVE_DOWNGRADED", path); }
    if (n.type !== "SOURCES" && !preservedClaim && n.sourceIds.length) { n.sourceIds = []; record("SOURCE_REFERENCE_REMOVED", [...path, "sourceIds"]); }
    if (n.headingProvenance && (!original || JSON.stringify(n.headingProvenance) !== JSON.stringify(original.headingProvenance) || n.title !== n.headingProvenance.excerpt || n.id !== n.headingProvenance.blockId)) {
      delete n.headingProvenance; record("HEADING_REFERENCE_REMOVED", [...path, "title"]);
    }
    n.children.forEach((child: any, i: number) => repair(child, [...path, "children", i]));
  };
  data.sections.forEach((n: any, i: number) => repair(n, ["sections", i]));
  const prune = (list: any[]): any[] => list.filter(n => {
    if (protectedIds.has(n.id)) return true;
    n.children = prune(n.children ?? []);
    const keep = n.title || n.text || n.mediaIds?.length || n.entries?.length || n.children.length || ["HERO", "FACTS", "MAP", "SOURCES"].includes(n.type);
    if (!keep) record("EMPTY_NODE_REMOVED", ["sections"]);
    return Boolean(keep);
  });
  data.sections = prune(data.sections);
  let hero: any;
  const normalizeHero = (nodes: any[], depth: number) => { for (const n of nodes) { if (n.type === "HERO" && !n.hidden) { if (!hero && depth === 1) hero = n; else if (!protectedIds.has(n.id)) { n.type = "SECTION"; record("PRIMITIVE_DOWNGRADED", ["sections"]); } } normalizeHero(n.children ?? [], depth + 1); } };
  normalizeHero(data.sections, 1);
  if (!hero) {
    hero = structuredClone(originalNodes.find(n => n.type === "HERO" && !n.hidden) ?? { id: identity("repaired-hero"), type: "HERO", title: context.name });
    if ((getAllLayoutNodes(data) as EditorialNodeV2[]).some(n => n.id === hero.id)) hero.id = identity("repaired-hero");
    hero.mediaIds = (hero.mediaIds ?? []).filter((id: string) => allowedMedia.has(id));
    for (const n of getAllLayoutNodes(data) as EditorialNodeV2[]) if (!protectedIds.has(n.id)) n.mediaIds = (n.mediaIds ?? []).filter(id => !hero.mediaIds.includes(id));
    record("HERO_RESTORED", ["sections"]);
  }
  data.sections = [hero, ...data.sections.filter((n: any) => n !== hero)];
  data.sections.push(...reviewedTimelines);

  const countAllNodes = (nodes: any[]): number =>
    nodes.reduce((acc, n) => acc + 1 + countAllNodes(n.children ?? []), 0);

  const compactTree = () => {
    const unwrap = (nodes: any[]): any[] => {
      return nodes.map(n => {
        n.children = unwrap(n.children ?? []);
        if (
          !protectedIds.has(n.id) &&
          ["STACK", "CONTAINER", "SECTION"].includes(n.type) &&
          !n.title && !n.text && !n.mediaIds?.length && !n.entries?.length &&
          n.children.length === 1 &&
          !protectedIds.has(n.children[0].id)
        ) {
          record("EMPTY_NODE_REMOVED", ["sections"]);
          return n.children[0];
        }
        return n;
      });
    };
    data.sections = unwrap(data.sections);

    if (countAllNodes(data.sections) > EDITORIAL_V2_MAX_TOTAL_NODES) {
      const mergeText = (nodes: any[]) => {
        for (const n of nodes) {
          if (n.children?.length > 1) {
            const nextChildren: any[] = [];
            for (let i = 0; i < n.children.length; i++) {
              const curr = n.children[i];
              const prev = nextChildren.at(-1);
              if (
                prev &&
                !protectedIds.has(prev.id) &&
                !protectedIds.has(curr.id) &&
                ["PARAGRAPH", "SECTION"].includes(prev.type) &&
                ["PARAGRAPH", "SECTION"].includes(curr.type) &&
                !prev.mediaIds?.length && !curr.mediaIds?.length &&
                !prev.entries?.length && !curr.entries?.length &&
                !prev.children?.length && !curr.children?.length &&
                (prev.text?.length ?? 0) + (curr.text?.length ?? 0) + 2 <= 12000
              ) {
                prev.text = [prev.text, curr.text].filter(Boolean).join("\n\n");
                if (!prev.title && curr.title) prev.title = curr.title;
                record("DUPLICATE_CONTENT_REMOVED", ["sections"]);
              } else {
                nextChildren.push(curr);
              }
            }
            n.children = nextChildren;
          }
          mergeText(n.children ?? []);
        }
      };
      mergeText(data.sections);
    }
  };
  compactTree();

  const deduplicateNodeIds = () => {
    const seen = new Set<string>();
    const walk = (nodes: any[], path: (string | number)[]) => {
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (!node || typeof node !== "object") continue;
        if (!node.id || seen.has(node.id)) {
          const oldId = typeof node.id === "string" && node.id ? node.id : "repaired-node";
          node.id = identity(oldId);
          record("DUPLICATE_ID_REPAIRED", [...path, i, "id"]);
        }
        seen.add(node.id);
        if (Array.isArray(node.children)) walk(node.children, [...path, i, "children"]);
      }
    };
    if (Array.isArray(data.sections)) walk(data.sections, ["sections"]);
  };

  const deduplicateMedia = () => {
    const seenMedia = new Set<string>();
    const walk = (nodes: any[], path: (string | number)[]) => {
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (!node || typeof node !== "object") continue;
        if (Array.isArray(node.mediaIds) && !node.hidden) {
          const originalCount = node.mediaIds.length;
          node.mediaIds = node.mediaIds.filter((id: unknown) => typeof id === "string" && !seenMedia.has(id) && Boolean(seenMedia.add(id)));
          if (node.mediaIds.length !== originalCount) {
            record("MEDIA_REFERENCE_REMOVED", [...path, i, "mediaIds"]);
          }
        }
        if (Array.isArray(node.children)) walk(node.children, [...path, i, "children"]);
      }
    };
    if (Array.isArray(data.sections)) walk(data.sections, ["sections"]);
  };

  const parse = () => {
    deduplicateNodeIds();
    deduplicateMedia();
    const result = editorialLayoutV2Schema.safeParse(data);
    if (!result.success) { const issue = result.error.issues[0]!; fail("SCHEMA", issue.path as (string | number)[], issue.code === "custom" ? String(issue.params?.issueCode ?? issue.code) : issue.code, "TREE_CONTRACT"); }
    return result.data!;
  };
  let proposal = parse();
  // Preserve manual text even if a model omits its node. It is not an AST unit.
  for (const n of originalNodes.filter(n => !n.hidden && !n.contentRef && n.text && !grounded(n.text))) {
    if (!(getAllLayoutNodes(proposal) as EditorialNodeV2[]).some(candidate => candidate.text === n.text)) {
      if (data.sections.length < EDITORIAL_V2_MAX_ROOT_SECTIONS) {
        data.sections.push(structuredClone(n));
      } else {
        const target = (getAllLayoutNodes(data) as EditorialNodeV2[]).find(cand => !protectedIds.has(cand.id) && containers.has(cand.type));
        if (target) target.text = [target.text, n.text].filter(Boolean).join("\n\n");
      }
      record("MANUAL_TEXT_RESTORED", ["sections"]);
    }
  }
  proposal = parse();
  const compiled = compileEditorialLayout(proposal, context, { ast });
  const missing = evaluateLayoutQuality(proposal, context, { ast, compiled }).metrics.missingUnitIds;
  if (missing.some(id => hiddenCanonical.has(id))) fail("DIRECTION", ["sections"], "HIDDEN_CONTENT_CONFLICT", "LOCKS");
  const missingUnits = units.filter(u => missing.includes(u.id));
  const recovered: EditorialNodeV2[] = missingUnits.map(u => ({ id: identity(`recovered-${u.id}`), type: (u.type === "CHAPTER_HEADING" ? "HEADING" : "PARAGRAPH") as EditorialNodeV2["type"], contentRef: u.id, title: u.type === "CHAPTER_HEADING" ? u.title ?? u.text : "", text: u.type === "CHAPTER_HEADING" ? "" : u.text }));
  // Pack missing units into bounded narrative sections rather than dropping any.
  const remainingNodes = EDITORIAL_V2_MAX_TOTAL_NODES - getAllLayoutNodes(proposal).length;
  if (recovered.length + Math.ceil(recovered.length / 10) > remainingNodes) {
    const chunks: string[] = [];
    for (const u of missingUnits) {
      if (u.text.length > 12000) fail("LAYOUT_CONTRACT", ["content"], "CANONICAL_UNIT_TOO_LARGE");
      if (chunks.length && chunks.at(-1)!.length + u.text.length + 2 <= 12000) chunks[chunks.length - 1] += `\n\n${u.text}`;
      else chunks.push(u.text);
    }
    for (const text of chunks) {
      const target = (getAllLayoutNodes(data) as EditorialNodeV2[]).find(n => !protectedIds.has(n.id) && !n.hidden && containers.has(n.type) && !n.sourceIds?.length && !n.entries?.length && (n.text?.length ?? 0) + text.length + 2 <= 12000);
      if (target) { target.text = [target.text, text].filter(Boolean).join("\n\n"); target.contentRef = null; }
      else if (data.sections.length < EDITORIAL_V2_MAX_ROOT_SECTIONS) { data.sections.push({ id: identity("recovered-content"), type: "SECTION", text }); }
      record("CANONICAL_CONTENT_RESTORED", ["sections"]);
    }
  } else for (let i = 0; i < recovered.length; i += 10) {
    if (data.sections.length >= EDITORIAL_V2_MAX_ROOT_SECTIONS) {
      const target = (getAllLayoutNodes(data) as EditorialNodeV2[]).find(n => !protectedIds.has(n.id) && !n.hidden && containers.has(n.type) && (n.children?.length ?? 0) < 10);
      if (target) {
        target.children = [...(target.children ?? []), ...recovered.slice(i, i + 10)];
        record("CANONICAL_CONTENT_RESTORED", ["sections"]);
        continue;
      }
    }
    const index = data.sections.findIndex((n: any) => ["MAP", "SOURCES"].includes(n.type));
    data.sections.splice(index < 0 ? data.sections.length : index, 0, { id: identity("recovered-content"), type: "SECTION", children: recovered.slice(i, i + 10) });
    record("CANONICAL_CONTENT_RESTORED", ["sections"]);
  }
  const used = new Set((getAllLayoutNodes(data) as EditorialNodeV2[]).flatMap(n => n.mediaIds ?? []));
  const missingMedia = usableEditorialMedia(context).filter(m => !used.has(m.id));
  for (let i = 0; i < missingMedia.length; i += 12) {
    if (data.sections.length < EDITORIAL_V2_MAX_ROOT_SECTIONS) {
      data.sections.push({ id: identity("recovered-media"), type: "GALLERY", crop: "original", mediaIds: missingMedia.slice(i, i + 12).map(m => m.id) });
    } else {
      const target = (getAllLayoutNodes(data) as EditorialNodeV2[]).find(n => !protectedIds.has(n.id) && ["GALLERY", "IMAGE_MOSAIC"].includes(n.type) && (n.mediaIds?.length ?? 0) < 12);
      if (target) target.mediaIds = [...(target.mediaIds ?? []), ...missingMedia.slice(i, i + 12).map(m => m.id)].slice(0, 12);
    }
    record("CANONICAL_MEDIA_RESTORED", ["sections"]);
  }
  const listedSources = new Set((getAllLayoutNodes(data) as EditorialNodeV2[]).filter(n => n.type === "SOURCES").flatMap(n => n.sourceIds ?? []));
  const missingSources = sources.filter(id => !listedSources.has(id));
  for (let i = 0; i < missingSources.length; i += 10) {
    if (data.sections.length < EDITORIAL_V2_MAX_ROOT_SECTIONS) {
      data.sections.push({ id: identity("recovered-sources"), type: "SOURCES", title: "Nguồn tham khảo", sourceIds: missingSources.slice(i, i + 10) });
    } else {
      const target = (getAllLayoutNodes(data) as EditorialNodeV2[]).find(n => n.type === "SOURCES" && (n.sourceIds?.length ?? 0) < 10);
      if (target) target.sourceIds = [...(target.sourceIds ?? []), ...missingSources.slice(i, i + 10)].slice(0, 10);
    }
    record("SOURCES_HYDRATED", ["sections"]);
  }
  proposal = parse();
  if (!preservesEditorialNodeLocks(base, proposal) || !preservesHeroLocks(base, proposal)) fail("DIRECTION", ["sections"], "MANUAL_LOCK", "LOCKS");
  // Independent hard gates run AFTER repair; no best-effort pass on missing data.
  try { validateLayoutReferences(proposal, context, false); validateLayoutReferences(proposal, context, true); }
  catch { fail("LAYOUT_CONTRACT", ["sections"], "UNSAFE_REFERENCE", "HYDRATION"); }
  const quality = evaluateLayoutQuality(proposal, context, { ast });
  if (quality.metrics.contentPreservationRatio !== 1) fail("LAYOUT_CONTRACT", ["content"], "CONTENT_LOSS", "QUALITY_GATE");
  if (!compileEditorialLayout(proposal, context, { ast }).nodes.length) fail("LAYOUT_CONTRACT", ["sections"], "EMPTY_TREE");
  return { ...proposal, metadata: { generatedAt: new Date().toISOString(), qualityScore: quality.score, repairs } };
}
