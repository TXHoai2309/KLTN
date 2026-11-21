"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Send, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import type { TripJourney } from "@/modules/trip-origin/trip-origin-contract";
import { buildTripsageChatBody, summarizeItinerary } from "@/modules/tripsage-chat/tripsage-chat-context";

import type { SaveState } from "@/modules/trip-save/trip-save-state";
import { isTripSaveNavigationLocked } from "@/modules/trip-save/trip-save-state";

import { parseItineraryPart, TripsageItineraryView } from "./tripsage-itinerary-view";
import { parsePlacesPart, TripsagePlacesView } from "./tripsage-places-view";
import { parseSourcesPart, TripsageSourcesView } from "./tripsage-sources-view";
import { TripsageSaveSection } from "./tripsage-save-section";
import { TripsageChatNotice } from "./tripsage-chat-notice";
import { TripsageTripSummary } from "./tripsage-trip-summary";
import { TripsageOriginCard } from "./tripsage-origin-card";
import { TripsageMarkdown } from "./tripsage-markdown";
import { readConversationState } from "./tripsage-conversation-state";
import { readTripsageResultTurns, TripsageResultCards } from "./tripsage-result-cards";
import { TripsageMemoryPanel } from "./tripsage-memory-panel";
import { classifyChatError, createTripsageChatFetch } from "@/modules/tripsage-chat/tripsage-chat-errors";

type StatusPart = { kind: "start" | "checking" | "writing"; label: string };

const MAX_LENGTH = 1000;
const OPENING_PROMPTS = ["Đi Hà Giang 4 ngày 3 đêm bằng xe máy", "Mình ở Sài Gòn, muốn đi Hà Giang", "Gợi ý giúp mình một chuyến Hà Giang"];
const clock = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

/**
 * Vietnamese streaming planning chat led by the assistant (ADR-42). Trip info is recorded by the assistant and comes back
 * as `data-trip-info`; the origin is picked in an in-chat card. Both, plus a compact summary of the current itinerary,
 * travel in the request body. The model never sees coordinates.
 */
