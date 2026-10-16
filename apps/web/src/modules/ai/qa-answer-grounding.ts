import "server-only";
import { AppError } from "../../server/http/app-error";
import { evaluateQaSourceSufficiency } from "./qa-source-sufficiency";
import type { QaAnswer, QaGenerationInput } from "./qa-runtime-contract";
import { qaOrigin } from "./qa-diagnostics";
import { hasQaSynthesisCertificate } from "./qa-synthesis-verification";

/** Review is an assessment, not independent evidence. Every accepted sentence/
 * citation pair traces back to current scoped sources. Both adapters and the
 * service enforce this before persistence; model status is never authority. */
export function assertQaAnswerGrounding(answer: QaAnswer, input: QaGenerationInput): void {
  if (answer.status !== "ANSWERED" && answer.status !== "PARTIAL") return;
  const reject = () => qaOrigin(new AppError("AI_INVALID_RESPONSE", "Phản hồi AI không có căn cứ phù hợp.", 502), "GROUNDING_VALIDATION", "UNSUPPORTED_SENTENCE");
  const decision = evaluateQaSourceSufficiency({ kind: "COMPLETED", eligibility: "CURRENT", input, review: input.sourceReview });
  if (!input.sourceReview || (decision.status !== "SUFFICIENT" && decision.status !== "PARTIAL") ||
    (answer.status === "ANSWERED" ? decision.status !== "SUFFICIENT" : decision.status !== "PARTIAL")) throw reject();
  if (hasQaSynthesisCertificate(answer, input)) return;
  const aspects = input.sourceReview.aspects.filter(aspect => aspect.status === "SUPPORTED");
  const pair = (id: string, sentence: string) => JSON.stringify([id, sentence.normalize("NFC").trim()]);
  const allowed = new Set(aspects.flatMap(aspect => aspect.supports.map(ref => pair(ref.citationId, ref.sentence))));
  const returned = new Set<string>();
  for (const part of answer.answerParts) {
    if (!part.citationIds.length) throw reject();
    for (const id of part.citationIds) {
      const key = pair(id, part.text);
      if (!allowed.has(key)) throw reject();
      returned.add(key);
    }
  }
  // PARTIAL may omit only aspects actually marked MISSING.
  if (aspects.some(aspect => !aspect.supports.some(ref => returned.has(pair(ref.citationId, ref.sentence))))) throw reject();
}
