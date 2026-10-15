import { editorialLayoutSchema, type EditorialContext, type EditorialLayout } from "./editorial-contract";
import { usableEditorialMedia, validateLayoutReferences } from "./editorial-engine";

/** Client-side atomic commit gate. HTTP success alone never changes local work. */
export function acceptedEditorialProposal(data: unknown, current: EditorialLayout, context: EditorialContext, direction: "KEEP" | "AUTO") {
  if (!data || typeof data !== "object" || !("status" in data) || data.status !== "PROPOSED" || !("layout" in data)) return null;
  if ("outcome" in data && data.outcome !== "PROPOSED") return null;
  const result = editorialLayoutSchema.safeParse(data.layout);
  if (!result.success) return null;
  const next = result.data;
  if (direction === "KEEP" && (next.family !== current.family || next.variant !== current.variant)) return null;
  if (next.blocks.length !== current.blocks.length) return null;
  const allowed = new Set(usableEditorialMedia(context).map(m => m.id));
  for (const b of next.blocks) {
    const before = current.blocks.find(v => v.id === b.id);
    if (!before || b.text !== before.text || b.caption !== before.caption || b.focalX !== before.focalX || b.focalY !== before.focalY ||
      JSON.stringify(b.sourceIds) !== JSON.stringify(before.sourceIds) || JSON.stringify(b.entries) !== JSON.stringify(before.entries) ||
      (before.hidden && !b.hidden) || b.mediaIds.some(id => !allowed.has(id))) return null;
  }
  try { validateLayoutReferences(next, context, false); validateLayoutReferences(next, context, true); } catch { return null; }
  return next;
}
