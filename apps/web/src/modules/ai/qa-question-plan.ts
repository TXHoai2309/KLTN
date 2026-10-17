import { qaFactualQuestion } from "./qa-question-understanding";
import type { QaHistoryTurn } from "./qa-runtime-contract";
import type { QaResolvedContext } from "./qa-destination-context";
import type { QaAspectKind } from "./qa-answer-details";

export type QaRequestedFacet = { id: string; subject: string; attribute: string; kind: QaAspectKind; year?: string; criteria?: readonly string[] };
export type QaQuestionPlan = { comparison: boolean; subjects: string[]; facets: QaRequestedFacet[] };

const clean = (text: string) => text.trim().replace(/\s+/gu, " ");
function subject(text: string): string | undefined {
  const value = clean(text).replace(/^(?:về|của)\s+/u, "");
  // This parser recognizes explicit syntax, not arbitrary entity semantics.
  // Unknown/elliptical wording stays with the semantic assessor and clarification.
  if (value.length < 3 || value.length > 120 || value.split(" ").length > 18 ||
    /(?:^|\s)(?:nó|đó|này|ở đâu|bao nhiêu|thì sao|cái gì|loại nào)(?:\s|$)/u.test(value) ||
    /[<>\n]|https?:|[?]/u.test(value)) return undefined;
  return value;
}

/** Bounded syntax plan. No place names or factual answers, no provider call.
 * A plan supplies obligations, never a sufficiency or entailment certificate. */
export function planQaQuestion(question: string, history: readonly QaHistoryTurn[] = [], context: QaResolvedContext = { type: "GENERAL" }): QaQuestionPlan | undefined {
  const text = qaFactualQuestion(question);
  const comparison = text.match(/(?:khác biệt|khác nhau|so sánh|đối chiếu)(?:\s+giữa)?\s+(.+?)\s+(?:và|với|so với)\s+(.+?)(?:\s+về\s+(.+?))?(?:\s+(?:là gì|như thế nào))?$/u);
  let subjects: string[] = [];
  let attributes: { attribute: string; kind: QaAspectKind; criteria?: readonly string[] }[] = [];
  const year = text.match(/\bnăm\s+((?:19|20|21)\d{2})\b/u)?.[1];
  if (year && history.length && /^(?:còn|vậy|thế)(?:\s+trong)?\s+năm\s+\d{4}(?:\s+thì sao)?$/u.test(text)) {
    const prior = planQaQuestion(history.at(-1)!.question, [], context);
    if (prior) return { ...prior, facets: prior.facets.map(facet => ({ ...facet, year })) };
  }
  if (comparison && context.type === "GENERAL") {
    const names = [subject(comparison[1]!), subject(comparison[2]!)];
    if (names.some(name => !name) || names[0] === names[1]) return undefined;
    subjects = names as string[];
    const criteria = comparison[3] ?? "đặc điểm được hỏi";
    const operational: { attribute: string; kind: QaAspectKind }[] = [];
    if (/(?:giá vé|phí tham quan|phí vào cửa)/u.test(criteria)) operational.push({ attribute: "giá vé tham quan", kind: "ADMISSION" });
    if (/(?:giờ mở cửa|giờ hoạt động)/u.test(criteria)) operational.push({ attribute: "giờ mở cửa", kind: "OPENING_HOURS" });
    // A contrast asks each subject's role under the requested criteria. It does
    // not necessarily ask for a Cartesian checklist of every property at every
    // site (e.g. historical value of one versus cultural practice of another).
    // Keep all criteria for semantic assessment/verification, with one mandatory
    // subject slot each. Never invent unasked facets just to mark them missing.
    const requested = [/lịch sử/u.test(criteria) ? "giá trị lịch sử" : undefined, /văn hóa/u.test(criteria) ? "giá trị văn hóa" : undefined].filter((item): item is string => !!item);
    attributes = operational.length ? operational : [{ attribute: criteria, kind: "OTHER", criteria: requested.length ? requested : [criteria] }];
  } else {
    const admission = /(?:giá vé|phí tham quan|vé tham quan|phí vào cửa)/u.test(text);
    const hours = /(?:giờ mở cửa|giờ hoạt động|khung giờ)/u.test(text);
    const schedule = /(?:ngày dương lịch|lịch tổ chức|ngày nào|khi nào)/u.test(text) && /(?:tổ chức|diễn ra)/u.test(text);
    const activities = /(?:hoạt động|chương trình)/u.test(text);
    if (!admission && !hours && !(year && (schedule || activities))) return undefined;
    const named = text.match(/\bcủa\s+(.+?)(?:\s+(?:trong\s+)?năm\s+\d{4})?(?:\s+(?:là|vào|bao nhiêu|như thế nào)(?=\s|$).*)?$/u)?.[1]
      ?? text.match(/^(.+?)\s+năm\s+\d{4}\s+(?:sẽ|được|có|tổ chức|diễn ra)/u)?.[1];
    let name = context.type === "DESTINATION" ? context.name : named && subject(named);
    if (!name && history.length && /^(?:còn|vậy|thế|giá vé|giờ mở cửa)/u.test(text)) {
      const prior = planQaQuestion(history.at(-1)!.question, [], context);
      if (prior?.subjects.length === 1) name = prior.subjects[0];
    }
    if (!name) return undefined;
    subjects = [name];
    if (admission) attributes.push({ attribute: "giá vé tham quan", kind: "ADMISSION" });
    if (hours) attributes.push({ attribute: "giờ mở cửa", kind: "OPENING_HOURS" });
    if (schedule) attributes.push({ attribute: "ngày tổ chức dương lịch", kind: "OTHER" });
    if (activities) attributes.push({ attribute: "chương trình hoạt động", kind: "CULTURE" });
  }
  const facets = subjects.flatMap((name, si) => attributes.map((a, ai) => ({ id: `q${si + 1}_${ai + 1}`, subject: name, ...a, ...(year ? { year } : {}) })));
  return { comparison: subjects.length > 1, subjects, facets };
}

/** Literal scope guards only exclude invalid supports. They never establish
 * semantic entailment, current validity or official status. */
export function qaSupportMatchesFacet(facet: QaRequestedFacet, sentence: string, sourceTitle: string): boolean {
  const text = qaFactualQuestion(sentence);
  const words = (value: string) => qaFactualQuestion(value).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  if (!` ${words(`${sourceTitle} ${sentence}`)} `.includes(` ${words(facet.subject)} `)) return false;
  if (/review_required|chưa (?:được )?xác minh|chưa có (?:thông tin|bảng giá|lịch|chương trình).*chính thức/u.test(text)) return false;
  const years: readonly string[] = sentence.match(/\b(?:19|20|21)\d{2}\b/gu) ?? [];
  if (facet.year && (!years.includes(facet.year) || years.some(year => year !== facet.year))) return false;
  return true;
}
