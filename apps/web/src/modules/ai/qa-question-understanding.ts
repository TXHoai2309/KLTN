import type { QaHistoryTurn } from "./qa-runtime-contract";

/** Interpretation only. Never use this form for request hashes or stored text.
 * Preserve numeric punctuation (prices, decimals, dates) and all words/negations. */
export function normalizeQaQuestion(question: string): string {
  const text = question.normalize("NFC").toLocaleLowerCase("vi");
  return text
    .replace(/[,.\/]/gu, (mark: string, offset: number) =>
      /\d/u.test(text[offset - 1] ?? "") && /\d/u.test(text[offset + 1] ?? "") ? mark : " ")
    .replace(/[?!;…。！？，、；]+/gu, " ")
    .replace(/\s+/gu, " ").trim();
}

export function qaFactualQuestion(question: string): string {
  // Whole greetings are handled separately. A greeting before a factual request
  // must never swallow that request or turn it into an ungrounded social answer.
  return normalizeQaQuestion(question).replace(/^(?:hi|hello|hey|xin chào|chào bạn)(?:\s+bạn)?\s+(?=\p{L})/u, "");
}

function needsHistory(question: string): boolean {
  // Explicit named subjects take precedence even in "Còn ... thì sao?".
  // This is conservative intent routing, never a relevance or grounding check.
  if (/\p{Lu}[\p{L}\p{M}]+(?:\s+\p{Lu}[\p{L}\p{M}]+)+/u.test(question)) return false;
  const text = normalizeQaQuestion(question);
  return /(?:^|\s)(?:nó|ở đó|nơi đó|nơi này|điểm đến này|địa điểm đó|địa điểm này|chỗ đó|chỗ này|vừa nhắc|kể trên)(?:\s|$)/u.test(text) ||
    /^họ\s+(?:là|làm|ở|có|đã|được|sống|sử dụng)(?:\s|$)/u.test(text) ||
    /^(?:thêm|nói thêm|kể thêm|giải thích thêm)(?:\s|$)/u.test(text) ||
    /^(?:còn|vậy|thế)(?:\s+(?:thì sao|sao|còn gì nữa))?$/u.test(text) ||
    /^(?:(?:còn|vậy|thế)\s+)?(?:ở đâu|nằm ở đâu|giá vé|phí tham quan|giờ mở cửa|mở cửa lúc nào|lịch sử|đường đi|có gì đặc biệt)(?:\s+(?:là gì|bao nhiêu|thì sao|như thế nào))?$/u.test(text);
}

/** Carry at most two questions only for a dependent follow-up. Social turns and
 * repeated current questions cannot displace its factual subject. No old answer
 * text/citations are used as evidence or sent to the provider. */
export function qaIntentHistory(question: string, history: readonly QaHistoryTurn[]): QaHistoryTurn[] {
  if (!needsHistory(question)) return [];
  const selected: QaHistoryTurn[] = [];
  const seen = new Set([qaFactualQuestion(question)]);
  for (const turn of [...history].reverse()) {
    if (turn.response.status === "CONVERSATIONAL") continue;
    const normalized = qaFactualQuestion(turn.question);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    selected.unshift({ ...turn, question: normalized });
    if (selected.length === 2 || !needsHistory(turn.question)) break;
  }
  return selected;
}
