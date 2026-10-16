import { editorialLayoutSchema, isV1Layout, isV2Layout, type EditorialContext, type EditorialLayout, type EditorialNodeV2 } from "./editorial-contract";
import { compileEditorialLayout } from "./editorial-compiler";
import { preservesEditorialNodeLocks } from "./editorial-locks";
import { getAllLayoutNodes, usableEditorialMedia, validateLayoutReferences } from "./editorial-engine";
import { isShortEditorialHeading } from "./editorial-content";
import { compareLayoutSignatures, getLayoutSignature } from "./editorial-signature";
import { preservesHeroLocks } from "./editorial-hero";

/** Client-side atomic commit gate. HTTP success alone never changes local work. */
export function acceptedEditorialProposal<T extends EditorialLayout>(
  data: unknown,
  current: T,
  context: EditorialContext,
  direction: "KEEP" | "AUTO",
  mode: "PROPOSE" | "ALTERNATIVE" = "PROPOSE"
): T | null {
  if (!data || typeof data !== "object" || !("status" in data) || data.status !== "PROPOSED" || !("layout" in data)) return null;
  if ("outcome" in data && data.outcome !== "PROPOSED" && data.outcome !== "PROPOSED_NEW" && data.outcome !== "ALTERNATIVE_SIGNIFICANT") return null;
  const result = editorialLayoutSchema.safeParse(data.layout);
  if (!result.success) return null;
  const next = result.data;
  if (!preservesHeroLocks(current, next)) return null;
  if (!preservesEditorialNodeLocks(current, next)) return null;
  if (isV2Layout(current) && isV2Layout(next) && direction === "KEEP" && (current.family !== next.family || current.variant !== next.variant)) return null;

  if (isV1Layout(current) && isV1Layout(next)) {
    if (direction === "KEEP" && (next.family !== current.family || next.variant !== current.variant)) return null;
    if (next.blocks.length !== current.blocks.length) return null;
    const allowed = new Set(usableEditorialMedia(context).map(m => m.id));
    for (const b of next.blocks) {
      const before = current.blocks.find(v => v.id === b.id);
      if (!before || b.text !== before.text || b.caption !== before.caption ||
        JSON.stringify(b.sourceIds) !== JSON.stringify(before.sourceIds) || JSON.stringify(b.entries) !== JSON.stringify(before.entries) ||
        (before.hidden && !b.hidden) || b.mediaIds.some(id => !allowed.has(id))) return null;
      if (b.type !== before.type && !(["TEXT_SECTION", "IMAGE_TEXT_SPLIT"].includes(before.type) && ["TEXT_SECTION", "IMAGE_TEXT_SPLIT"].includes(b.type))) return null;
      if (b.title && b.title !== before.title && (before.type === "HERO" ? b.title !== context.name : !before.text.includes(b.title) || !isShortEditorialHeading(b.title, before.text))) return null;
      if (b.hidden && !before.hidden && (before.title || before.text || before.mediaIds.length || before.sourceIds.length || before.entries.length || ["HERO", "HIGHLIGHT_FACTS", "MAP", "VISIT_INFORMATION"].includes(before.type))) return null;
    }
  } else {
    const allowed = new Set(usableEditorialMedia(context).map(m => m.id));
    const nodes = getAllLayoutNodes(next);
    if (nodes.some(n => (n.mediaIds ?? []).some(id => !allowed.has(id)))) return null;
  }

  if (mode === "ALTERNATIVE") {
    const effective = (layout: EditorialLayout) => isV2Layout(layout)
      ? { ...layout, sections: compileEditorialLayout(layout, context).nodes as EditorialNodeV2[] } : layout;
    const diff = compareLayoutSignatures(getLayoutSignature(effective(current)), getLayoutSignature(effective(next)));
    if (diff.level !== "SIGNIFICANT") return null;
  }
  try { validateLayoutReferences(next, context, false); validateLayoutReferences(next, context, true); } catch { return null; }
  return next as unknown as T;
}
