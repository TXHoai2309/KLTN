import type { QaAnswerPart } from "../../modules/ai/qa-contract";
import { citationSourceHref, type IndexedCitation } from "./assistant-citation-utils";
import { ArrowUpRight } from "lucide-react";

export function AssistantCitations({ part, index, sourcePrefix = "assistant" }: {
  part: QaAnswerPart;
  index: ReadonlyMap<string, IndexedCitation> | null;
  sourcePrefix?: string;
}) {
  if (!index || part.citationIds.some((id) => !index.has(id))) {
    return <span className="assistant-citations-error">Thông tin nguồn không khả dụng.</span>;
  }
  const entries=[...new Map(part.citationIds.map(id=>{const entry=index.get(id)!;return [entry.number,entry] as const;})).values()];
  return <span className="assistant-citations" aria-label="Nguồn tham khảo">
    {entries.map(({citation,number}) => {
      const href = citationSourceHref(citation.sourceUrl);
      return href ? <a className="assistant-citation-ref" key={number} href={href} target="_blank" rel="noopener noreferrer" aria-label={`Mở nguồn ${number}: ${citation.title} (tab mới)`}>[{number}]</a>
        : <a className="assistant-citation-ref" key={number} href={`#${sourcePrefix}-source-${number}`} aria-label={`Xem nguồn ${number}: ${citation.title}`} onClick={()=>{document.getElementById(`${sourcePrefix}-sources`)?.setAttribute("open","");}}>[{number}]</a>;
    })}
  </span>;
}

export function AssistantSourceList({index,sourcePrefix}:{index:ReadonlyMap<string,IndexedCitation>;sourcePrefix:string}) {
  const entries=[...new Map([...index.values()].map(entry=>[entry.number,entry])).values()];
  return <details className="assistant-answer-sources" id={`${sourcePrefix}-sources`}>
    <summary aria-label={`Xem nguồn tham khảo (${entries.length})`}>Xem nguồn ({entries.length})</summary>
    <ol className="assistant-source-list">{entries.map(({citation,number,citations})=>{
      const href=citationSourceHref(citation.sourceUrl);
      const locators=[...new Map(citations.flatMap(c=>c.locators).map(locator=>[JSON.stringify(locator),locator])).values()];
      return <li key={number} id={`${sourcePrefix}-source-${number}`} tabIndex={-1}>
        <span className="assistant-source-number">[{number}]</span><div>
          {href ? <><a href={href} target="_blank" rel="noopener noreferrer" aria-label={`Mở nguồn ${number}: ${citation.title} (tab mới)`}>{citation.title} <ArrowUpRight size={12} aria-hidden="true" /></a><span className="assistant-source-domain">{new URL(href).hostname}</span></>
            : <><strong>{citation.title}</strong><span className="assistant-source-domain">Tài liệu đã tải lên</span></>}
          {locators.length>0 ? <details className="assistant-source-locations"><summary aria-label={`Vị trí nguồn ${number} trong tài liệu RAG`}>Vị trí trong tài liệu RAG</summary><ul>{locators.map((locator,position)=><li key={position}>{locator.pageNumber!==undefined && `Trang ${locator.pageNumber}`}{locator.pageNumber!==undefined && locator.section && " · "}{locator.section && `Mục “${locator.section}”`}</li>)}</ul></details> : <span className="assistant-source-domain">Không có vị trí cụ thể</span>}
        </div>
      </li>;
    })}</ol>
  </details>;
}
