/** Behavioural metrics over a recorded conversation, used by the V2 evaluation. Pure: no model, no I/O.
 * The Dev fixture prefix "[TEST]" belongs to the data, not to the conversation, so it is stripped first. */
export type EvalTurn = {
  user: string; reply: string; goal: string;
  proposalVersion: number | null; proposalId: string | null;
  known: { durationDays?: number | null; transport?: string | null };
};
export type TranscriptScore = {
  questionsBeforeProposal: number; redundantQuestions: number;
  caveatViolations: { turn: number; reason: "MORE_THAN_ONE_CAVEAT_ON_CHANGE" | "CAVEAT_ON_UNRELATED_READ_ONLY" }[];
  caveatTurns: number; mechanicalPhrases: number; jargonLeaks: number; lodgingFabrication: number; readOnlyMutations: number[];
};

const plain = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
const clean = (reply: string) => reply.replace(/\[TEST\]\s*/g, "");
const CAVEAT_SENTENCE = /chưa lưu|chưa kiểm tra|chưa có ngày|chưa đủ dữ liệu|giờ mở cửa (?:vẫn|chưa|cần)|cần kiểm tra lại|chưa đạt/i;
const CHANGES_PROPOSAL = new Set(["PRESENT_PROPOSAL", "REFINE_PROPOSAL", "REPLAN_PROPOSAL"]);
const READ_ONLY = new Set(["PLANNING_GUIDANCE", "ACKNOWLEDGE_NO_CHANGE", "QA_ANSWER", "QA_FAILED", "QA_UNSUPPORTED", "QA_CLARIFY", "CLARIFY", "ASK_DURATION", "ASK_TRANSPORT"]);
const ASKS_DURATION = /may ngay|bao nhieu ngay/, ASKS_TRANSPORT = /o to hay xe may|xe may hay o to|phuong tien (?:nao|gi)/;
const MECHANICAL = /^(?:mình (?:đã )?ghi nhận|thông tin của bạn là|bạn muốn điều chỉnh cụ thể điều gì)/i;
const JARGON = /fingerprint|capsule|workspace|version|validator|\bPASS\b|\bintent\b|action id|ACTION_|AI_UNAVAILABLE|INVALID_AI_PLAN|REPLAN_|PLANNING_GUIDANCE|\bgoal\b/i;
const LODGING = /khách sạn|homestay|đặt phòng|giá phòng|còn phòng|nhà nghỉ/i;
/** Whether the user's own question is about checks, the date or saving (the only read-only case that may carry a caveat). */
const ASKS_ABOUT_STATUS = /\bluu\b|kiem tra|gio mo|ngay (?:di|khoi hanh)|chot ngay|hop le|\bon (?:khong|chua)|duoc khong/;

const sentences = (text: string) => text.split(/(?<=[.!])\s+/);
const caveatCount = (reply: string) => sentences(reply).filter(sentence => CAVEAT_SENTENCE.test(sentence)).length;

export function scoreTranscript(turns: readonly EvalTurn[]): TranscriptScore {
  let proposalSeen = false, questionsBeforeProposal = 0, redundantQuestions = 0, mechanicalPhrases = 0, jargonLeaks = 0, lodgingFabrication = 0, caveatTurns = 0;
  const caveatViolations: TranscriptScore["caveatViolations"] = [], readOnlyMutations: number[] = [];
  turns.forEach((turn, index) => {
    const reply = clean(turn.reply), text = plain(reply), count = caveatCount(reply);
    if (!proposalSeen && reply.includes("?")) questionsBeforeProposal++;
    if (CHANGES_PROPOSAL.has(turn.goal)) proposalSeen = true;
    const questioned = reply.includes("?"), demanded = /cho minh biet|hay cho minh|nhan minh/.test(text);
    const durationAsked = !!turn.known.durationDays && (questioned && ASKS_DURATION.test(text) || demanded && /so ngay|may ngay/.test(text));
    const transportAsked = !!turn.known.transport && (questioned && ASKS_TRANSPORT.test(text) || demanded && /phuong tien|o to|xe may/.test(text));
    if (durationAsked || transportAsked) redundantQuestions++;
    if (MECHANICAL.test(reply.trim())) mechanicalPhrases++;
    if (JARGON.test(reply)) jargonLeaks++;
    if (LODGING.test(reply.replace(/[^.]*(?:không phải|chưa có dữ liệu|chưa phải)[^.]*\./gi, ""))) lodgingFabrication++;
    if (count) caveatTurns++;
    if (CHANGES_PROPOSAL.has(turn.goal) && count > 1) caveatViolations.push({ turn: index, reason: "MORE_THAN_ONE_CAVEAT_ON_CHANGE" });
    else if (READ_ONLY.has(turn.goal) && !turn.goal.startsWith("QA_") && count && !ASKS_ABOUT_STATUS.test(plain(turn.user))) caveatViolations.push({ turn: index, reason: "CAVEAT_ON_UNRELATED_READ_ONLY" });
    const previous = turns[index - 1];
    if (READ_ONLY.has(turn.goal) && previous && previous.proposalId !== null && (turn.proposalVersion !== previous.proposalVersion || turn.proposalId !== previous.proposalId)) readOnlyMutations.push(index);
  });
  return { questionsBeforeProposal, redundantQuestions, caveatViolations, caveatTurns, mechanicalPhrases, jargonLeaks, lodgingFabrication, readOnlyMutations };
}