export function TripsageChatClient({ memoryEnabled = false }: { memoryEnabled?: boolean }) {
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<StatusPart | null>(null);
  const [journey, setJourney] = useState<TripJourney | null>(null);
  // The itinerary message that was current when the origin changed; that itinerary is no longer current (B.3).
  const [originChangedAfter, setOriginChangedAfter] = useState<string | null>(null);
  const bodyRef = useRef<Omit<Parameters<typeof buildTripsageChatBody>[0], "messages">>({ journey: null, tripInfo: null, itinerary: null });
  const transport = useMemo(() => new DefaultChatTransport({
    api: "/api/ai/chat",
    fetch: createTripsageChatFetch(),
    prepareSendMessagesRequest: ({ messages }) => ({ body: buildTripsageChatBody({ messages, ...bodyRef.current }) }),
  }), []);
  const { messages, sendMessage, status: chatStatus, error, stop, regenerate } = useChat({
    transport,
    onData: part => { if (part.type === "data-status") setStatus(part.data as StatusPart); },
  });
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const saveLocked = isTripSaveNavigationLocked(saveState);
  const notice = chatStatus === "error" ? classifyChatError(error) : null;
  const busy = chatStatus === "submitted" || chatStatus === "streaming";
  const locked = busy || saveLocked;
  const { turns: resultTurns, latestBudgetMessageId } = useMemo(() => readTripsageResultTurns(messages), [messages]);
  const state = useMemo(() => readConversationState(messages, data => parseItineraryPart(data) !== null), [messages]);
  const lastItineraryMessageId = state.lastItineraryMessageId;
  // Only the newest itinerary is shown and sent back: a re-proposal replaces the previous one.
  const latestItinerary = lastItineraryMessageId ? messages.find(m => m.id === lastItineraryMessageId)?.parts.map(part => (part.type === "data-itinerary" ? parseItineraryPart(part.data) : null)).filter(Boolean).at(-1) ?? null : null;
  const itineraryCurrent = latestItinerary && !state.itineraryStale && originChangedAfter !== lastItineraryMessageId;
  bodyRef.current = { journey, tripInfo: state.tripInfo, itinerary: itineraryCurrent ? summarizeItinerary(latestItinerary) : null };
  useEffect(() => { if (!busy) setStatus(null); }, [busy]);

  function send(text: string) {
    if (!text.trim() || locked) return;
    void sendMessage({ text });
  }
  function confirmOrigin(next: TripJourney) {
    if (journey?.origin && lastItineraryMessageId) setOriginChangedAfter(lastItineraryMessageId);
    setJourney(next);
    // The transport reads the ref when the message below is sent, before the next render.
    bodyRef.current = { ...bodyRef.current, journey: next, itinerary: journey?.origin ? null : bodyRef.current.itinerary };
    send(`Mình xuất phát từ ${next.origin?.label ?? "điểm đã chọn"}, khởi hành ${clock(next.departureMinute ?? 0)}, hạn về ${clock(next.returnDeadlineMinute ?? 0)}.`);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || locked) return;
    setDraft("");
    send(text);
  }

  return (
    <section className="assistant-chat assistant-v2-chat" aria-label="Trợ lý lập hành trình" aria-busy={busy} lang="vi">
      <div className="assistant-chat-main assistant-chat-fullscreen">
        <div className="assistant-transcript" tabIndex={0} aria-label="Danh sách tin nhắn">
          <div className="assistant-transcript-inner">
            <TripsageMemoryPanel enabled={memoryEnabled} />
            {!messages.length && (
              <div className="assistant-empty">
                <Sparkles className="assistant-icon" aria-hidden="true" />
                <h2>Chào bạn, mình là trợ lý lên lịch Hà Giang!</h2>
                <p>Kể mình nghe bạn muốn đi thế nào: đi từ đâu, khi nào, mấy ngày, xe gì. Mình sẽ lên lịch từng ngày, chỗ nghỉ trưa, nghỉ đêm và tính luôn chi phí.</p>
                <div className="tripsage-quick-replies">
                  {OPENING_PROMPTS.map(prompt => <button key={prompt} type="button" onClick={() => send(prompt)} disabled={locked}>{prompt}</button>)}
                </div>
              </div>
            )}
            <div className="assistant-messages" aria-live="polite">
              {messages.map(message => {
                const text = message.parts.map(part => (part.type === "text" ? part.text : "")).join("");
                // Latest data-itinerary part wins (same id replaces); only schema-valid results render.
                const itinerary = message.role === "assistant" && message.id === lastItineraryMessageId ? latestItinerary : null;
                const suggestions = message.role === "assistant" ? message.parts.flatMap(part => (part.type === "data-places" ? parsePlacesPart(part.data) : [])) : [];
                const webSources = message.role === "assistant" ? [...message.parts].reverse().map(part => (part.type === "data-sources" ? parseSourcesPart(part.data) : null)).find(Boolean) ?? [] : [];
                const resultParts = resultTurns.get(message.id)?.filter(part => part.type !== "data-budget" || message.id === latestBudgetMessageId) ?? [];
                const originCard = state.originRequest?.messageId === message.id && !busy ? state.originRequest : null;
                const replies = state.quickReplies?.messageId === message.id && !busy ? state.quickReplies.replies : [];
                if (!text && !itinerary && !suggestions.length && !webSources.length && !resultParts.length && !originCard) return null;
                return message.role === "user" ? (
                  <article key={message.id} className="assistant-message assistant-user"><p>{text}</p></article>
                ) : (
                  <article key={message.id} className="assistant-message assistant-answer">
                    <span className="assistant-speaker"><Sparkles className="assistant-speaker-icon" aria-hidden="true" /><span>Trợ lý AI</span></span>
                    {text && <TripsageMarkdown text={text} />}
                    {itinerary && <TripsageItineraryView proposal={itinerary}>{!busy && (notice ? <p role="note" className="assistant-muted">Lịch trình chưa được lưu. Hãy gửi lại để hoàn tất lượt này.</p> : <TripsageSaveSection result={itinerary} onStateChange={setSaveState} />)}</TripsageItineraryView>}
                    <TripsagePlacesView places={suggestions} />
                    <TripsageSourcesView sources={webSources} />
                    <TripsageResultCards parts={resultParts} />
                    {originCard && <TripsageOriginCard suggestion={originCard} journey={journey} disabled={locked} onConfirm={confirmOrigin} />}
                    {replies.length > 0 && (
                      <div className="tripsage-quick-replies" role="group" aria-label="Gợi ý trả lời nhanh">
                        {replies.map(reply => <button key={reply} type="button" onClick={() => send(reply)} disabled={locked}>{reply}</button>)}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
            {busy && <p role="status" className="assistant-muted">{status?.label ?? "Mình đang xử lý yêu cầu…"}</p>}
          </div>
        </div>
        <div className="assistant-bottom-dock"><div className="assistant-bottom-dock-inner">
          <TripsageChatNotice notice={notice} onResend={saveLocked ? undefined : () => void regenerate()} />
          <TripsageTripSummary tripInfo={state.tripInfo} journey={journey} />
          <form noValidate className="assistant-composer" onSubmit={submit}>
            <label htmlFor="tripsage-chat-input" className="assistant-sr-only">Tin nhắn cho trợ lý</label>
            <div className="assistant-composer-input">
              <textarea id="tripsage-chat-input" className="resize-none" rows={1} maxLength={MAX_LENGTH} placeholder="Nhắn cho trợ lý: đi từ đâu, khi nào, mấy ngày…" value={draft} disabled={locked}
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
