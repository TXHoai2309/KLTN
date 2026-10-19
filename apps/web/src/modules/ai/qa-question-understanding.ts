import type { QaHistoryTurn } from "./qa-runtime-contract";
import type { QaResolvedContext } from "./qa-destination-context";

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
  return normalizeQaQuestion(question).replace(/^(?:(?:hi|hello|hey|alo|xin chào|chào bạn)(?:\s+bạn)?|(?:cảm ơn|cám ơn|thanks|thank you)(?:\s+bạn(?!\s+(?:có|biết|giúp|hỗ trợ|cho biết)(?:\s|$)))?)(?:\s+(?:nhé|nha|ạ|ơi))?\s+(?=\p{L})/u, "");
}

function needsHistory(question: string): boolean {
  // Case is not evidence of an entity: "NÓ Ở ĐÂU" is still a follow-up.
  // Full attribute/continuation patterns leave explicitly named questions alone.
  // This resolves intent only, never semantic relevance or source sufficiency.
  const text = qaFactualQuestion(question);
  if (/^(?:còn|vậy|thế)(?:\s+trong)?\s+năm\s+(?:19|20|21)\d{2}(?:\s+thì sao)?$/u.test(text)) return true;
  return /(?:^|\s)(?:nó|ở đó|nơi đó|nơi này|điểm đến này|địa điểm đó|địa điểm này|chỗ đó|chỗ này|vừa nhắc|kể trên)(?:\s|$)/u.test(text) ||
    /^(?:còn|vậy|thế)(?:\s+còn)?\s+(?:(?:các|những)\s+)?(?:địa điểm|điểm đến|nơi|chỗ)(?:\s+(?:khác|còn lại))(?:\s+(?:thì sao|thế nào|như thế nào))?$/u.test(text) ||
    /^họ\s+(?:là|làm|ở|có|đã|được|sống|sử dụng)(?:\s|$)/u.test(text) ||
    /^(?:(?:mình|tôi) muốn biết thêm|thêm|nói thêm|kể thêm|giải thích thêm)(?:\s+(?:đi|nữa|được không))?$/u.test(text) ||
    /^(?:còn|vậy|thế)(?:\s+(?:thì sao|sao|còn gì nữa))?$/u.test(text) ||
    /^(?:(?:còn|vậy|thế)\s+)?(?:ở đâu|nằm ở đâu|(?:giá\s+)?vé(?:\s+vào(?:\s+cửa)?)?|phí vào cửa|phí tham quan|giờ mở cửa|mở cửa lúc nào|lịch sử|đường đi|có gì đặc biệt|có gì nổi bật)(?:\s+(?:hôm nay|hiện tại|theo hồ sơ))?(?:\s+(?:là gì|là bao nhiêu|bao nhiêu|thì sao|như thế nào))?$/u.test(text);
}

export const QA_FOLLOWUP_CLARIFICATIONS = {
  missingSubject: "Bạn muốn hỏi về điểm đến nào?",
  multipleSubjects: "Bạn đang muốn hỏi về điểm đến nào trong các nơi vừa nhắc?",
} as const;

/** Conservative, server-authored clarification. Never invent a subject from
 * prior answers. A selected destination already supplies the authorized subject.
 * A comparison pattern is only an ambiguity hint, not a general-purpose NER. */
export function qaFollowupClarification(question: string, history: readonly QaHistoryTurn[], context: QaResolvedContext): string | undefined {
  if (context.type === "DESTINATION" || !needsHistory(question)) return undefined;
  if (!history.length) return QA_FOLLOWUP_CLARIFICATIONS.missingSubject;
  const anchor = history.find(turn => !needsHistory(turn.question));
  if (!anchor) return QA_FOLLOWUP_CLARIFICATIONS.missingSubject;
  const previous = qaFactualQuestion(anchor.question);
  if (/(?:so sánh|giữa)\s+(?!(?:giá|vé|giờ|chi phí)(?:\s|$)).+\s+(?:và|với|hay|vs)\s+.+/u.test(previous)) {
    return QA_FOLLOWUP_CLARIFICATIONS.multipleSubjects;
  }
  return undefined;
}

// Only these complete, unqualified continuations may give up a history slot.
// Unknown wording can contain preferences/conditions even without digits or a
// negation; preserve it and ask for the subject rather than guessing it away.
function isSubjectNeutralContinuation(question: string): boolean {
  return /^(?:ở đó|nơi đó|nơi này|địa điểm đó|địa điểm này|điểm đến này|nó) có (?:những )?(?:đặc điểm địa chất|đặc điểm tự nhiên|giá trị văn hóa|nét văn hóa)(?: nào)?(?: nổi bật| đáng chú ý)?$/u.test(question) ||
    /^(?:ở đó|nơi đó|nơi này|địa điểm đó|địa điểm này|điểm đến này|nó) (?:có gì nổi bật|có gì đặc biệt|có danh hiệu hoặc xếp hạng nào|có danh hiệu gì|có danh hiệu nào|được unesco công nhận là gì|ở đâu|nằm ở đâu|thì sao)$/u.test(question) ||
    question === "danh hiệu vừa nhắc có ý nghĩa gì theo nguồn";
}

/** Carry at most two questions only for a dependent follow-up. Social turns and
 * repeated current questions cannot displace its factual subject. No old answer
 * text/citations are used as evidence or sent to the provider. */
export function qaIntentHistory(question: string, history: readonly QaHistoryTurn[]): QaHistoryTurn[] {
  const previous = [...history].reverse().find(turn => turn.response.status !== "CONVERSATIONAL");
  const text = qaFactualQuestion(question);
  // A short subject supplied after "which destination?" completes the previous
  // request. Preserve that question's attribute, not an invented old answer.
  const clarificationReply = previous?.response.status === "CLARIFICATION_REQUIRED" && text.split(/\s+/u).length <= 10 &&
    !/(?:^|\s)(?:có|ở|là|được|giá|vé|giờ|bao nhiêu|thì sao|nói|kể|muốn|không)(?:\s|$)/u.test(text);
  if (!needsHistory(question) && !clarificationReply) return [];
  const candidates: QaHistoryTurn[] = [];
  const seen = new Set([qaFactualQuestion(question)]);
  for (const turn of [...history].reverse()) {
    if (turn.response.status === "CONVERSATIONAL") continue;
    const normalized = qaFactualQuestion(turn.question);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    candidates.push({ ...turn, question: normalized });
    if (clarificationReply) return candidates;
    if (!needsHistory(turn.question)) {
      if (candidates.length <= 2) return candidates.reverse();
      // Keep the nearest subject and the latest dependent question through a
      // neutral chain. Never discard an intervening numeric/time/negative or
      // conditional requirement just to fit that subject into the two slots.
      if (candidates.slice(1, -1).every(item => isSubjectNeutralContinuation(item.question))) return [candidates.at(-1)!, candidates[0]!];
      break;
    }
  }
  return candidates.slice(0, 2).reverse();
}
