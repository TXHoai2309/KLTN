"use client";
import { Minus, Sparkles } from "lucide-react";

/** V2 placeholder shown until the identity is verified (or when the session cannot be verified).
 * It carries no composer, so nothing can be sent before the principal is known. */
export function AssistantV2Pending({ mode = "page", failed = false, unavailable = false, onRetry, onMinimize }: { mode?: "page" | "panel"; failed?: boolean; unavailable?: boolean; onRetry?: () => void; onMinimize?: () => void }) {
  return <section className={`${mode === "panel" ? "assistant-chat assistant-chat-panel" : "assistant-chat"} assistant-v2-chat`} data-runtime="v2" data-mode="pending" aria-label="Trợ lý AI" lang="vi">
    <div className={`assistant-chat-main ${mode === "panel" ? "assistant-panel-main" : "assistant-chat-fullscreen"}`}>
      {mode === "panel" && onMinimize && <div className="destination-panel-actions"><button type="button" className="destination-panel-action-btn" onClick={onMinimize} aria-label="Thu nhỏ trợ lý" title="Thu nhỏ"><Minus aria-hidden="true" size={16}/></button></div>}
      <div className="assistant-empty">
        <Sparkles className="assistant-icon" aria-hidden="true"/>
        {unavailable
          ? <p role="alert">Trợ lý AI chưa khả dụng.</p>
          : failed
          ? <><p role="alert">Chưa kết nối được trợ lý AI. Bạn có thể thử lại.</p>{onRetry && <button type="button" onClick={onRetry}>Thử lại</button>}</>
          : <p role="status">Đang kết nối trợ lý AI…</p>}
      </div>
    </div>
  </section>;
}

/** ChatGPT-style pending turn: the question sits in its bubble at once, then the assistant's thinking indicator. */
export function AssistantPendingTurn({ question, sending = true }: { question: string; sending?: boolean }) {
  return <div className="assistant-turn assistant-planning-exchange assistant-local-attempt">
    <article className="assistant-message assistant-user" aria-label="Câu hỏi của bạn"><p>{question}</p>{!sending && <small>Chưa được xác nhận lưu</small>}</article>
    {sending && <article className="assistant-message assistant-answer assistant-pending-answer" aria-label="Phản hồi của trợ lý">
      <span className="assistant-speaker"><Sparkles className="assistant-speaker-icon" aria-hidden="true"/><span>Trợ lý AI</span></span>
      <div className="assistant-typing-indicator" role="status" aria-label="Trợ lý AI đang soạn câu trả lời">
        <span className="assistant-typing-dots" aria-hidden="true"><span className="assistant-typing-dot"/><span className="assistant-typing-dot"/><span className="assistant-typing-dot"/></span>
        <span className="assistant-typing-label">Đang suy nghĩ…</span>
      </div>
    </article>}
  </div>;
}
