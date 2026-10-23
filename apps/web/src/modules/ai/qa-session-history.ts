import { countEmbeddingTokens } from "../rag-processing/embedding-tokenizer";
import type { QaHistoryTurn } from "./qa-runtime-contract";

export const QA_SESSION_HISTORY_LIMITS = { turns: 12, tokens: 1500 } as const;

/** Input is exclusively the owned, completed parent chain from the store.
 * Keep whole questions in a contiguous recent window: never skip a condition
 * to reach an older subject. Responses are not serialized into model prompts. */
export function qaSessionHistory(history: readonly QaHistoryTurn[]): QaHistoryTurn[] {
  const selected: QaHistoryTurn[] = [];
  let tokens = 0;
  for (const turn of history.slice(-QA_SESSION_HISTORY_LIMITS.turns).reverse()) {
    if (turn.response.status === "CONVERSATIONAL") continue;
    const question = turn.question.normalize("NFC").trim();
    if (!question) continue;
    const cost = countEmbeddingTokens(JSON.stringify(question));
    if (tokens + cost > QA_SESSION_HISTORY_LIMITS.tokens) break;
    tokens += cost;
    selected.push({ ...turn, question });
  }
  return selected.reverse();
}
