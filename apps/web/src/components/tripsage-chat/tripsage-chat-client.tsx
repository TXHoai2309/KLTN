"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { PanelLeft, PanelLeftOpen, Plus, Send, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";

import { createIdempotencyKey } from "@/lib/mutation-client";
import type { QaContext } from "@/modules/ai/qa-contract";
import { conversationMetaPartSchema } from "@/modules/tripsage-chat/assistant-conversation-contract";
import { buildTripsageChatBody, summarizeItinerary } from "@/modules/tripsage-chat/tripsage-chat-context";
import { classifyChatError, createTripsageChatFetch } from "@/modules/tripsage-chat/tripsage-chat-errors";
import type { SaveState } from "@/modules/trip-save/trip-save-state";
import { isTripSaveNavigationLocked } from "@/modules/trip-save/trip-save-state";

import type { ConfirmedTurn } from "@/components/assistant/assistant-controller";
import { deleteConversation, fetchConversationDetail, fetchConversations, renameConversation, type ConversationDetailResult } from "@/components/assistant/assistant-conversation-client";
import { AssistantSidebar } from "@/components/assistant/assistant-sidebar";
import { consumePlanningAuthDraft } from "@/components/assistant/planning-auth-handoff";

import {
  deleteAllAssistantConversations,
  deleteAssistantConversation,
  fetchAssistantConversationDetail,
  fetchAssistantConversations,
  mergeUnifiedConversations,
  storedMessagesToUiMessages,
  type UnifiedConversationItem,
} from "./assistant-unified-history";
import { TripsageAccessLegCard } from "./tripsage-access-leg-card";
import { TripsageChatNotice } from "./tripsage-chat-notice";
import { readConversationState } from "./tripsage-conversation-state";
import { TripsageCostCard } from "./tripsage-cost-card";
import { parseItineraryPart, TripsageItineraryView } from "./tripsage-itinerary-view";
import { TripsageMarkdown } from "./tripsage-markdown";
import { TripsageMemoryPanel } from "./tripsage-memory-panel";
import { parsePlacesPart, TripsagePlacesView } from "./tripsage-places-view";
import { readTripsageResultTurns, TripsageResultCards } from "./tripsage-result-cards";
import { TripsageSaveSection } from "./tripsage-save-section";
import { parseSourcesPart, TripsageSourcesView } from "./tripsage-sources-view";
import { TripsageTimelineView } from "./tripsage-timeline-view";
import { TripsageTripSummary } from "./tripsage-trip-summary";

type StatusPart = { kind: "start" | "checking" | "writing"; label: string };

const MAX_LENGTH = 1000;
const OPENING_PROMPTS = [
  "Hà Giang mùa nào đẹp và có gì nổi bật?",
  "Đi Hà Giang 4 ngày 3 đêm bằng xe máy",
  "Mình ở Sài Gòn, muốn đi Hà Giang",
];

export type TripsageChatClientProps = {
  memoryEnabled?: boolean;
  identity?: string;
  initialContext?: QaContext;
  destinationName?: string;
  conversationId?: string;
  renderLegacyAnswer?: (turn: ConfirmedTurn) => ReactNode;
};

/**
 * Single unified assistant chat at `/assistant` for signed-in travelers (ADR-43):
 * one composer and shared left sidebar (merging new saved conversations + legacy Q&A/V2 read-only),
 * chat-only origin confirmation, source chips, collapsed itinerary map, and persisted display cards.
 */
