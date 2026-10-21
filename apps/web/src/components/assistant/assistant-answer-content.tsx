import type { ReactNode } from "react";
import type { QaAnswerPart } from "../../modules/ai/qa-contract";

/** Text stays byte-for-byte in the response/certificate. This projection adds
 * semantics only: no Markdown/HTML/URL parsing and no new factual cell labels. */
function AnswerText({ text }: { text: string }) {
  const label = /^([^:\n]{2,55}:)(\s+)([\s\S]+)$/u.exec(text);
  return <p>{label ? <><strong>{label[1]}</strong>{label[2]}{label[3]}</> : text}</p>;
}

export function AssistantAnswerContent({ parts, presentation, sources }: {
  parts: readonly QaAnswerPart[];
  presentation?: "PARAGRAPHS" | "LIST" | "TABLE";
  sources?: (part: QaAnswerPart) => ReactNode;
}) {
  const content = (part: QaAnswerPart) => {
    const isExpanded = part.mode === "EXPANDED";
    return (
      <>
        <AnswerText text={part.text} />
        {isExpanded && (
          <span className="assistant-expanded-badge" title="Nội dung được bổ sung từ kiến thức mô hình AI">
            Kiến thức mở rộng
          </span>
        )}
        {!isExpanded && sources && <div className="assistant-citation-slot">{sources(part)}</div>}
      </>
    );
  };
  if (presentation === "TABLE" && parts.length > 1) return <div className="assistant-answer-table-scroll" role="region" aria-label="Bảng thông tin đã xác minh, có thể cuộn ngang" tabIndex={0}>
    <table className="assistant-answer-table">
      <caption>Thông tin đã xác minh để so sánh</caption>
      <thead><tr><th scope="col">Nội dung</th>{sources && <th scope="col">Nguồn tham khảo</th>}</tr></thead>
      <tbody>{parts.map((part, index) => {
        const isExpanded = part.mode === "EXPANDED";
        return (
          <tr key={index}>
            <td>
              <AnswerText text={part.text} />
              {isExpanded && <span className="assistant-expanded-badge">Kiến thức mở rộng</span>}
            </td>
            {sources && <td>{!isExpanded ? sources(part) : <span className="assistant-muted">-</span>}</td>}
          </tr>
        );
      })}</tbody>
    </table>
  </div>;
  if (presentation === "LIST" && parts.length > 1) return <ul className="assistant-answer-list">{parts.map((part, index) => <li className="assistant-answer-part" key={index}>{content(part)}</li>)}</ul>;
  return <>{parts.map((part, index) => <div className="assistant-answer-part" key={index}>{content(part)}</div>)}</>;
}
