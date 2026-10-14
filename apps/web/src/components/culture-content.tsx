import React, { Fragment, type ReactNode } from "react";
import {
  parseRichContent,
  safeContentLink,
  type RichNode,
} from "@/modules/culture/culture-rich-content";
export default function CultureContent({ content }: { content: string }) {
  const doc = parseRichContent(content);
  function render(node: RichNode, key: number): ReactNode {
    const body = node.content?.map(render);
    if (node.type === "text") {
      let text: ReactNode = node.text;
      for (const mark of node.marks ?? []) {
        if (mark.type === "bold") text = <strong>{text}</strong>;
        if (mark.type === "italic") text = <em>{text}</em>;
        if (mark.type === "link" && safeContentLink(mark.attrs?.href))
          text = (
            <a href={mark.attrs.href} target="_blank" rel="noopener noreferrer">
              {text}
            </a>
          );
      }
      return <Fragment key={key}>{text}</Fragment>;
    }
    switch (node.type) {
      case "doc":
        return <Fragment key={key}>{body}</Fragment>;
      case "paragraph":
        return <p key={key}>{body ?? <br />}</p>;
      case "heading":
        return node.attrs?.level === 3 ? (
          <h3 key={key}>{body}</h3>
        ) : (
          <h2 key={key}>{body}</h2>
        );
      case "bulletList":
        return <ul key={key}>{body}</ul>;
      case "orderedList":
        return (
          <ol key={key} start={Number(node.attrs?.start ?? 1)}>
            {body}
          </ol>
        );
      case "listItem":
        return <li key={key}>{body}</li>;
      case "blockquote":
        return <blockquote key={key}>{body}</blockquote>;
      case "hardBreak":
        return <br key={key} />;
      default:
        return null;
    }
  }
  return (
    <div className="culture-rich-content">
      {doc ? (
        render(doc, 0)
      ) : (
        <div style={{ whiteSpace: "pre-wrap" }}>
          {content
            .replace(/\r\n?/g, "\n")
            .split(/\n{2,}/)
            .filter(Boolean)
            .map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
        </div>
      )}
    </div>
  );
}
