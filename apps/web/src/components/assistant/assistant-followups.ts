import type { QaCompletedTurn } from "../../modules/ai/qa-contract";
import { normalizeQaQuestion } from "../../modules/ai/qa-question-understanding";

// Questions only: these templates make no factual promises and cost no model
// call. They are projected from the current confirmed answer, never persisted.
const topics = [
  { source: /(?:địa chất|karst|đá vôi|hóa thạch)/iu, asked: /(?:địa chất|karst|đá vôi|hóa thạch)/iu, question: "Ở đó có những đặc điểm địa chất nào nổi bật?" },
  { source: /(?:văn hóa|dân tộc|truyền thống|di sản)/iu, asked: /(?:văn hóa|dân tộc|truyền thống)/iu, question: "Ở đó có những giá trị văn hóa nào đáng chú ý?" },
  { source: /(?:UNESCO|danh hiệu|xếp hạng)/iu, asked: /(?:UNESCO|danh hiệu|xếp hạng|công nhận)/iu, question: (text: string) => /UNESCO/iu.test(text) ? "Địa điểm này được UNESCO công nhận là gì?" : "Địa điểm này có danh hiệu nào?" },
  { source: /(?:vé|phí|\d[\d.,]*\s*đồng)/iu, asked: /(?:vé|phí|bao nhiêu)/iu, question: "Ở đó có thu vé vào cửa chung không?" },
] as const;

export function assistantFollowupSuggestions(question: string, turn: QaCompletedTurn): string[] {
  if (turn.status !== "ANSWERED" && turn.status !== "PARTIAL") return [];
  const text = turn.answerParts.map(part => part.text).join("\n");
  const current = normalizeQaQuestion(question);
  return topics.filter(topic => topic.source.test(text) && !topic.asked.test(current))
    .map(topic => typeof topic.question === "function" ? topic.question(text) : topic.question).filter(next => normalizeQaQuestion(next) !== current).slice(0, 3);
}