export function TripsageChatClient({
  memoryEnabled = false,
  identity,
  initialContext,
  destinationName,
  conversationId: initialConversationId,
  renderLegacyAnswer,
}: TripsageChatClientProps) {
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<StatusPart | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [legacyReadOnly, setLegacyReadOnly] = useState<ConversationDetailResult | null>(null);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [historyNotice, setHistoryNotice] = useState<string | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [conversations, setConversations] = useState<UnifiedConversationItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const listFetch = useRef<AbortController | null>(null);

  const bodyRef = useRef<Omit<Parameters<typeof buildTripsageChatBody>[0], "messages">>({
    journey: null,
    tripInfo: null,
    itinerary: null,
    originCandidatesToken: null,
    conversationId: null,
  });

  function syncUrl(id: string | null) {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("conversationId", id);
    else url.searchParams.delete("conversationId");
    if (url.href !== window.location.href) {
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }

  const transport = useMemo(() => new DefaultChatTransport({
    api: "/api/ai/chat",
    fetch: createTripsageChatFetch(),
    prepareSendMessagesRequest: ({ messages }) => ({ body: buildTripsageChatBody({ messages, ...bodyRef.current }) }),
  }), []);

  const { messages, setMessages, sendMessage, status: chatStatus, error, stop, regenerate } = useChat({
    transport,
    onData: part => {
      if (part.type === "data-status") {
        setStatus(part.data as StatusPart);
      } else if (part.type === "data-conversation") {
        const parsed = conversationMetaPartSchema.safeParse(part.data);
        if (parsed.success) {
          const { conversationId, title } = parsed.data;
          bodyRef.current = { ...bodyRef.current, conversationId };
          setActiveConversationId(conversationId);
          syncUrl(conversationId);
          const nowIso = new Date().toISOString();
          setConversations(current => {
            const exists = current.find(item => item.id === conversationId);
            const updated: UnifiedConversationItem = exists
              ? { ...exists, title, lastActivityAt: nowIso, source: "ASSISTANT" }
              : { id: conversationId, title, context: { type: "GENERAL" }, createdAt: nowIso, lastActivityAt: nowIso, source: "ASSISTANT" };
            return [updated, ...current.filter(item => item.id !== conversationId)];
          });
        }
      }
    },
  });

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const saveLocked = isTripSaveNavigationLocked(saveState);
  const notice = chatStatus === "error" ? classifyChatError(error) : null;
  const busy = chatStatus === "submitted" || chatStatus === "streaming";
  const locked = busy || saveLocked || loadingConversation;

  const { turns: resultTurns, latestBudgetMessageId } = useMemo(() => readTripsageResultTurns(messages), [messages]);
  const state = useMemo(() => readConversationState(messages, data => parseItineraryPart(data) !== null), [messages]);
  const lastItineraryMessageId = state.lastItineraryMessageId;
  const latestItinerary = lastItineraryMessageId
    ? messages.find(m => m.id === lastItineraryMessageId)?.parts.map(part => (part.type === "data-itinerary" ? parseItineraryPart(part.data) : null)).filter(Boolean).at(-1) ?? null
    : null;
  const itineraryCurrent = latestItinerary && !state.itineraryStale;

  bodyRef.current = {
    journey: state.journey,
    tripInfo: state.tripInfo,
    itinerary: itineraryCurrent ? summarizeItinerary(latestItinerary) : null,
    accessLeg: state.accessLeg?.data ?? null,
    originCandidatesToken: state.originCandidatesToken,
    conversationId: activeConversationId,
  };

  useEffect(() => { if (!busy) setStatus(null); }, [busy]);

  // Restore any draft retained when a guest clicked sign-in from the planning invitation (ADR-35 / ADR-43).
  useEffect(() => {
    if (!identity) return;
    const retained = consumePlanningAuthDraft(identity);
    if (retained?.text) setDraft(retained.text);
  }, [identity]);

  // Desktop opens sidebar by default; mobile starts collapsed.
  useEffect(() => {
    const sync = () => setSidebarOpen(window.innerWidth >= 1024);
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  async function loadHistory(search = "") {
    listFetch.current?.abort();
    const controller = new AbortController();
    listFetch.current = controller;
    setHistoryError("");
    setHistoryLoading(true);
    try {
      const [assistantRes, legacyRes] = await Promise.allSettled([
        fetchAssistantConversations({ search, limit: 30, signal: controller.signal }),
        fetchConversations({ search, limit: 30, signal: controller.signal }),
      ]);
      if (controller.signal.aborted) return;
      const assistantItems = assistantRes.status === "fulfilled" ? assistantRes.value.items : [];
      const legacyItems = legacyRes.status === "fulfilled" ? legacyRes.value.items : [];
      if (assistantRes.status === "rejected" && legacyRes.status === "rejected") {
        setHistoryError("Không thể tải lịch sử hội thoại. Vui lòng thử lại.");
        return;
      }
      setConversations(mergeUnifiedConversations(assistantItems, legacyItems));
    } finally {
      if (listFetch.current === controller) setHistoryLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => { void loadHistory(searchQuery); }, searchQuery ? 250 : 0);
    return () => { clearTimeout(timer); listFetch.current?.abort(); };
  }, [searchQuery, identity]);

  async function openConversationById(id: string, preferredSource?: "ASSISTANT" | "LEGACY") {
    if (busy || saveLocked) return;
    setLoadingConversation(true);
    setHistoryNotice(null);
    try {
      if (preferredSource !== "LEGACY") {
        const detail = await fetchAssistantConversationDetail(id).catch(() => null);
        if (detail) {
          setLegacyReadOnly(null);
          setActiveConversationId(detail.conversation.id);
          bodyRef.current = { ...bodyRef.current, conversationId: detail.conversation.id };
          setMessages(storedMessagesToUiMessages(detail.messages));
          syncUrl(detail.conversation.id);
          return;
        }
      }
      const legacy = await fetchConversationDetail(id).catch(() => null);
      if (legacy) {
        setActiveConversationId(legacy.conversation.id);
        bodyRef.current = { ...bodyRef.current, conversationId: null };
        setMessages([]);
        setLegacyReadOnly(legacy);
        syncUrl(legacy.conversation.id);
        return;
      }
      setHistoryNotice("Cuộc hội thoại không tồn tại hoặc đã hết hạn.");
      syncUrl(null);
    } finally {
      setLoadingConversation(false);
    }
  }

  useEffect(() => {
    if (!initialConversationId) return;
    void openConversationById(initialConversationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialConversationId]);

  function startNewChat() {
    if (busy || saveLocked) return;
    setLegacyReadOnly(null);
    setActiveConversationId(null);
    setHistoryNotice(null);
    bodyRef.current = { journey: null, tripInfo: null, itinerary: null, originCandidatesToken: null, conversationId: null };
    setMessages([]);
    syncUrl(null);
  }

  async function handleSelectConversation(id: string) {
    const item = conversations.find(c => c.id === id);
    await openConversationById(id, item?.source);
  }

  async function handleRenameConversation(id: string, title: string) {
    const item = conversations.find(c => c.id === id);
    if (item?.source !== "LEGACY") return false;
    try {
      await renameConversation(id, title);
      setConversations(current => current.map(c => (c.id === id ? { ...c, title } : c)));
      return true;
    } catch {
      return false;
    }
  }

  async function handleDeleteConversation(id: string) {
    const item = conversations.find(c => c.id === id);
    try {
      const ok = item?.source === "LEGACY"
        ? await deleteConversation(id).then(() => true).catch(() => false)
        : await deleteAssistantConversation(id, createIdempotencyKey());
      if (!ok) {
        setHistoryNotice("Chưa xác nhận xóa hội thoại. Vui lòng thử lại.");
        return false;
      }
      setConversations(current => current.filter(c => c.id !== id));
      if (id === activeConversationId) startNewChat();
      return true;
    } catch {
      setHistoryNotice("Chưa xác nhận xóa hội thoại. Vui lòng thử lại.");
      return false;
    }
  }

  async function handleDeleteAll() {
    setHistoryNotice(null);
    try {
      const okAssistant = await deleteAllAssistantConversations(createIdempotencyKey());
      const legacyItems = conversations.filter(c => c.source === "LEGACY");
      const legacyResults = await Promise.all(
        legacyItems.map(item => deleteConversation(item.id).then(() => true).catch(() => false)),
      );
      if (!okAssistant || legacyResults.some(res => !res)) {
        setHistoryNotice("Một số hội thoại chưa thể xóa. Vui lòng thử lại.");
        void loadHistory(searchQuery);
        return false;
      }
      setConversations([]);
      startNewChat();
      return true;
    } catch {
      setHistoryNotice("Chưa xác nhận xóa toàn bộ lịch sử. Vui lòng thử lại.");
      return false;
    }
  }

  function send(text: string) {
    if (!text.trim() || locked || legacyReadOnly) return;
    void sendMessage({ text });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || locked || legacyReadOnly) return;
    setDraft("");
    send(text);
  }

  const openingPrompts = destinationName && initialContext?.type === "DESTINATION"
    ? [`${destinationName} có gì đáng xem và kinh nghiệm đi thế nào?`, `Lên lịch Hà Giang 4 ngày có ghé ${destinationName}`, ...OPENING_PROMPTS.slice(1)]
    : OPENING_PROMPTS;

  return (
    <section className="assistant-chat assistant-v2-chat" data-runtime="tripsage-unified" aria-label="Trợ lý AI Hà Giang" aria-busy={busy || loadingConversation} lang="vi">
      <AssistantSidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        loading={historyLoading}
        loadingMore={false}
        error={historyError}
        onRetry={() => void loadHistory(searchQuery)}
        hasMore={false}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNewChat={startNewChat}
        onSelectConversation={id => void handleSelectConversation(id)}
        onRenameConversation={handleRenameConversation}
        onDeleteConversation={handleDeleteConversation}
        onDeleteAll={handleDeleteAll}
        canRename={id => conversations.find(c => c.id === id)?.source === "LEGACY"}
        onLoadMore={() => undefined}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      <div className="assistant-chat-main">
        <div className="assistant-topbar">
          <div className="assistant-topbar-left">
            <button
              type="button"
              className="assistant-topbar-btn"
              onClick={() => setSidebarOpen(open => !open)}
              aria-label={sidebarOpen ? "Ẩn thanh lịch sử" : "Mở thanh lịch sử"}
              aria-expanded={sidebarOpen}
            >
              {sidebarOpen ? <PanelLeft aria-hidden="true" /> : <PanelLeftOpen aria-hidden="true" />}
            </button>
            <span className="assistant-topbar-title">Trợ lý AI Hà Giang</span>
          </div>
          <button
            type="button"
            className="assistant-topbar-btn"
            onClick={startNewChat}
            disabled={busy || saveLocked}
            aria-label="Đoạn chat mới"
          >
            <Plus aria-hidden="true" />
            <span>Mới</span>
          </button>
        </div>

        <div className="assistant-transcript" tabIndex={0} aria-label="Danh sách tin nhắn">
          <div className="assistant-transcript-inner">
            <TripsageMemoryPanel enabled={memoryEnabled} />
            {historyNotice && <p role="status" className="assistant-muted">{historyNotice}</p>}

            {loadingConversation ? (
              <p role="status" className="assistant-muted">Đang mở cuộc hội thoại…</p>
            ) : legacyReadOnly ? (
              <div className="assistant-messages" data-legacy-readonly="true">
                <div className="tripsage-legacy-banner" role="note">
                  <span>Hội thoại cũ (chỉ đọc).</span>
                  <button type="button" onClick={startNewChat}>Bắt đầu đoạn chat mới</button>
                </div>
                {legacyReadOnly.turns.map(turn => (
                  <div key={turn.response.turnId} className="assistant-turn-pair">
                    <article className="assistant-message assistant-user"><p>{turn.question}</p></article>
                    <article className="assistant-message assistant-answer">
                      <span className="assistant-speaker"><Sparkles className="assistant-speaker-icon" aria-hidden="true" /><span>Trợ lý AI</span></span>
                      {renderLegacyAnswer ? renderLegacyAnswer(turn) : (
                        <TripsageMarkdown text={turn.response.answerParts.map(part => part.text).join("\n\n") || ("clarificationQuestion" in turn.response && typeof turn.response.clarificationQuestion === "string" ? turn.response.clarificationQuestion : "") || ("unanswered" in turn.response && Array.isArray(turn.response.unanswered) ? turn.response.unanswered.join(" ") : "")} />
                      )}
                    </article>
                  </div>
                ))}
              </div>
            ) : (
              <>
                {!messages.length && (
                  <div className="assistant-empty">
                    <Sparkles className="assistant-icon" aria-hidden="true" />
                    <h2>Chào bạn, mình là trợ lý du lịch Hà Giang!</h2>
                    <p>Hỏi mình về văn hóa, điểm đến, ẩm thực, hoặc nhờ lên lịch trình Hà Giang kèm timeline, chỗ nghỉ và chi phí — tất cả ngay trong khung chat này.</p>
                    <div className="tripsage-quick-replies">
                      {openingPrompts.map(prompt => <button key={prompt} type="button" onClick={() => send(prompt)} disabled={locked}>{prompt}</button>)}
                    </div>
                  </div>
                )}
                <div className="assistant-messages" aria-live="polite">
                  {messages.map(message => {
                    const text = message.parts.map(part => (part.type === "text" ? part.text : "")).join("");
                    const itinerary = message.role === "assistant" && message.id === lastItineraryMessageId ? latestItinerary : null;
                    const suggestions = message.role === "assistant" ? message.parts.flatMap(part => (part.type === "data-places" ? parsePlacesPart(part.data) : [])) : [];
                    const sources = message.role === "assistant" ? [...message.parts].reverse().map(part => (part.type === "data-sources" ? parseSourcesPart(part.data) : null)).find(Boolean) ?? [] : [];
                    const resultParts = resultTurns.get(message.id)?.filter(part => part.type !== "data-budget" || message.id === latestBudgetMessageId) ?? [];
                    const candidateButtons = state.originCandidates?.messageId === message.id && !busy ? state.originCandidates.candidates.map(c => c.label) : [];
                    const quickReplies = state.quickReplies?.messageId === message.id && !busy ? state.quickReplies.replies : [];
                    const replies = candidateButtons.length > 0 ? candidateButtons : quickReplies;
                    const cost = state.cost?.messageId === message.id ? state.cost.data : null;
                    const accessLeg = state.accessLeg?.messageId === message.id ? state.accessLeg.data : null;
                    if (!text && !itinerary && !suggestions.length && !sources.length && !resultParts.length && !replies.length && !cost && !accessLeg) return null;
                    return message.role === "user" ? (
                      <article key={message.id} className="assistant-message assistant-user"><p>{text}</p></article>
                    ) : (
                      <article key={message.id} className="assistant-message assistant-answer">
                        <span className="assistant-speaker"><Sparkles className="assistant-speaker-icon" aria-hidden="true" /><span>Trợ lý AI</span></span>
                        {text && <TripsageMarkdown text={text} />}
                        {itinerary && state.timeline && <TripsageTimelineView timeline={state.timeline} suggestions={state.suggestions} />}
                        {itinerary && <TripsageItineraryView proposal={itinerary}>{!busy && (notice ? <p role="note" className="assistant-muted">Lịch trình chưa được lưu. Hãy gửi lại để hoàn tất lượt này.</p> : <TripsageSaveSection result={itinerary} onStateChange={setSaveState} />)}</TripsageItineraryView>}
                        {accessLeg && <TripsageAccessLegCard leg={accessLeg} />}
                        {cost && <TripsageCostCard cost={cost} />}
                        <TripsagePlacesView places={suggestions} />
                        <TripsageSourcesView sources={sources} />
                        <TripsageResultCards parts={resultParts} />
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
              </>
            )}
          </div>
        </div>

        {!legacyReadOnly && (
          <div className="assistant-bottom-dock"><div className="assistant-bottom-dock-inner">
            <TripsageChatNotice notice={notice} onResend={saveLocked ? undefined : () => void regenerate()} />
            <TripsageTripSummary tripInfo={state.tripInfo} journey={state.journey} />
            <form noValidate className="assistant-composer" onSubmit={submit}>
              <label htmlFor="tripsage-chat-input" className="assistant-sr-only">Tin nhắn cho trợ lý</label>
              <div className="assistant-composer-input">
                <textarea
                  id="tripsage-chat-input"
                  className="resize-none"
                  rows={1}
                  maxLength={MAX_LENGTH}
                  placeholder="Hỏi về Hà Giang hoặc nhờ lên lịch trình…"
                  value={draft}
                  disabled={locked}
                  onChange={event => setDraft(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                />
                <div className="assistant-composer-bar">
                  {busy
                    ? <button type="button" onClick={() => void stop()}><span>Dừng</span></button>
                    : <button type="submit" disabled={!draft.trim() || saveLocked || loadingConversation}><Send aria-hidden="true" /><span>Gửi</span></button>}
                </div>
              </div>
              <div className="assistant-composer-footer">
                <span>Enter để gửi · Shift+Enter xuống dòng</span>
                <span className="assistant-char-counter">{draft.length}/{MAX_LENGTH} ký tự</span>
              </div>
            </form>
          </div></div>
        )}
      </div>
    </section>
  );
}
