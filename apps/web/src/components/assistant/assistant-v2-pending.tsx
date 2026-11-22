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

/** ChatGPT-style pending turn: the question sits in its bubble at once, then live AI steps & progressive text. */
export function AssistantPendingTurn({
  question,
  sending = true,
  statusLabel,
  steps,
  streamedText,
}: {
  question: string;
  sending?: boolean;
  statusLabel?: string;
  steps?: readonly string[];
  streamedText?: string;
}) {
  const activeLabel = statusLabel || "Đang suy nghĩ…";
  const completedSteps = (steps ?? []).filter((s) => s !== activeLabel);
  return <div className="assistant-turn assistant-planning-exchange assistant-local-attempt">
    <article className="assistant-message assistant-user" aria-label="Câu hỏi của bạn"><p>{question}</p>{!sending && <small>Chưa được xác nhận lưu</small>}</article>
    {sending && <article className="assistant-message assistant-answer assistant-pending-answer" aria-label="Phản hồi của trợ lý">
      <span className="assistant-speaker"><Sparkles className="assistant-speaker-icon" aria-hidden="true"/><span>Trợ lý AI</span></span>
      <div className="assistant-typing-indicator" role="status" aria-label={activeLabel}>
        <span className="assistant-typing-dots" aria-hidden="true"><span className="assistant-typing-dot"/><span className="assistant-typing-dot"/><span className="assistant-typing-dot"/></span>
        <span className="assistant-typing-label">{activeLabel}</span>
      </div>
      {completedSteps.length > 0 && (
        <ul className="assistant-muted" style={{ margin: "6px 0 0", paddingLeft: "18px", fontSize: "0.82rem", lineHeight: 1.45 }}>
          {completedSteps.map((step, idx) => (
            <li key={`${step}-${idx}`}>{step.replace(/…$/, "")}</li>
          ))}
        </ul>
      )}
      {streamedText && (
        <div className="assistant-stream-preview" style={{ marginTop: "10px", whiteSpace: "pre-wrap", lineHeight: 1.65 }}>
          {streamedText}
        </div>
      )}
    </article>}
  </div>;
}
