import type { QaCompletedTurn, QaPublicCitation } from "./qa-contract";
import type { QaResolvedContext } from "./qa-destination-context";

// Server-internal only. Never serialize this registry to the browser.
export type QaEvidence = {
  citationId: string;
  documentId: string;
  generationId: string;
  contentVersionId: string;
  chunkId: string;
  chunkHash: string;
  text: string;
  tokenCount: number;
  score: number;
  citation: QaPublicCitation;
};
export type QaHistoryTurn = { question: string; response: QaCompletedTurn };
export type QaGenerationInput = {
  question: string;
  history: readonly QaHistoryTurn[];
  evidence: readonly QaEvidence[];
  context: QaResolvedContext;
  signal?: AbortSignal;
};
export type QaAnswer =
  | Pick<Extract<QaCompletedTurn, { status: "ANSWERED" }>, "status" | "answerParts" | "citations" | "unansweredAspects">
  | Pick<Extract<QaCompletedTurn, { status: "PARTIAL" }>, "status" | "answerParts" | "citations" | "unansweredAspects">
  | Pick<Extract<QaCompletedTurn, { status: "INSUFFICIENT_SOURCE" }>, "status" | "answerParts" | "citations" | "message">
  | Pick<Extract<QaCompletedTurn, { status: "CLARIFICATION_REQUIRED" }>, "status" | "answerParts" | "citations" | "clarificationQuestion">;
export interface QaRetriever {
  retrieve(question: string, history: readonly QaHistoryTurn[], signal?: AbortSignal, context?: QaResolvedContext): Promise<QaEvidence[]>;
  recheck(evidence: readonly QaEvidence[]): Promise<boolean>;
}
export interface QaGenerator { generate(input: QaGenerationInput): Promise<QaAnswer> }
export type QaPrincipal = { kind: "GUEST" | "USER"; id: string; networkId?: string };
