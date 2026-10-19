import { editorialNodeV2Schema, isV2Layout, type EditorialLayout } from "./editorial-contract";
import { getAllLayoutNodes } from "./editorial-engine";

const stable = (value: unknown): string => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);

/** Locked and deliberately hidden nodes retain their identity and complete content. */
export function preservesEditorialNodeLocks(before: EditorialLayout, after: EditorialLayout): boolean {
  if (!isV2Layout(before)) return true;
  if (!isV2Layout(after)) return false;
  const candidates = getAllLayoutNodes(after);
  return getAllLayoutNodes(before).filter(node => node.locked || node.hidden).every(node => {
    const candidate = candidates.find(next => next.id === node.id);
    return candidate && stable(editorialNodeV2Schema.parse(candidate)) === stable(editorialNodeV2Schema.parse(node));
  });
}
