// Versioned TEXT envelope. Unmarked content is always literal legacy prose.
export const RICH_CONTENT_PREFIX = "KLTN_RICH_TEXT_V1\n";
export type RichNode = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: RichNode[];
};
export function safeContentLink(value: unknown): value is string {
  if (typeof value !== "string" || /[\u0000-\u0020\u007f]/.test(value))
    return false;
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !!url.hostname &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
const children: Record<string, string[]> = {
  doc: ["paragraph", "heading", "bulletList", "orderedList", "blockquote"],
  paragraph: ["text", "hardBreak"],
  heading: ["text", "hardBreak"],
  bulletList: ["listItem"],
  orderedList: ["listItem"],
  listItem: ["paragraph", "bulletList", "orderedList", "blockquote"],
  blockquote: [
    "paragraph",
    "heading",
    "bulletList",
    "orderedList",
    "blockquote",
  ],
  text: [],
  hardBreak: [],
};
export function parseRichContent(value: string): RichNode | null {
  if (!value.startsWith(RICH_CONTENT_PREFIX)) return null;
  try {
    const doc: RichNode = JSON.parse(value.slice(RICH_CONTENT_PREFIX.length));
    let count = 0;
    function valid(node: RichNode, depth: number): boolean {
      if (
        !node ||
        typeof node !== "object" ||
        Array.isArray(node) ||
        ++count > 4000 ||
        depth > 20 ||
        !children[node.type]
      )
        return false;
      if (
        Object.keys(node).some(
          (k) => !["type", "content", "text", "marks", "attrs"].includes(k),
        )
      )
        return false;
      if (
        node.type === "text"
          ? typeof node.text !== "string"
          : node.text !== undefined
      )
        return false;
      if (node.attrs !== undefined) {
        if (
          !node.attrs ||
          typeof node.attrs !== "object" ||
          Array.isArray(node.attrs)
        )
          return false;
        const allowed =
          node.type === "heading"
            ? ["level"]
            : node.type === "orderedList"
              ? ["start", "type"]
              : [];
        if (Object.keys(node.attrs).some((k) => !allowed.includes(k)))
          return false;
      }
      if (
        node.type === "heading" &&
        ![2, 3].includes(Number(node.attrs?.level))
      )
        return false;
      if (
        node.type === "orderedList" &&
        node.attrs?.start !== undefined &&
        (!Number.isSafeInteger(node.attrs.start) ||
          Number(node.attrs.start) < 1)
      )
        return false;
      if (
        node.marks !== undefined &&
        (node.type !== "text" ||
          !Array.isArray(node.marks) ||
          node.marks.length > 3 ||
          node.marks.some((m) => {
            if (
              !m ||
              !["bold", "italic", "link"].includes(m.type) ||
              Object.keys(m).some((k) => !["type", "attrs"].includes(k))
            )
              return true;
            if (m.type !== "link") return m.attrs !== undefined;
            return (
              !safeContentLink(m.attrs?.href) ||
              Object.keys(m.attrs ?? {}).some(
                (k) => !["href", "target", "rel", "class", "title"].includes(k),
              )
            );
          }))
      )
        return false;
      return (
        node.content === undefined ||
        (Array.isArray(node.content) &&
          node.content.every(
            (c) => children[node.type]!.includes(c.type) && valid(c, depth + 1),
          ))
      );
    }
    return doc.type === "doc" && valid(doc, 0) ? doc : null;
  } catch {
    return null;
  }
}
export function richContentText(value: string): string {
  const doc = parseRichContent(value);
  if (!doc) return value;
  function text(node: RichNode): string {
    if (node.type === "text") return node.text ?? "";
    if (node.type === "hardBreak") return "\n";
    const inline = ["paragraph", "heading"].includes(node.type);
    const body = (node.content ?? []).map(text).join(inline ? "" : "\n");
    return node.type === "heading"
      ? `${"#".repeat(Number(node.attrs?.level))} ${body}`
      : body;
  }
  return text(doc);
}
export function contentForEditor(value: string): RichNode {
  return (
    parseRichContent(value) ?? {
      type: "doc",
      content: value
        .split(/\r?\n/)
        .map((line) => ({
          type: "paragraph",
          content: line ? [{ type: "text", text: line }] : [],
        })),
    }
  );
}
export function serializeRichContent(doc: RichNode): string {
  return RICH_CONTENT_PREFIX + JSON.stringify(doc);
}
