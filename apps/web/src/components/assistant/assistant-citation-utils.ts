import { qaSourceUrlSchema, type QaCompletedTurn, type QaPublicCitation } from "../../modules/ai/qa-contract";

export type IndexedCitation = { citation: QaPublicCitation; number: number; citations: QaPublicCitation[] };

/** Number by first appearance; grouping changes presentation, never stored proof. */
export function buildCitationIndex(turn: QaCompletedTurn): ReadonlyMap<string, IndexedCitation> | null {
  const citations = new Map<string, QaPublicCitation>();
  for (const citation of turn.citations) {
    if (citations.has(citation.id)) return null;
    citations.set(citation.id, citation);
  }
  const index = new Map<string, IndexedCitation>();
  const groups = new Map<string, IndexedCitation>();
  for (const part of turn.answerParts) {
    const partIds = new Set<string>();
    for (const id of part.citationIds) {
      const citation = citations.get(id);
      if (!citation || partIds.has(id)) return null;
      partIds.add(id);
      if (!index.has(id)) {
        const href=citationSourceHref(citation.sourceUrl);
        const key=href ? `url:${new URL(href).href}` : `document:${citation.sourceId}`;
        let group=groups.get(key);
        if(!group){group={citation,number:groups.size+1,citations:[]};groups.set(key,group);}
        group.citations.push(citation); index.set(id,group);
      }
    }
  }
  return index.size === citations.size ? index : null;
}

/** Syntax defense only. Public authorization and provenance belong to runtime. */
export function citationSourceHref(value: unknown): string | null {
  const parsed = qaSourceUrlSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** View-layer guard; opening source metadata must not start following the tail. */
export function isReadingCitation(viewport: HTMLElement): boolean {
  const focused = viewport.ownerDocument.activeElement;
  return !!viewport.querySelector(".assistant-answer-sources[open], .assistant-citations details[open]") ||
    !!(focused && viewport.contains(focused) && focused.closest(".assistant-answer-sources, .assistant-citations"));
}
