"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Send, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import type { TripJourney } from "@/modules/trip-origin/trip-origin-contract";
import { buildTripsageChatBody, OPENING_MESSAGE, REPLAN_MESSAGE, summarizeItinerary, type TripsageRequirement } from "@/modules/tripsage-chat/tripsage-chat-context";

import type { SaveState } from "@/modules/trip-save/trip-save-state";
import { isTripSaveNavigationLocked } from "@/modules/trip-save/trip-save-state";

import { parseItineraryPart, TripsageItineraryView } from "./tripsage-itinerary-view";
import { parsePlacesPart, TripsagePlacesView } from "./tripsage-places-view";
import { parseSourcesPart, TripsageSourcesView } from "./tripsage-sources-view";
import { TripsageSaveSection } from "./tripsage-save-section";
import { TripsageChatNotice } from "./tripsage-chat-notice";
import { TripsageTripInfoDialog } from "./tripsage-trip-info-dialog";
import { TripsageTripSummary } from "./tripsage-trip-summary";
import { classifyChatError, createTripsageChatFetch } from "@/modules/tripsage-chat/tripsage-chat-errors";

type StatusPart = { kind: "start" | "checking" | "writing"; label: string };

const MAX_LENGTH = 1000;

/**
 * Vietnamese streaming planning chat. A one-page dialog collects the trip info; the structured `requirement` and `journey`
 * (origin via the existing KLTN picker) plus a compact summary of the latest itinerary travel in the request body.
 * The model never sees coordinates and never fills these fields itself.
 */
export function TripsageChatClient() {
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<StatusPart | null>(null);
  const [journey, setJourney] = useState<TripJourney | null>(null);
  const journeyRef = useRef<TripJourney | null>(null);
  journeyRef.current = journey;
  const [requirement, setRequirement] = useState<TripsageRequirement | null>(null);
  const requirementRef = useRef<TripsageRequirement | null>(null);
  requirementRef.current = requirement;
  const itineraryRef = useRef<ReturnType<typeof summarizeItinerary> | null>(null);
  // Opens by itself on first entry; closing it leaves the chat usable for general questions.
  const [dialogOpen, setDialogOpen] = useState(true);
  const transport = useMemo(() => new DefaultChatTransport({
    api: "/api/ai/chat",
    fetch: createTripsageChatFetch(),
    prepareSendMessagesRequest: ({ messages }) => ({ body: buildTripsageChatBody({ messages, journey: journeyRef.current, requirement: requirementRef.current, itinerary: itineraryRef.current }) }),
  }), []);
  const { messages, sendMessage, status: chatStatus, error, stop, regenerate } = useChat({
    transport,
    onData: part => { if (part.type === "data-status") setStatus(part.data as StatusPart); },
  });
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const saveLocked = isTripSaveNavigationLocked(saveState);
  const notice = chatStatus === "error" ? classifyChatError(error) : null;
  const busy = chatStatus === "submitted" || chatStatus === "streaming";
  const lastItineraryMessageId = [...messages].reverse().find(m => m.role === "assistant" && m.parts.some(p => p.type === "data-itinerary" && parseItineraryPart(p.data)))?.id;
  // Only the newest itinerary is shown and sent back: a re-proposal replaces the previous one.
  const latestItinerary = lastItineraryMessageId ? messages.find(m => m.id === lastItineraryMessageId)?.parts.map(part => (part.type === "data-itinerary" ? parseItineraryPart(part.data) : null)).filter(Boolean).at(-1) ?? null : null;
  itineraryRef.current = latestItinerary ? summarizeItinerary(latestItinerary) : null;
  useEffect(() => { if (!busy) setStatus(null); }, [busy]);
  const editLocked = busy || saveLocked;

  function confirmTripInfo(next: TripsageRequirement, nextJourney: TripJourney) {
    const isEdit = requirementRef.current !== null;
    // Refs first: the transport reads them when the message below is sent.
    requirementRef.current = next; journeyRef.current = nextJourney;
    setRequirement(next); setJourney(nextJourney); setDialogOpen(false);
    void sendMessage({ text: isEdit ? REPLAN_MESSAGE : OPENING_MESSAGE });
  }
  const openDialog = () => { if (!editLocked) setDialogOpen(true); };
  const summary = <TripsageTripSummary requirement={requirement} journey={journey} onEdit={openDialog} disabled={editLocked} />;

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
                <p>Điền phương tiện, số ngày, ngày bắt đầu, sở thích và điểm xuất phát trong một cửa sổ, mình sẽ lập hành trình rồi bạn có thể hỏi đáp và chỉnh sửa ngay trong khung chat.</p>
                {!requirement && summary}
              </div>
            )}
            <div className="assistant-messages" aria-live="polite">
              {messages.map(message => {
                const text = message.parts.map(part => (part.type === "text" ? part.text : "")).join("");
                // Latest data-itinerary part wins (same id replaces); only schema-valid results render.
                const itinerary = message.role === "assistant" && message.id === lastItineraryMessageId ? [...message.parts].reverse().map(part => (part.type === "data-itinerary" ? parseItineraryPart(part.data) : null)).find(Boolean) ?? null : null;
                const suggestions = message.role === "assistant" ? message.parts.flatMap(part => (part.type === "data-places" ? parsePlacesPart(part.data) : [])) : [];
                const webSources = message.role === "assistant" ? [...message.parts].reverse().map(part => (part.type === "data-sources" ? parseSourcesPart(part.data) : null)).find(Boolean) ?? [] : [];
                if (!text && !itinerary && !suggestions.length && !webSources.length) return null;
                return message.role === "user" ? (
                  <article key={message.id} className="assistant-message assistant-user"><p>{text}</p></article>
                ) : (
                  <article key={message.id} className="assistant-message assistant-answer">
                    <span className="assistant-speaker"><Sparkles className="assistant-speaker-icon" aria-hidden="true" /><span>Trợ lý AI</span></span>
                    {itinerary && <TripsageItineraryView proposal={itinerary}>{message.id === lastItineraryMessageId && !busy && (notice ? <p role="note" className="assistant-muted">Lịch trình chưa được lưu. Hãy gửi lại để hoàn tất lượt này.</p> : <TripsageSaveSection result={itinerary} onStateChange={setSaveState} />)}</TripsageItineraryView>}
                    <TripsagePlacesView places={suggestions} />
                    <TripsageSourcesView sources={webSources} />
                    {text && <p style={{ whiteSpace: "pre-wrap" }}>{text}</p>}
                  </article>
                );
              })}
            </div>
            {busy && <p role="status" className="assistant-muted">{status?.label ?? "Mình đang xử lý yêu cầu…"}</p>}
          </div>
        </div>
        <div className="assistant-bottom-dock"><div className="assistant-bottom-dock-inner">
          <TripsageChatNotice notice={notice} onResend={saveLocked ? undefined : () => void regenerate()} />
          {(requirement || messages.length > 0) && <div className="mb-2">{summary}</div>}
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
      <TripsageTripInfoDialog open={dialogOpen} requirement={requirement} journey={journey} onClose={() => setDialogOpen(false)} onConfirm={confirmTripInfo} />
    </section>
  );
}
