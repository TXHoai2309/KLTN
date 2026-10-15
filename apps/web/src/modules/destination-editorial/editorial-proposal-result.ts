import { editorialLayoutSchema, type EditorialContext, type EditorialLayout } from "./editorial-contract";
import { usableEditorialMedia, validateLayoutReferences } from "./editorial-engine";
import { isShortEditorialHeading } from "./editorial-content";
import { compareLayoutSignatures, getLayoutSignature } from "./editorial-signature";
import { preservesHeroLocks } from "./editorial-hero";

/** Client-side atomic commit gate. HTTP success alone never changes local work. */
export function acceptedEditorialProposal(
  data: unknown,
  current: EditorialLayout,
  context: EditorialContext,
  direction: "KEEP" | "AUTO",
  mode: "PROPOSE" | "ALTERNATIVE" = "PROPOSE"
) {
  if (!data || typeof data !== "object" || !("status" in data) || data.status !== "PROPOSED" || !("layout" in data)) return null;
  if ("outcome" in data && data.outcome !== "PROPOSED" && data.outcome !== "PROPOSED_NEW") return null;
  const result = editorialLayoutSchema.safeParse(data.layout);
  if (!result.success) return null;
  const next = result.data;
  if (!preservesHeroLocks(current, next)) return null;
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
  if (mode === "ALTERNATIVE") {
    const diff = compareLayoutSignatures(getLayoutSignature(current), getLayoutSignature(next));
    if (diff.level !== "SIGNIFICANT") return null;
  }
  try { validateLayoutReferences(next, context, false); validateLayoutReferences(next, context, true); } catch { return null; }
  return next;
}
