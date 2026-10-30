"use client";
import { Minus, Sparkles } from "lucide-react";

/** V2 placeholder shown until the identity is verified (or when the session cannot be verified).
 * It carries no composer, so nothing can be sent before the principal is known. */
export function AssistantV2Pending({ mode = "page", failed = false, onRetry, onMinimize }: { mode?: "page" | "panel"; failed?: boolean; onRetry?: () => void; onMinimize?: () => void }) {
  return <section className={`${mode === "panel" ? "assistant-chat assistant-chat-panel" : "assistant-chat"} assistant-v2-chat`} data-runtime="v2" data-mode="pending" aria-label="Trợ lý AI" lang="vi">
    <div className={`assistant-chat-main ${mode === "panel" ? "assistant-panel-main" : "assistant-chat-fullscreen"}`}>
      {mode === "panel" && onMinimize && <div className="destination-panel-actions"><button type="button" className="destination-panel-action-btn" onClick={onMinimize} aria-label="Thu nhỏ trợ lý" title="Thu nhỏ"><Minus aria-hidden="true" size={16}/></button></div>}
      <div className="assistant-empty">
        <Sparkles className="assistant-icon" aria-hidden="true"/>
        {failed
          ? <><p role="alert">Chưa kết nối được trợ lý AI. Bạn có thể thử lại.</p>{onRetry && <button type="button" onClick={onRetry}>Thử lại</button>}</>
          : <p role="status">Đang kết nối trợ lý AI…</p>}
      </div>
    </div>
  </section>;
}
