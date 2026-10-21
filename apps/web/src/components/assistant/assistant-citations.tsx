import type { QaAnswerPart } from "../../modules/ai/qa-contract";
import { citationSourceHref, type IndexedCitation } from "./assistant-citation-utils";
import { ArrowUpRight } from "lucide-react";

export function AssistantCitations({ part, index }: {
  part: QaAnswerPart;
  index: ReadonlyMap<string, IndexedCitation> | null;
}) {
  if (!index) {
    return <span className="assistant-citations-error">Thông tin nguồn không khả dụng.</span>;
  }
  const entries=[...new Map(part.citationIds.flatMap(id=>{const entry=index.get(id);return entry?[[entry.number,entry] as const]:[]})).values()];
  if (!entries.length) return null;
  return <span className="assistant-citations" aria-label="Nguồn tham khảo">
    {entries.map(({citation,number}) => {
      const href = citationSourceHref(citation.sourceUrl);
      return href ? <a className="assistant-citation-ref" key={number} href={href} target="_blank" rel="noopener noreferrer" aria-label={`Mở nguồn ${number}: ${citation.title} (tab mới)`}>[{number}]</a> : null;
    })}
  </span>;
}

export function AssistantSourceList({index,sourcePrefix}:{index:ReadonlyMap<string,IndexedCitation>;sourcePrefix:string}) {
  const entries=[...new Map([...index.values()].map(entry=>[entry.number,entry])).values()];
  if (!entries.length) return null;
  return <details className="assistant-answer-sources" id={`${sourcePrefix}-sources`}>
    <summary aria-label={`Xem nguồn tham khảo (${entries.length})`}>Xem nguồn ({entries.length})</summary>
    <ol className="assistant-source-list">{entries.map(({citation,number})=>{
      const href=citationSourceHref(citation.sourceUrl);
      if (!href) return null;
      return <li key={number} id={`${sourcePrefix}-source-${number}`} tabIndex={-1}>
        <span className="assistant-source-number">[{number}]</span><div>
          <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`Mở nguồn ${number}: ${citation.title} (tab mới)`}>{citation.title} <ArrowUpRight size={12} aria-hidden="true" /></a><span className="assistant-source-domain">{new URL(href).hostname}</span>
        </div>
      </li>;
    })}</ol>
  </details>;
}
