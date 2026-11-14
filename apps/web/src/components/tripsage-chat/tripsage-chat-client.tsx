"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Send, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { parseItineraryPart, TripsageItineraryView } from "./tripsage-itinerary-view";

type StatusPart = { kind: "start" | "checking" | "writing"; label: string };

const MAX_LENGTH = 1000;

/** Vietnamese streaming planning chat. Progress and prose only; no itinerary result yet. */
export function TripsageChatClient() {
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<StatusPart | null>(null);
  const transport = useMemo(() => new DefaultChatTransport({
    api: "/api/ai/chat",
    prepareSendMessagesRequest: ({ messages }) => ({ body: { messages } }),
  }), []);
  const { messages, sendMessage, status: chatStatus, error, stop } = useChat({
    transport,
    onData: part => { if (part.type === "data-status") setStatus(part.data as StatusPart); },
  });
  const busy = chatStatus === "submitted" || chatStatus === "streaming";
  useEffect(() => { if (!busy) setStatus(null); }, [busy]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    void sendMessage({ text });
  }

  return (
    <section className="assistant-chat assistant-v2-chat" aria-label="Trợ lý lập hành trình" aria-busy={busy} lang="vi">
      <div className="assistant-chat-main assistant-chat-fullscreen">
        <div className="assistant-transcript" tabIndex={0} aria-label="Danh sách tin nhắn">
          <div className="assistant-transcript-inner">
            {!messages.length && (
              <div className="assistant-empty">
                <Sparkles className="assistant-icon" aria-hidden="true" />
                <h2>Bạn muốn đi Hà Giang như thế nào?</h2>
                <p>Cho mình biết phương tiện, số ngày và sở thích để mình giúp lên kế hoạch.</p>
              </div>
            )}
            <div className="assistant-messages" aria-live="polite">
              {messages.map(message => {
                const text = message.parts.map(part => (part.type === "text" ? part.text : "")).join("");
                // Latest data-itinerary part wins (same id replaces); only schema-valid results render.
                const itinerary = message.role === "assistant" ? [...message.parts].reverse().map(part => (part.type === "data-itinerary" ? parseItineraryPart(part.data) : null)).find(Boolean) ?? null : null;
                if (!text && !itinerary) return null;
                return message.role === "user" ? (
                  <article key={message.id} className="assistant-message assistant-user"><p>{text}</p></article>
                ) : (
                  <article key={message.id} className="assistant-message assistant-answer">
                    <span className="assistant-speaker"><Sparkles className="assistant-speaker-icon" aria-hidden="true" /><span>Trợ lý AI</span></span>
                    {itinerary && <TripsageItineraryView proposal={itinerary} />}
                    {text && <p style={{ whiteSpace: "pre-wrap" }}>{text}</p>}
                  </article>
                );
              })}
            </div>
            {busy && <p role="status" className="assistant-muted">{status?.label ?? "Mình đang xử lý yêu cầu…"}</p>}
          </div>
        </div>
        <div className="assistant-bottom-dock"><div className="assistant-bottom-dock-inner">
          {error && <p role="alert" className="assistant-planning-error" style={{ margin: "0 0 6px", color: "#b42318", fontSize: 12.5 }}>Trợ lý tạm thời không phản hồi được. Nội dung của bạn vẫn được giữ, hãy thử lại.</p>}
          <form noValidate className="assistant-composer" onSubmit={submit}>
            <label htmlFor="tripsage-chat-input" className="assistant-sr-only">Tin nhắn cho trợ lý</label>
            <div className="assistant-composer-input">
              <textarea id="tripsage-chat-input" className="resize-none" rows={1} maxLength={MAX_LENGTH} placeholder="Nhập yêu cầu chuyến đi Hà Giang…" value={draft} disabled={busy}
                onChange={event => setDraft(event.target.value)}
                onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
              <div className="assistant-composer-bar">
                {busy ? <button type="button" onClick={() => void stop()}><span>Dừng</span></button> : <button type="submit" disabled={!draft.trim()}><Send aria-hidden="true" /><span>Gửi</span></button>}
              </div>
            </div>
            <div className="assistant-composer-footer"><span>Enter để gửi · Shift+Enter xuống dòng</span><span className="assistant-char-counter">{draft.length}/{MAX_LENGTH} ký tự</span></div>
          </form>
        </div></div>
      </div>
    </section>
  );
}
