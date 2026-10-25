import "server-only";
import { AppError } from "../../server/http/app-error";
import type { QaAnswer, QaGenerationInput } from "./qa-runtime-contract";
import { qaOrigin } from "./qa-diagnostics";

import { qaScopedEvidenceSentences, evidenceSentences } from "./qa-prompt";

/** Verifies that every generated answer part has valid citations corresponding to
 * eligible evidence chunks in the current retrieval turn. Verbatim sentence matching
 * and assessor/verifier gates are removed per approved product invariants. */
export function assertQaAnswerGrounding(answer: QaAnswer, input: QaGenerationInput): void {
  if (answer.status !== "ANSWERED" && answer.status !== "PARTIAL") return;
  const reject = (cat: any = "UNSUPPORTED_SENTENCE") =>
    qaOrigin(new AppError("AI_INVALID_RESPONSE", "Phản hồi AI không có căn cứ phù hợp.", 502), "GROUNDING_VALIDATION", cat);

  if (!answer.answerParts.length) throw reject("OUTCOME_CONSISTENCY");
  const evidenceCitationIds = new Set(input.evidence.map(e => e.citationId));

  for (const part of answer.answerParts) {
    if (!part.text || !part.text.trim()) throw reject("OUTCOME_CONSISTENCY");
    const mode = (part as { mode?: string }).mode ?? "SOURCE";
    if (mode === "SOURCE") {
      if (!part.citationIds.length) throw reject("CITATION_REFERENCE");
      for (const id of part.citationIds) {
        if (!evidenceCitationIds.has(id)) throw reject("CITATION_REFERENCE");
      }
    } else if (mode === "EXPANDED") {
      // Expanded parts MUST NOT have document citations
      if (part.citationIds.length > 0) throw reject("CITATION_REFERENCE");
      // Expanded parts are only permitted when knowledgeMode === "EXPANDED"
      if (input.knowledgeMode !== "EXPANDED") throw reject("OUTCOME_CONSISTENCY");
    } else {
      throw reject("OUTCOME_CONSISTENCY");
    }
  }

  if (input.context.type === "DESTINATION") {
    for (const part of answer.answerParts) {
      if (((part as { mode?: string }).mode ?? "SOURCE") === "SOURCE") {
        for (const id of part.citationIds) {
          const item = input.evidence.find(e => e.citationId === id);
          if (item) {
            const scoped = qaScopedEvidenceSentences(item.text, input);
            if (scoped.length === 0) throw reject("OUTCOME_CONSISTENCY");
            const allSentences = evidenceSentences(item.text);
            const unscoped = allSentences.filter(s => !scoped.includes(s));
            if (unscoped.some(u => part.text.includes(u))) throw reject("UNSUPPORTED_SENTENCE");
          }
        }
      }
    }
  }
}
