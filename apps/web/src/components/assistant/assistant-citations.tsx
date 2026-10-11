import type { QaAnswerPart } from "../../modules/ai/qa-contract";
import { citationSourceHref, type IndexedCitation } from "./assistant-citation-utils";

export function AssistantCitations({ part, index }: {
  part: QaAnswerPart;
  index: ReadonlyMap<string, IndexedCitation> | null;
}) {
  if (!index || part.citationIds.some((id) => !index.has(id))) {
    return <span className="assistant-citations-error">Thông tin nguồn không khả dụng.</span>;
  }
  return <div className="assistant-citations" aria-label="Nguồn tham khảo">
    {part.citationIds.map((id) => {
      const { citation, number } = index.get(id)!;
      const href = citationSourceHref(citation.sourceUrl);
      return <details className="assistant-citation" key={id}>
        <summary aria-label={`Nguồn tham khảo ${number}: ${citation.title}`}>
          <span>[{number}] Nguồn tham khảo</span><span className="assistant-citation-chevron" aria-hidden="true">⌄</span>
        </summary>
        <div className="assistant-citation-metadata">
          <strong>{citation.title}</strong>
          {citation.locators.length ? <ul>{citation.locators.map((locator, position) => <li key={position}>
            {locator.pageNumber !== undefined && <span>Trang {locator.pageNumber}</span>}
            {locator.pageNumber !== undefined && locator.section !== undefined && " · "}
            {locator.section !== undefined && <span>Mục “{locator.section}”</span>}
          </li>)}</ul> : <p>Không có vị trí cụ thể</p>}
          {href ? <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`Mở nguồn ${number}: ${citation.title} (tab mới)`}>Mở nguồn <span aria-hidden="true">↗</span></a>
            : <p>Không có liên kết công khai</p>}
        </div>
      </details>;
    })}
  </div>;
}
