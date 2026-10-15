import type { EditorialBlock, EditorialLayout, ResolvedEditorial } from "./editorial-contract";
import { normalizeEditorialText } from "./editorial-content";

export const heroCompositionLabels = {
  PANORAMA: "Toàn cảnh điện ảnh",
  SPLIT: "Ảnh và lời dẫn song hành",
  EDITORIAL: "Trang bìa tạp chí",
};

/** Presentation only: never rewrite an Admin's stored composition or media. */
export function editorialHeroPlan(layout: EditorialLayout, image?: ResolvedEditorial["media"][number]) {
  const requested = layout.hero?.composition ?? layout.variant;
  const known = Boolean(image?.width && image?.height);
  const limited = known && (image!.width! < 1200 || image!.height! < 600);
  const ratio = known ? image!.width! / image!.height! : 1.6;
  const crop = layout.blocks.find(b => b.type === "HERO" && !b.hidden)?.crop;
  const composition = !image ? "EDITORIAL" : requested === "PANORAMA" && (limited || !known) ? "EDITORIAL"
    : requested === "PANORAMA" && (ratio < 1 || crop === "portrait") ? "SPLIT" : requested;
  return { requested, composition, limited, known, ratio, reason: !image ? null : limited ? "LOW_RESOLUTION" : !known ? "UNKNOWN_RESOLUTION" : composition !== requested ? "PORTRAIT_SOURCE" : null };
}

export function heroFocalLocked(layout: EditorialLayout) {
  const block = layout.blocks.find(b => b.type === "HERO" && !b.hidden);
  // Non-central focal points in older saved drafts are treated as deliberate edits.
  return layout.hero?.focalLocked ?? Boolean(block && (block.focalX !== 50 || block.focalY !== 50));
}

export function heroDeck(block: EditorialBlock, title: string, location: string, area: string, intro = "") {
  const deck = (block.deck || (block.text.length <= 130 ? block.text : "")).trim();
  const value = normalizeEditorialText(deck);
  const duplicates = [title, location, area, intro].map(normalizeEditorialText);
  // A deck is a short sourced line, never a paragraph or repeated lead/location.
  if (!value || deck.length > 130 || deck.split(/\s+/u).length > 24 || /\n/.test(deck) || duplicates.some(v => v && (v === value || (v.length > 24 && v.includes(value))))) return "";
  return deck;
}

/** Both server proposals and the client atomic gate enforce manual locks. */
export function preservesHeroLocks(before: EditorialLayout, after: EditorialLayout) {
  if (before.hero?.locked && (after.hero?.composition ?? after.variant) !== before.hero.composition) return false;
  if (before.hero?.locked && !after.hero?.locked) return false;
  const original = before.blocks.find(b => b.type === "HERO" && !b.hidden);
  const next = after.blocks.find(b => b.id === original?.id);
  return !heroFocalLocked(before) || !original || Boolean(next && next.focalX === original.focalX && next.focalY === original.focalY && next.crop === original.crop && JSON.stringify(next.mediaIds) === JSON.stringify(original.mediaIds) && after.hero?.focalLocked !== false);
}
