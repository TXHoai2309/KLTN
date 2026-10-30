"use client";

import { useId, type ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { AssistantCitations, AssistantSourceList } from "./assistant-citations";
import { buildCitationIndex } from "./assistant-citation-utils";
import type { QaContext, QaAnswerPart, QaCompletedTurn, QaPublicCitation } from "../../modules/ai/qa-contract";
import type { ConfirmedTurn } from "./assistant-controller";
import { AssistantAnswerContent } from "./assistant-answer-content";
import { assistantSourceReply } from "./assistant-source-reply";

export type CitationSlot = (input: { part: QaAnswerPart; citations: QaPublicCitation[]; turn: QaCompletedTurn }) => ReactNode;

export function AssistantAnswer({ turn, citationSlot, question, showSources = true }: { turn: QaCompletedTurn; citationSlot?: CitationSlot; question?: string; showSources?: boolean }) {
  const sourcePrefix = useId();
  if (turn.status === "CONVERSATIONAL") return <p>{turn.message}</p>;
  if (turn.status === "INSUFFICIENT_SOURCE") {
    const reply = assistantSourceReply(turn, question);
    return <div className="assistant-source-reply"><p>{reply.explanation}</p><p>{reply.nextStep}</p></div>;
  }
  if (turn.status === "CLARIFICATION_REQUIRED") return <p>{turn.clarificationQuestion}</p>;
  const citationIndex = buildCitationIndex(turn);
  const sources = (part: QaAnswerPart) => {
    if (citationSlot) {
      const custom = citationSlot({ part, citations: turn.citations, turn });
      if (custom !== null && custom !== undefined) return custom;
    }
    if (!showSources) return null;
    if (!citationIndex) return <AssistantCitations part={part} index={null} />;
    const visibleCount = part.citationIds.filter(id => citationIndex.has(id)).length;
    if (!visibleCount) return null;
    return <AssistantCitations part={part} index={citationIndex} />;
  };
  return <>
    {turn.answerMode === "SOURCE_EXCERPTS" && <p className="assistant-source-notice">Thông tin dưới đây được trích nguyên văn từ tài liệu đã được đánh giá cho câu hỏi này.</p>}
    {turn.status === "PARTIAL" && <p className="assistant-muted">Mình tìm được một phần thông tin bạn hỏi:</p>}
    <AssistantAnswerContent parts={turn.answerParts} presentation={turn.presentation} sources={citationSlot || showSources ? sources : undefined} />
    {(citationSlot || showSources) && (citationIndex ? <AssistantSourceList index={citationIndex} sourcePrefix={sourcePrefix}/> : <p className="assistant-citations-error">Thông tin nguồn không khả dụng.</p>)}
    {turn.status === "PARTIAL" && <div className="assistant-unanswered"><strong>Phần chưa đủ dữ liệu</strong><ul>{turn.unansweredAspects.map((aspect, index) => <li key={index}>{aspect}</li>)}</ul></div>}
  </>;
}

export function AssistantTurn({ turn, citationSlot, showSources = false }: { turn: ConfirmedTurn; citationSlot?: CitationSlot; showSources?: boolean }) {
  return <div className="assistant-turn">
    <article className="assistant-message assistant-user" aria-label="Câu hỏi đã được xác nhận"><p>{turn.question}</p><small>Đã xác nhận lượt hỏi</small></article>
    <article className="assistant-message assistant-answer" aria-label="Phản hồi của trợ lý">
      <span className="assistant-speaker">
        <Sparkles className="assistant-speaker-icon" aria-hidden="true" />
        <span>Trợ lý AI</span>
      </span>
      <AssistantAnswer turn={turn.response} question={turn.question} citationSlot={citationSlot} showSources={showSources} />
    </article>
  </div>;
}

export const PROMPT_SUGGESTIONS = [
  { icon: "🗺️", title: "Giới thiệu điểm đến", prompt: (subject: string) => `Giới thiệu ngắn gọn về ${subject}.` },
  { icon: "🏛️", title: "Danh hiệu và xếp hạng", prompt: (subject: string) => `${subject} có danh hiệu hoặc xếp hạng nào?` },
  { icon: "🏔️", title: "Đặc điểm tự nhiên", prompt: (subject: string) => `${subject} có những đặc điểm tự nhiên nào nổi bật?` },
  { icon: "🌿", title: "Văn hóa bản địa", prompt: (subject: string) => `${subject} có những nét văn hóa nào đáng chú ý?` },
] as const;

/** Context handed to the assistant chat by the page that hosts it. */
export type AssistantContextProps = {
  initialContext?: QaContext;
  destinations?: readonly { id: string; name: string }[];
  contextError?: string;
  syncContextUrl?: boolean;
};

/** Page frame around the single assistant chat. */
export function AssistantShell({ children }: { children: ReactNode }) {
  return (
    <main className="assistant-page assistant-page-fullscreen" lang="vi">
      <h1 className="assistant-sr-only">Trợ lý AI Hà Giang</h1>
      {children}
    </main>
  );
}
