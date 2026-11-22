"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Button } from "@KLTN/ui/components/button";
import { FileText, PanelLeft, PanelLeftOpen, Plus, Send, ShieldCheck, Sparkles, Square } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";

import { createIdempotencyKey } from "@/lib/mutation-client";
import type { QaContext } from "@/modules/ai/qa-contract";
import { conversationMetaPartSchema } from "@/modules/tripsage-chat/assistant-conversation-contract";
import { buildTripsageChatBody, summarizeItinerary } from "@/modules/tripsage-chat/tripsage-chat-context";
import { classifyChatError, createTripsageChatFetch } from "@/modules/tripsage-chat/tripsage-chat-errors";
import {
  chosenLodgingMapToList,
  pruneChosenLodgings,
  toggleChosenLodging,
  type ChosenLodgingMap,
} from "@/modules/tripsage-chat/tripsage-timeline";
import type { SaveState } from "@/modules/trip-save/trip-save-state";
import { isTripSaveNavigationLocked } from "@/modules/trip-save/trip-save-state";
import { pinKey } from "@/modules/trip-save/trip-pin-builders";
import type { PinnedItem } from "@/modules/trip-save/trip-pin-contract";
import { pinToTrip } from "@/modules/trip-read/trip-management-client";
import type { PinControl } from "./tripsage-pin-button";

import type { ConfirmedTurn } from "@/components/assistant/assistant-controller";
import { deleteConversation, fetchConversationDetail, fetchConversations, renameConversation, type ConversationDetailResult } from "@/components/assistant/assistant-conversation-client";
import { AssistantLandscape } from "@/components/assistant/assistant-landscape";
import { AssistantSidebar } from "@/components/assistant/assistant-sidebar";
import { consumePlanningAuthDraft } from "@/components/assistant/planning-auth-handoff";

import {
  deleteAllAssistantConversations,
  deleteAssistantConversation,
  fetchAssistantConversationDetail,
  fetchAssistantConversations,
  mergeUnifiedConversations,
  saveAssistantConversationChosenLodgings,
  storedMessagesToUiMessages,
  type UnifiedConversationItem,
} from "./assistant-unified-history";
import { TripsageAccessLegCard } from "./tripsage-access-leg-card";
import { TripsageChatNotice } from "./tripsage-chat-notice";
import { TripsageStreamedText } from "./tripsage-streamed-text";
import { readConversationState } from "./tripsage-conversation-state";
import { TripsageCostCard } from "./tripsage-cost-card";
import { parseItineraryPart, TripsageItineraryView } from "./tripsage-itinerary-view";
import { TripsageMarkdown } from "./tripsage-markdown";
import { TripsageMemoryPanel } from "./tripsage-memory-panel";
import { readTripsageResultTurns, TripsageResultCards } from "./tripsage-result-cards";
import { TripsageSaveSection } from "./tripsage-save-section";
import { parseSourcesPart, TripsageSourcesView } from "./tripsage-sources-view";
import { TripsageTimelineView } from "./tripsage-timeline-view";

/**
 * Lifts the answer's closing question out of the prose so it sits right above its quick-reply buttons.
 * shortcut: relies on the model ending with the question on its own line; upgrade to a `question` field on suggestReplies if that drifts.
 */
