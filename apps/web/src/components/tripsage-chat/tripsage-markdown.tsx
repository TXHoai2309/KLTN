import { Fragment, type ReactNode } from "react";
import { extractSuggestRepliesDirectives } from "@/modules/tripsage-chat/assistant-conversation-contract";

/**
 * Minimal, safe markdown for assistant text (ADR-42): headings, paragraphs, bullet/numbered lists, tables, **bold**,
 * *italic* and `code`. Output is React elements only (no HTML injection); images and links render as plain text.
 * shortcut: no nested lists or block quotes; swap in a full renderer if replies start needing them.
 */
export function TripsageMarkdown({ text }: { text: string }) {
  const cleanText = extractSuggestRepliesDirectives(text).text;
  return <div className="tripsage-md">{renderBlocks(cleanText)}</div>;
}

type Block = { kind: "h"; level: number; text: string } | { kind: "p"; text: string } | { kind: "ul" | "ol"; items: string[] } | { kind: "table"; rows: string[][] };

const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map(cell => cell.trim());
const isDivider = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);

export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) continue;
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) { blocks.push({ kind: "h", level: heading[1]!.length, text: heading[2]! }); continue; }
    if (line.trim().startsWith("|") && isDivider(lines[i + 1] ?? "")) {
      const rows = [cells(line)];
      for (i += 2; i < lines.length && lines[i]!.trim().startsWith("|"); i++) rows.push(cells(lines[i]!));
      i--; blocks.push({ kind: "table", rows }); continue;
    }
    const list = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/.exec(line);
    if (list) {
      const kind = list[1] ? "ul" : "ol";
      const items = [list[3]!];
      for (; i + 1 < lines.length; i++) {
        const next = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/.exec(lines[i + 1]!);
        if (!next || (next[1] ? "ul" : "ol") !== kind) break;
        items.push(next[3]!);
      }
      blocks.push({ kind, items }); continue;
    }
    const paragraph = [line];
    while (i + 1 < lines.length && lines[i + 1]!.trim() && !/^(#{1,6}\s|\s*([-*+]|\d+[.)])\s|\s*\|)/.test(lines[i + 1]!)) paragraph.push(lines[++i]!);
    blocks.push({ kind: "p", text: paragraph.join("\n") });
  }
  return blocks;
}

function renderBlocks(text: string): ReactNode[] {
  return parseBlocks(text).map((block, key) => {
    if (block.kind === "h") return block.level <= 2 ? <h3 key={key}>{inline(block.text)}</h3> : <h4 key={key}>{inline(block.text)}</h4>;
    if (block.kind === "p") return <p key={key}>{block.text.split("\n").map((line, index) => <Fragment key={index}>{index > 0 && <br />}{inline(line)}</Fragment>)}</p>;
    if (block.kind === "ul") return <ul key={key}>{block.items.map((item, index) => <li key={index}>{inline(item)}</li>)}</ul>;
    if (block.kind === "ol") return <ol key={key}>{block.items.map((item, index) => <li key={index}>{inline(item)}</li>)}</ol>;
    if (block.kind !== "table") return null;
    const [head, ...body] = block.rows;
    return (
      <div key={key} className="tripsage-md-table"><table>
        <thead><tr>{head!.map((cell, index) => <th key={index} scope="col">{inline(cell)}</th>)}</tr></thead>
        <tbody>{body.map((row, r) => <tr key={r}>{row.map((cell, index) => <td key={index}>{inline(cell)}</td>)}</tr>)}</tbody>
      </table></div>
    );
  });
}

/** True when a bold span wraps a full sentence rather than a short data phrase or proper noun (slim B12, design §2.2). */
function isFullSentenceBold(content: string): boolean {
  const trimmed = content.trim();
  const words = trimmed.split(/\s+/u).filter(Boolean);
  if (words.length >= 6) return true;
  if (/[?？!.]$/u.test(trimmed) && words.length >= 4) return true;
  return false;
}

/** `code`, **bold**, *italic*; `![alt](url)` and `[text](url)` keep only their text. */
export function inline(text: string): ReactNode[] {
  const plain = text.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1");
  return plain.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) return <code key={index}>{part.slice(1, -1)}</code>;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      const inner = part.slice(2, -2);
      return isFullSentenceBold(inner) ? <Fragment key={index}>{inner}</Fragment> : <strong key={index}>{inner}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) return <em key={index}>{part.slice(1, -1)}</em>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}
