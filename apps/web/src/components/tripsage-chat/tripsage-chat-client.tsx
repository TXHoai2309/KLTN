"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Send, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import TripJourneyEditor from "@/components/trip-origin/trip-journey-editor";
import { missingJourneyFields, type TripJourney } from "@/modules/trip-origin/trip-origin-contract";

import type { SaveState } from "@/modules/trip-save/trip-save-state";
import { isTripSaveNavigationLocked } from "@/modules/trip-save/trip-save-state";

import { parseItineraryPart, TripsageItineraryView } from "./tripsage-itinerary-view";
import { TripsageSaveSection } from "./tripsage-save-section";

type StatusPart = { kind: "start" | "checking" | "writing"; label: string };

const MAX_LENGTH = 1000;

/**
 * Vietnamese streaming planning chat. The origin and journey clocks are chosen with the existing KLTN
 * origin picker (search / map pin / explicit confirm) and sent as `journey`; the model never sees or invents coordinates.
 */
export function TripsageChatClient() {
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<StatusPart | null>(null);
  const [journey, setJourney] = useState<TripJourney | null>(null);
  const journeyRef = useRef<TripJourney | null>(null);
  journeyRef.current = journey;
  const journeyMissing = missingJourneyFields(journey).length;
  const transport = useMemo(() => new DefaultChatTransport({
    api: "/api/ai/chat",
    prepareSendMessagesRequest: ({ messages }) => ({ body: { messages, journey: journeyRef.current } }),
  }), []);
  const { messages, sendMessage, status: chatStatus, error, stop } = useChat({
    transport,
    onData: part => { if (part.type === "data-status") setStatus(part.data as StatusPart); },
  });
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const saveLocked = isTripSaveNavigationLocked(saveState);
  const busy = chatStatus === "submitted" || chatStatus === "streaming";
  const lastItineraryMessageId = [...messages].reverse().find(m => m.role === "assistant" && m.parts.some(p => p.type === "data-itinerary" && parseItineraryPart(p.data)))?.id;
  useEffect(() => { if (!busy) setStatus(null); }, [busy]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy || saveLocked) return;
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
                <p>Cho mình biết phương tiện, số ngày, ngày bắt đầu và sở thích, rồi chọn điểm xuất phát bên dưới để mình lập kế hoạch.</p>
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
                    {itinerary && <TripsageItineraryView proposal={itinerary}>{message.id === lastItineraryMessageId && !busy && <TripsageSaveSection result={itinerary} onStateChange={setSaveState} />}</TripsageItineraryView>}
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
          <details className="tripsage-journey-panel" open={!journey?.origin?.confirmed}>
            <summary>Điểm xuất phát{journeyMissing === 0 ? " (đã xác nhận)" : " (cần xác nhận để lập lịch)"}</summary>
            <TripJourneyEditor journey={journey} onChange={setJourney} disabled={busy || saveLocked} />
          </details>
          <form noValidate className="assistant-composer" onSubmit={submit}>
            <label htmlFor="tripsage-chat-input" className="assistant-sr-only">Tin nhắn cho trợ lý</label>
            <div className="assistant-composer-input">
              <textarea id="tripsage-chat-input" className="resize-none" rows={1} maxLength={MAX_LENGTH} placeholder="Nhập yêu cầu chuyến đi Hà Giang…" value={draft} disabled={busy || saveLocked}
                onChange={event => setDraft(event.target.value)}
                onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
              <div className="assistant-composer-bar">
                {busy ? <button type="button" onClick={() => void stop()}><span>Dừng</span></button> : <button type="submit" disabled={!draft.trim() || saveLocked}><Send aria-hidden="true" /><span>Gửi</span></button>}
              </div>
            </div>
            <div className="assistant-composer-footer"><span>Enter để gửi · Shift+Enter xuống dòng</span><span className="assistant-char-counter">{draft.length}/{MAX_LENGTH} ký tự</span></div>
          </form>
        </div></div>
      </div>
    </section>
  );
}