export function splitTrailingQuestion(text: string): { body: string; question: string | null } {
  const trimmed = text.trimEnd();
  const cut = trimmed.lastIndexOf("\n");
  const last = trimmed.slice(cut + 1).replace(/^[#>*_\s]+|[*_\s]+$/gu, "").replace(/\*\*|__/gu, "");
  if (!/[?？]$/u.test(last) || last.length > 200) return { body: text, question: null };
  return { body: cut < 0 ? "" : trimmed.slice(0, cut), question: last };
}

type StatusPart = { kind: "start" | "checking" | "writing"; label: string };

const MAX_LENGTH = 1000;
const SUGGESTION_CARDS = [
  { icon: "🗺️", title: "Lập hành trình Hà Giang", prompt: (subject: string) => subject === "Hà Giang" ? "Đi Hà Giang 4 ngày 3 đêm bằng xe máy" : `Lên lịch Hà Giang 4 ngày có ghé ${subject}.` },
  { icon: "✈️", title: "Đi Hà Giang từ xa", prompt: () => "Mình ở Sài Gòn, muốn đi Hà Giang 4 ngày." },
  { icon: "🏔️", title: "Giới thiệu điểm đến", prompt: (subject: string) => `Giới thiệu ngắn gọn về ${subject}.` },
  { icon: "🌿", title: "Văn hóa & ẩm thực", prompt: (subject: string) => `${subject} có những nét văn hóa và ẩm thực nào nổi bật?` },
] as const;

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

  const { messages, setMessages, sendMessage, status: chatStatus, error, stop, regenerate, clearError } = useChat({
    transport,
    // The notice text is generic; keep the real cause (name and short message only, never the request) visible for debugging.
    onError: err => console.warn("[tripsage-chat] stream error", err.name, err.message.slice(0, 200)),
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
  // True while the saved answer is being fetched back after the stream dropped: the user sees progress, not a red error.
  const [recoveryFailed, setRecoveryFailed] = useState(false);
  // ADR-47: items pinned from cards. Before the trip is saved they ride along with the save; after, each pin is written at once.
  const [pinned, setPinned] = useState<PinnedItem[]>([]);
  const [savedTripId, setSavedTripId] = useState<string | null>(null);
  const [pinMessage, setPinMessage] = useState<string | null>(null);
  const pinKeys = useMemo(() => new Set(pinned.map(pinKey)), [pinned]);
  // The way to the meeting hub travels with the saved trip (owner-only), so the trip page shows the whole journey.
  const pinControl: PinControl = {
    saved: savedTripId !== null,
    isPinned: item => pinKeys.has(pinKey(item)),
    toggle: item => {
      const key = pinKey(item);
      if (!savedTripId) {
        setPinMessage(null);
        setPinned(current => current.some(existing => pinKey(existing) === key) ? current.filter(existing => pinKey(existing) !== key) : [...current, item]);
        return;
      }
      if (pinKeys.has(key)) return;
      setPinMessage("Đang ghim vào chuyến đi…");
      void pinToTrip(savedTripId, [item], createIdempotencyKey()).then(outcome => {
        if (outcome.status === "SUCCESS") { setPinned(current => [...current, item]); setPinMessage("Đã ghim vào chuyến đi."); }
        else setPinMessage(outcome.status === "UNKNOWN" ? "Chưa xác nhận được việc ghim. Hãy thử lại." : outcome.error.message);
      });
    },
  };
  const [chosenLodgings, setChosenLodgings] = useState<ChosenLodgingMap>({});
  const lastSyncedProposalRef = useRef<string | null>(null);
  const saveLocked = isTripSaveNavigationLocked(saveState);
  const rawNotice = chatStatus === "error" ? classifyChatError(error) : null;
  const interrupted = rawNotice?.kind === "INTERRUPTED";
  const recovering = interrupted && !!activeConversationId && !recoveryFailed;
  const notice = recovering ? null : rawNotice;
  const busy = chatStatus === "submitted" || chatStatus === "streaming";
  const locked = busy || saveLocked || loadingConversation || recovering;

  const { turns: resultTurns, latestBudgetMessageId } = useMemo(() => readTripsageResultTurns(messages), [messages]);
  const state = useMemo(() => readConversationState(messages, data => parseItineraryPart(data) !== null), [messages]);
  const lastItineraryMessageId = state.lastItineraryMessageId;
  // Schema parsing creates a fresh object; keep it stable between message updates
  // so the lodging synchronization effect cannot trigger itself on every render.
  const itineraryRef = useRef<ReturnType<typeof parseItineraryPart>>(null);
  const latestItinerary = useMemo(() => {
    const next = lastItineraryMessageId
      ? messages.find(m => m.id === lastItineraryMessageId)?.parts.map(part => (part.type === "data-itinerary" ? parseItineraryPart(part.data) : null)).filter(Boolean).at(-1) ?? null
      : null;
    // Same proposal, same object: a new one on every streamed chunk remounts the map and refetches /api/maps/config each time.
    if (next && itineraryRef.current?.proposalId === next.proposalId) return itineraryRef.current;
    itineraryRef.current = next;
    return next;
  }, [lastItineraryMessageId, messages]);
  const itineraryCurrent = latestItinerary && !state.itineraryStale;
  // A replan that leaves the days unchanged (e.g. only the origin was confirmed) folds the cards instead of re-showing them open.
  const planUnchanged = useMemo(() => {
    const plans = messages.flatMap(message => {
      const plan = message.role === "assistant" ? message.parts.map(part => (part.type === "data-itinerary" ? parseItineraryPart(part.data) : null)).filter(Boolean).at(-1) : null;
      return plan ? [JSON.stringify(plan.days)] : [];
    });
    return plans.length > 1 && plans.at(-1) === plans.at(-2);
  }, [messages]);

  // Keep chosen lodgings synced with restored saved conversations and prune nights removed on replan (Ticket 10).
  useEffect(() => {
    const proposalKey = latestItinerary ? `${activeConversationId ?? "draft"}:${latestItinerary.proposalId}` : null;
    if (!latestItinerary || !proposalKey) {
      if (lastSyncedProposalRef.current !== null) {
        lastSyncedProposalRef.current = null;
        setChosenLodgings({});
      }
      return;
    }
    if (lastSyncedProposalRef.current !== proposalKey) {
      lastSyncedProposalRef.current = proposalKey;
      setChosenLodgings(prev => {
        const base = Object.keys(state.chosenLodgings).length > 0 ? state.chosenLodgings : prev;
        return pruneChosenLodgings(base, latestItinerary.days.length, state.suggestions);
      });
    } else {
      setChosenLodgings(prev => pruneChosenLodgings(prev, latestItinerary.days.length, state.suggestions));
    }
  }, [activeConversationId, latestItinerary, state.chosenLodgings, state.suggestions]);

  function handleToggleChosenLodging(nightIndex: number, placeId: string) {
    setChosenLodgings(current => {
      const next = toggleChosenLodging(current, state.suggestions, nightIndex, placeId);
      if (next === current) return current;
      if (activeConversationId) {
        void saveAssistantConversationChosenLodgings(
          activeConversationId,
          chosenLodgingMapToList(next),
          createIdempotencyKey(),
        ).catch(() => {});
      }
      return next;
    });
  }

  bodyRef.current = {
    journey: state.journey,
    tripInfo: state.tripInfo,
    itinerary: itineraryCurrent ? summarizeItinerary(latestItinerary) : null,
    accessLeg: state.accessLeg?.data ?? null,
    originCandidatesToken: state.originCandidatesToken,
    conversationId: activeConversationId,
  };

  useEffect(() => { if (!busy) setStatus(null); }, [busy]);
  // Grow the composer with its text (CSS caps it at six lines, then it scrolls).
  useEffect(() => { const el = composer.current; if (!el) return; el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 132)}px`; }, [draft]);
  // Pins and the saved trip belong to one conversation.
  useEffect(() => { setPinned([]); setSavedTripId(null); setPinMessage(null); }, [activeConversationId]);

  // A cut connection does not stop the server: it finishes the turn and saves it. Poll the saved conversation and
  // swap it in (same data as a reload) instead of leaving the user on "connection lost".
  useEffect(() => {
    if (!interrupted || !activeConversationId) return;
    setRecoveryFailed(false);
    const conversationId = activeConversationId;
    const sentUserTurns = messages.filter(message => message.role === "user").length;
    let cancelled = false;
    let attempts = 0;
    const poll = async () => {
      while (!cancelled && attempts < 20) {
        attempts += 1;
        await new Promise(resolve => setTimeout(resolve, 3000));
        if (cancelled) return;
        const detail = await fetchAssistantConversationDetail(conversationId).catch(() => null);
        const stored = detail?.messages ?? [];
        if (stored.at(-1)?.role === "assistant" && stored.filter(message => message.role === "user").length === sentUserTurns) {
          setMessages(storedMessagesToUiMessages(stored));
          clearError();
          return;
        }
      }
      if (!cancelled) setRecoveryFailed(true);
    };
    void poll();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interrupted, activeConversationId]);

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
    setChosenLodgings({});
    setPinned([]); setSavedTripId(null); setPinMessage(null);
    lastSyncedProposalRef.current = null;
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

  const composer = useRef<HTMLTextAreaElement>(null);
  const subject = initialContext?.type === "DESTINATION" && destinationName?.trim() ? destinationName.trim() : "Hà Giang";

  return (
    <section className="assistant-chat assistant-v2-chat" data-runtime="tripsage-unified" aria-label="Trợ lý AI" aria-busy={busy || loadingConversation} lang="vi">
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

      <div className="assistant-chat-main assistant-chat-fullscreen">
        <div className={`assistant-floating-header ${sidebarOpen ? "sidebar-open" : "sidebar-collapsed"}`}>
          <div className="assistant-header-left">
            <button
              type="button"
              className="assistant-sidebar-toggle-btn"
              onClick={() => setSidebarOpen(open => !open)}
              aria-label={sidebarOpen ? "Thu nhỏ thanh bên lịch sử" : "Mở thanh bên lịch sử (phóng to)"}
              title={sidebarOpen ? "Thu nhỏ thanh bên" : "Mở thanh bên (phóng to)"}
            >
              {sidebarOpen ? <PanelLeft aria-hidden="true" /> : <PanelLeftOpen aria-hidden="true" />}
            </button>
            {!sidebarOpen && (
              <button
                type="button"
                className="assistant-floating-new-btn"
                onClick={startNewChat}
                disabled={busy || saveLocked}
                aria-label="Tạo cuộc trò chuyện mới"
                title="Đoạn chat mới"
              >
                <Plus aria-hidden="true" />
              </button>
            )}
          </div>
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
                  <div key={turn.response.turnId} className="assistant-turn assistant-planning-exchange">
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
                    <div className="assistant-empty-art">
                      <AssistantLandscape />
                      <Sparkles className="assistant-icon" aria-hidden="true" />
                    </div>
                    <h2>{initialContext?.type === "DESTINATION" && destinationName?.trim() ? `Hỏi về ${destinationName.trim()}` : "Bạn muốn khám phá điều gì?"}</h2>
                    <p>{initialContext?.type === "DESTINATION" && destinationName?.trim()
                      ? `Hỏi về lịch sử, cảnh quan, đường đi hoặc nhờ mình lên hành trình ghé ${destinationName.trim()}.`
                      : "Hỏi về văn hóa, lịch sử và điểm đến tại Hà Giang, hoặc nhờ mình lên hành trình."}</p>
                    <div className="assistant-suggestions" aria-label="Gợi ý câu hỏi">
                      {SUGGESTION_CARDS.map((item, index) => (
                        <button
                          key={index}
                          type="button"
                          className="assistant-suggestion-chip"
                          disabled={locked}
                          onClick={() => {
                            setDraft(item.prompt(subject));
                            composer.current?.focus();
                          }}
                        >
                          <span className="assistant-suggestion-icon" aria-hidden="true">{item.icon}</span>
                          <div className="assistant-suggestion-info">
                            <span className="assistant-suggestion-title">{item.title}</span>
                            <span className="assistant-suggestion-prompt">{item.prompt(subject)}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="assistant-messages" aria-live="polite">
                  {messages.map(message => {
                    const text = message.parts.map(part => (part.type === "text" ? part.text : "")).join("");
                    const itinerary = message.role === "assistant" && message.id === lastItineraryMessageId ? latestItinerary : null;
                    const sources = message.role === "assistant" ? [...message.parts].reverse().map(part => (part.type === "data-sources" ? parseSourcesPart(part.data) : null)).find(Boolean) ?? [] : [];
                    const resultParts = resultTurns.get(message.id)?.filter(part => part.type !== "data-budget" || message.id === latestBudgetMessageId) ?? [];
                    const candidateButtons = state.originCandidates?.messageId === message.id && !busy ? state.originCandidates.candidates.map(c => c.label) : [];
                    const quickReplies = state.quickReplies?.messageId === message.id && !busy ? state.quickReplies.replies : [];
                    const replies = candidateButtons.length > 0 ? candidateButtons : quickReplies;
                    const cost = state.cost?.messageId === message.id ? state.cost.data : null;
                    const accessLeg = state.accessLeg?.messageId === message.id ? state.accessLeg.data : null;
                    const hasCards = Boolean(cost || accessLeg || itinerary || resultParts.length);
                    const live = busy && message.id === messages.at(-1)?.id;
                    // The closing question sits under the cards and buttons it refers to, never above them.
                    const { body, question } = message.role === "assistant" && (replies.length > 0 || hasCards) ? splitTrailingQuestion(text) : { body: text, question: null };
                    if (!text && !itinerary && !sources.length && !resultParts.length && !replies.length && !cost && !accessLeg) return null;
                    return message.role === "user" ? (
                      <article key={message.id} className="assistant-message assistant-user"><p>{text}</p></article>
                    ) : (
                      <article key={message.id} className="assistant-message assistant-answer">
                        <span className="assistant-speaker"><Sparkles className="assistant-speaker-icon" aria-hidden="true" /><span>Trợ lý AI</span></span>
                        {body && <TripsageStreamedText text={body} live={live} />}
                        {/* Cards wait until the reply has been written, so the answer reads first and the cards appear under it. */}
                        {(cost || accessLeg || itinerary) && !live && (
                          <details className="tripsage-plan-details" open={!(itinerary && planUnchanged)}>
                            <summary>Lịch trình và chi phí ước tính</summary>
                            {cost && <TripsageCostCard cost={cost} pins={pinControl} />}
                            {accessLeg && !itinerary && <TripsageAccessLegCard leg={accessLeg} />}
                            {itinerary && state.timeline && (
                              <TripsageTimelineView
                                timeline={state.timeline}
                                suggestions={state.suggestions}
                                chosenLodgings={chosenLodgings}
                                onToggleChosenLodging={handleToggleChosenLodging}
                                onRequestMeals={day => send(`Tìm giúp mình quán ăn trưa cho ngày ${day}.`)}
                                pins={pinControl}
                                accessLeg={state.accessLeg?.data ?? null}
                              />
                            )}
                            {itinerary && <TripsageItineraryView proposal={itinerary}>{!busy && (notice ? <p role="note" className="assistant-muted">Lịch trình chưa được lưu. Hãy gửi lại để hoàn tất lượt này.</p> : <TripsageSaveSection result={itinerary} tripInfo={state.tripInfo} chosenLodgings={chosenLodgings} suggestions={state.suggestions} pinnedItems={state.accessLeg ? [{ kind: "ACCESS" as const, leg: state.accessLeg.data }, ...pinned] : pinned} onSaved={setSavedTripId} onStateChange={setSaveState} />)}</TripsageItineraryView>}
                          </details>
                        )}
                        <TripsageSourcesView sources={sources} />
                        {!live && <TripsageResultCards parts={resultParts} pins={pinControl} />}
                        {replies.length === 0 && question && <p className="tripsage-next-question">{question}</p>}
                        {replies.length > 0 && (
                          <div className="tripsage-next-step">
                            {question && <p className="tripsage-next-question">{question}</p>}
                            <div className="tripsage-quick-replies" role="group" aria-label={question ?? "Gợi ý trả lời nhanh"}>
                              {replies.map(reply => <button key={reply} type="button" onClick={() => send(reply)} disabled={locked}>{reply}</button>)}
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
                {busy && (
                  <div role="status" className="tripsage-thinking">
                    <span className="tripsage-thinking-dots" aria-hidden="true"><i /><i /><i /></span>
                    <span>{status?.label ?? "Mình đang xử lý yêu cầu…"}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {!legacyReadOnly && (
          <div className="assistant-bottom-dock"><div className="assistant-bottom-dock-inner">
            {pinMessage && <p role="status" className="assistant-muted">{pinMessage}</p>}
            {recovering && <div role="status" className="tripsage-thinking">Đang hoàn tất câu trả lời<span className="tripsage-thinking-dots" aria-hidden="true"><i /><i /><i /></span></div>}
            <TripsageChatNotice notice={notice} onResend={saveLocked ? undefined : () => void regenerate()} />
            <form noValidate className="assistant-composer" onSubmit={submit}>
              <label htmlFor="tripsage-chat-input" className="assistant-sr-only">Tin nhắn cho trợ lý</label>
              <div
                className="assistant-composer-input"
                onPointerDown={event => {
                  if (event.target === event.currentTarget) {
                    event.preventDefault();
                    composer.current?.focus();
                  }
                }}
              >
                <textarea
                  ref={composer}
                  id="tripsage-chat-input"
                  className="resize-none"
                  rows={1}
                  maxLength={MAX_LENGTH}
                  placeholder="Nhập câu hỏi hoặc nhu cầu chuyến đi Hà Giang…"
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
                  <div className="assistant-composer-left-tools" />
                  {busy
                    ? <Button type="button" variant="destructive" className="assistant-stop-button" onClick={() => void stop()}><Square aria-hidden="true" /><span>Dừng</span></Button>
                    : <button type="submit" disabled={!draft.trim() || saveLocked || loadingConversation}><Send aria-hidden="true" /><span>Gửi</span></button>}
                </div>
              </div>
              <div className="assistant-composer-footer">
                <span className="assistant-char-counter">{draft.length}/{MAX_LENGTH} ký tự</span>
              </div>
            </form>
            <footer className="assistant-trust-footer">
              <div className="assistant-trust-item"><ShieldCheck aria-hidden="true" /><span>Thông tin thực tế cần có nguồn</span></div>
              <span className="assistant-trust-sep" aria-hidden="true">•</span>
              <div className="assistant-trust-item"><FileText aria-hidden="true" /><span>Nêu rõ giới hạn khi thiếu dữ liệu</span></div>
            </footer>
          </div></div>
        )}
      </div>
    </section>
  );
}
