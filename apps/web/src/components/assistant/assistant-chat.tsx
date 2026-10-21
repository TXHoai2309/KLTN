"use client";

import { createContext, useContext, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Check, CirclePlus, Copy, FileText, Info, Leaf, Loader2, PanelLeft, Send, ShieldCheck, Sparkles } from "lucide-react";
import { AssistantLandscape } from "./assistant-landscape";
import { AssistantCitations, AssistantSourceList } from "./assistant-citations";
import { buildCitationIndex, isReadingCitation } from "./assistant-citation-utils";
import type { QaContext, QaAnswerPart, QaCompletedTurn, QaPublicCitation, QaConversationSummary } from "../../modules/ai/qa-contract";
import { createIdempotencyKey } from "../../lib/mutation-client";
import { AssistantController, hasUnresolvedAttempt, shouldSendOnEnter, type AssistantTransport, type ConfirmedTurn } from "./assistant-controller";
import { assistantContextFromUrl } from "./assistant-context-navigation";
import { AssistantAnswerContent } from "./assistant-answer-content";
import { assistantFollowupSuggestions } from "./assistant-followups";
import { assistantSourceReply } from "./assistant-source-reply";
import { AssistantSidebar } from "./assistant-sidebar";
import { fetchConversations, fetchConversationDetail, renameConversation, deleteConversation } from "./assistant-conversation-client";

export type CitationSlot = (input: { part: QaAnswerPart; citations: QaPublicCitation[]; turn: QaCompletedTurn }) => ReactNode;

// Shell-local presentation only; the controller remains the context authority.
const AssistantContextDisplay = createContext<((label: string | null) => void) | null>(null);

export function AssistantAnswer({ turn, citationSlot, question, showSources = true }: { turn: QaCompletedTurn; citationSlot?: CitationSlot; question?: string; showSources?: boolean }) {
  const sourcePrefix=useId();
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

const PROMPT_SUGGESTIONS = [
  { icon: "🗺️", title: "Giới thiệu điểm đến", prompt: (subject: string) => `Giới thiệu ngắn gọn về ${subject}.` },
  { icon: "🏛️", title: "Danh hiệu và xếp hạng", prompt: (subject: string) => `${subject} có danh hiệu hoặc xếp hạng nào?` },
  { icon: "🏔️", title: "Đặc điểm tự nhiên", prompt: (subject: string) => `${subject} có những đặc điểm tự nhiên nào nổi bật?` },
  { icon: "🌿", title: "Văn hóa bản địa", prompt: (subject: string) => `${subject} có những nét văn hóa nào đáng chú ý?` },
] as const;

/** Surface-independent chat core: a page or future popup can reuse this component. */
export type AssistantContextProps = { initialContext?: QaContext; destinations?: readonly { id: string; name: string }[]; contextError?: string; syncContextUrl?: boolean };
export function AssistantChat({ transport = null, identity = "unavailable", citationSlot, demo = false, available = true, initialContext, destinations = [], contextError, syncContextUrl = false, showSources = false }: {
  transport?: AssistantTransport | null; identity?: string; citationSlot?: CitationSlot; demo?: boolean; available?: boolean; showSources?: boolean;
} & AssistantContextProps) {
  const instanceId = useId();
  const questionId = `${instanceId}-question`;
  const helpId = `${instanceId}-input-help`;
  const dialogTitleId = `${instanceId}-abandon-title`;
  const dialogDescriptionId = `${instanceId}-abandon-description`;
  // Changing a transport remounts its session; changing identity invalidates it.
  const [controller] = useState(() => new AssistantController(transport, identity, createIdempotencyKey,
    assistantContextFromUrl(initialContext, destinations, syncContextUrl && typeof window !== "undefined" ? window.location.search : undefined)));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const setContextDisplay = useContext(AssistantContextDisplay);
  const contextLabel = contextError ? "Bối cảnh không khả dụng" : state.context.type === "DESTINATION"
    ? destinations.find(destination => state.context.type === "DESTINATION" && destination.id === state.context.destinationId)?.name ?? "Điểm đến đang chọn"
    : "Hỏi đáp chung về Hà Giang";
  useEffect(() => {
    setContextDisplay?.(contextLabel);
    return () => setContextDisplay?.(null);
  }, [contextLabel, setContextDisplay]);
  const composer = useRef<HTMLTextAreaElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const nearEnd = useRef(true);
  const [unseen, setUnseen] = useState(false);
  const unresolved = hasUnresolvedAttempt(state);
  const sending = state.pending?.phase === "sending";
  const openingSubject = state.context.type === "DESTINATION"
    ? destinations.find(destination => state.context.type === "DESTINATION" && destination.id === state.context.destinationId)?.name ?? "điểm đến đang chọn"
    : "Cao nguyên đá Đồng Văn";
  const latest = state.turns.at(-1);
  const followups = latest ? assistantFollowupSuggestions(latest.question, latest.response) : [];

  // Conversation history state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [conversations, setConversations] = useState<QaConversationSummary[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [conversationsLoadingMore, setConversationsLoadingMore] = useState(false);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [conversationLoadNotice, setConversationLoadNotice] = useState<string | null>(null);
  const [pendingSwitchId, setPendingSwitchId] = useState<string | null>(null);

  useEffect(() => {
    function handleResize() {
      if (typeof window !== "undefined") {
        setSidebarOpen(window.innerWidth >= 1024);
      }
    }
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  async function loadConversationList(search = "", cursor: string | null = null, isMore = false) {
    if (!available || !transport) return;
    if (isMore) setConversationsLoadingMore(true);
    else setConversationsLoading(true);
    try {
      const res = await fetchConversations({ search, cursor });
      setConversations(prev => isMore ? [...prev, ...res.items] : res.items);
      setHistoryCursor(res.nextCursor);
      setHistoryHasMore(res.hasMore);
    } catch {
      // Network/offline error: fail-safe
    } finally {
      if (isMore) setConversationsLoadingMore(false);
      else setConversationsLoading(false);
    }
  }

  useEffect(() => {
    void loadConversationList();
  }, [available, transport]);

  // Debounced search
  useEffect(() => {
    if (!available || !transport) return;
    const timer = setTimeout(() => {
      void loadConversationList(searchQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery, available, transport]);

  const activeFetchRef = useRef<AbortController | null>(null);
  async function loadConversationById(id: string) {
    if (activeFetchRef.current) activeFetchRef.current.abort();
    const abortController = new AbortController();
    activeFetchRef.current = abortController;
    setLoadingConversation(true);
    setConversationLoadNotice(null);
    try {
      const detail = await fetchConversationDetail(id, abortController.signal);
      if (abortController.signal.aborted) return;
      controller.loadConversation(
        detail.conversation.id,
        detail.turns,
        detail.conversation.headTurnId,
        detail.conversation.context
      );
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        if (url.searchParams.get("conversationId") !== id) {
          url.searchParams.set("conversationId", id);
          window.history.pushState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
        }
      }
      nearEnd.current = true;
      setUnseen(false);
    } catch {
      if (abortController.signal.aborted) return;
      setConversationLoadNotice("Cuộc trò chuyện không tồn tại hoặc đã hết hạn.");
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.delete("conversationId");
        window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
      }
      controller.newConversation(true);
    } finally {
      if (activeFetchRef.current === abortController) {
        setLoadingConversation(false);
        activeFetchRef.current = null;
      }
    }
  }

  // Deep linking: restore conversation from query param on initial load
  useEffect(() => {
    if (typeof window === "undefined" || !available || !transport) return;
    const params = new URLSearchParams(window.location.search);
    const convId = params.get("conversationId");
    if (convId && !state.conversationId) {
      void loadConversationById(convId);
    }
  }, [available, transport, state.conversationId]);

  // Browser Back/Forward navigation
  useEffect(() => {
    if (typeof window === "undefined") return;
    function handlePopState() {
      const params = new URLSearchParams(window.location.search);
      const convId = params.get("conversationId");
      if (convId !== state.conversationId) {
        if (convId) {
          void loadConversationById(convId);
        } else {
          controller.newConversation(true);
        }
      }
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [state.conversationId, controller]);

  // When a newly submitted question confirms into a conversationId, update URL and refresh sidebar
  const prevConvIdRef = useRef<string | null>(state.conversationId);
  useEffect(() => {
    if (state.conversationId && state.conversationId !== prevConvIdRef.current) {
      prevConvIdRef.current = state.conversationId;
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        if (url.searchParams.get("conversationId") !== state.conversationId) {
          url.searchParams.set("conversationId", state.conversationId);
          window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
        }
      }
      void loadConversationList(searchQuery);
    } else if (!state.conversationId && prevConvIdRef.current) {
      prevConvIdRef.current = null;
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        if (url.searchParams.has("conversationId")) {
          url.searchParams.delete("conversationId");
          window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
        }
      }
    }
  }, [state.conversationId, loadConversationList, searchQuery]);

  async function handleRename(id: string, newTitle: string): Promise<boolean> {
    try {
      await renameConversation(id, newTitle);
      setConversations(prev => prev.map(c => c.id === id ? { ...c, title: newTitle } : c));
      return true;
    } catch {
      return false;
    }
  }

  async function handleDelete(id: string): Promise<boolean> {
    try {
      await deleteConversation(id);
      setConversations(prev => prev.filter(c => c.id !== id));
      if (state.conversationId === id) {
        startNew();
      }
      return true;
    } catch {
      return false;
    }
  }

  function selectConversation(id: string) {
    if (id === state.conversationId) return;
    if (unresolved) {
      setPendingSwitchId(id);
      dialog.current?.showModal();
      return;
    }
    void loadConversationById(id);
  }

  useEffect(() => { controller.changeIdentity(identity); }, [controller, identity]);
  useEffect(() => () => controller.dispose(), [controller]);
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const sourceToggled = () => { if (isReadingCitation(el)) nearEnd.current = false; };
    // Native toggle does not bubble; capture keeps repeated disclosures independent.
    el.addEventListener("toggle", sourceToggled, true);
    return () => el.removeEventListener("toggle", sourceToggled, true);
  }, []);
  useEffect(() => {
    if (nearEnd.current && viewport.current && !isReadingCitation(viewport.current)) viewport.current.scrollTop = viewport.current.scrollHeight;
    else setUnseen(true);
  }, [state.turns, state.pending]);
  function submit() {
    if (!available || contextError) return;
    if (!controller.submit()) composer.current?.focus();
  }
  function changeContext(context: QaContext) {
    if (!available || contextError || !controller.changeContext(context)) return;
    if (syncContextUrl) {
      // Explicit choices replace the public reference only. No conversation,
      // question, identity or client metadata is stored in browser history.
      const url = new URL(window.location.href);
      url.searchParams.delete("destinationId");
      if (context.type === "DESTINATION") url.searchParams.set("destinationId", context.destinationId);
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }
  function startNew() {
    if (!available) return;
    if (unresolved) {
      setPendingSwitchId(null);
      dialog.current?.showModal();
    } else {
      nearEnd.current = true;
      setUnseen(false);
      controller.newConversation();
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.delete("conversationId");
        window.history.pushState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
      }
      composer.current?.focus();
    }
  }
  const status = state.validation ?? (sending ? "Đang soạn câu trả lời…" : state.pending?.message) ?? (state.turns.length ? "Đã nhận phản hồi. Bạn có thể hỏi tiếp." : "Chưa có lượt hỏi.");
  const activeTitle = conversations.find(c => c.id === state.conversationId)?.title;

  return <section className="assistant-chat" aria-label="Hội thoại với trợ lý" lang="vi">
    <AssistantSidebar
      conversations={conversations}
      activeConversationId={state.conversationId}
      loading={conversationsLoading}
      loadingMore={conversationsLoadingMore}
      hasMore={historyHasMore}
      isOpen={sidebarOpen}
      onClose={() => setSidebarOpen(false)}
      onNewChat={startNew}
      onSelectConversation={selectConversation}
      onRenameConversation={handleRename}
      onDeleteConversation={handleDelete}
      onLoadMore={() => void loadConversationList(searchQuery, historyCursor, true)}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
    />

    <div className="assistant-chat-main">
      {/* Floating toggle button replacing bulky header */}
      <div className={`assistant-floating-header ${sidebarOpen ? "sidebar-open" : "sidebar-collapsed"}`}>
        <div className="assistant-header-left">
          <button
            type="button"
            className="assistant-sidebar-toggle-btn"
            onClick={() => setSidebarOpen(prev => !prev)}
            aria-label={sidebarOpen ? "Đóng thanh bên lịch sử" : "Mở thanh bên lịch sử"}
            title={sidebarOpen ? "Đóng thanh bên" : "Mở thanh bên"}
          >
            <PanelLeft aria-hidden="true" />
          </button>
        </div>
      </div>

      {contextError && (
        <div className="assistant-notice-banner">
          <p className="assistant-context-error" role="alert">
            {contextError} <a href="/assistant">Quay về hỏi đáp chung</a>
          </p>
        </div>
      )}

      {conversationLoadNotice && (
        <div className="assistant-notice-banner">
          <div className="assistant-notice" role="alert">
            <Info aria-hidden="true" />
            <div>
              <strong>Thông báo</strong>
              <p>{conversationLoadNotice}</p>
            </div>
          </div>
        </div>
      )}
      {transport && !available && <div className="assistant-notice-banner"><p className="assistant-status-notice" role="status">Đang xác minh phiên — tạm dừng gửi câu hỏi.</p></div>}
      {!transport && <div className="assistant-notice-banner"><div className="assistant-notice" role="status"><strong>Trợ lý AI chưa khả dụng</strong><p>Chức năng gửi câu hỏi sẽ mở khi dịch vụ hỏi đáp sẵn sàng.</p></div></div>}
      {demo && <div className="assistant-notice-banner"><div className="assistant-notice assistant-demo-notice"><Info aria-hidden="true" /><div><strong>Dữ liệu mô phỏng</strong><p>Phản hồi chỉ dùng để kiểm thử giao diện, không phải thông tin du lịch đã xác minh.</p></div></div></div>}

      <div ref={viewport} className="assistant-transcript" tabIndex={0} aria-label="Danh sách tin nhắn" onScroll={() => {
        const el = viewport.current!;
        if (isReadingCitation(el)) { nearEnd.current = false; return; }
        nearEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 64;
        if (nearEnd.current) setUnseen(false);
      }}>
        <div className="assistant-transcript-inner">
          {loadingConversation ? (
            <div className="assistant-sidebar-loading" role="status" style={{ minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Loader2 className="assistant-spinner" aria-hidden="true" />
              <span>Đang mở cuộc trò chuyện…</span>
            </div>
          ) : (
            <>
              {!state.turns.length && !state.pending && (
                <div className="assistant-empty">
                  <div className="assistant-empty-art">
                    <AssistantLandscape />
                    <Sparkles className="assistant-icon" aria-hidden="true" />
                  </div>
                  <h2>Bạn muốn khám phá điều gì?</h2>
                  <p>Hỏi về văn hóa, lịch sử và điểm đến tại Hà Giang.</p>
                  <p className="assistant-muted">Trợ lý sẽ nêu rõ khi chưa đủ nguồn xác minh.</p>

                  <div className="assistant-suggestions" aria-label="Gợi ý câu hỏi">
                    {PROMPT_SUGGESTIONS.map((item, index) => (
                      <button
                        key={index}
                        type="button"
                        className="assistant-suggestion-chip"
                        disabled={!transport || !available || !!contextError}
                        onClick={() => {
                          controller.setDraft(item.prompt(openingSubject));
                          composer.current?.focus();
                        }}
                      >
                        <span className="assistant-suggestion-icon" aria-hidden="true">{item.icon}</span>
                        <div className="assistant-suggestion-info">
                          <span className="assistant-suggestion-title">{item.title}</span>
                          <span className="assistant-suggestion-prompt">{item.prompt(openingSubject)}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {state.turns.map((turn) => <AssistantTurn key={`${turn.response.conversationId}:${turn.response.turnId}`} turn={turn} citationSlot={citationSlot} showSources={showSources} />)}
              {!!followups.length && !state.pending && <nav className="assistant-followups" aria-label="Câu hỏi tiếp nối">
                <p className="assistant-muted">Bạn có thể hỏi tiếp{state.draft.trim() ? " — xóa nội dung ô nhập để chọn gợi ý" : " — chọn để điền vào ô nhập"}:</p>
                <div>{followups.map(question => <button type="button" key={question} disabled={!available || !!contextError || unresolved || !!state.draft.trim()} onClick={() => {
                  controller.setDraft(question);
                  composer.current?.focus();
                }}>{question}</button>)}</div>
              </nav>}
              {state.pending && <div className="assistant-local-attempt">
                <article className="assistant-message assistant-user" aria-label="Câu hỏi chưa xác nhận"><p>{state.pending.attempt.payload.question}</p><small>{sending ? "Đang gửi — chưa xác nhận" : "Chưa được xác nhận lưu"}</small></article>
                {sending ? (
                  <article className="assistant-message assistant-answer assistant-pending-answer" aria-label="Phản hồi của trợ lý">
                    <span className="assistant-speaker">
                      <Sparkles className="assistant-speaker-icon" aria-hidden="true" />
                      <span>Trợ lý AI</span>
                    </span>
                    <div className="assistant-typing-indicator" role="status" aria-label="Trợ lý AI đang soạn câu trả lời">
                      <span className="assistant-typing-dots" aria-hidden="true">
                        <span className="assistant-typing-dot" />
                        <span className="assistant-typing-dot" />
                        <span className="assistant-typing-dot" />
                      </span>
                      <span className="assistant-typing-label">Đang soạn câu trả lời…</span>
                    </div>
                  </article>
                ) : (
                  <div className="assistant-recovery" data-phase={state.pending.phase}>
                    <p>{state.pending.message}</p>
                    {state.pending.phase === "failed" && <button type="button" onClick={() => { controller.editFailed(); composer.current?.focus(); }}>Sửa câu hỏi</button>}
                    {["unknown", "malformed"].includes(state.pending.phase) && <>
                      <button type="button" disabled={!available} onClick={() => { if (available) controller.retry(); }}>Thử xác nhận lại</button>
                      <button type="button" className="assistant-abandon" onClick={() => dialog.current?.showModal()}>Bỏ theo dõi và bắt đầu cuộc hội thoại mới</button>
                    </>}
                  </div>
                )}
              </div>}
            </>
          )}
        </div>
      </div>

      {unseen && <button className="assistant-new-message" type="button" onClick={() => { nearEnd.current = true; setUnseen(false); viewport.current?.scrollTo({ top: viewport.current.scrollHeight }); }}>Đến tin nhắn mới</button>}

      <div className="assistant-bottom-dock">
        <div className="assistant-bottom-dock-inner">
          <div className={`assistant-live ${!state.validation && !sending && !state.pending?.message ? "assistant-live-idle" : "assistant-live-active"} ${state.validation ? "assistant-live-error" : ""}`} role="status" aria-live="polite" aria-atomic="true">{status}</div>

          <form noValidate className="assistant-composer" onSubmit={(event) => { event.preventDefault(); submit(); }}>
            <label htmlFor={questionId} className="assistant-sr-only">Câu hỏi của bạn</label>
            <div className="assistant-composer-input">
              <textarea
                className="resize-none"
                id={questionId}
                ref={composer}
                rows={2}
                placeholder="Nhập câu hỏi về Hà Giang…"
                value={state.draft}
                disabled={!transport || !available || !!contextError}
                aria-invalid={!!state.validation}
                aria-describedby={helpId}
                onChange={(event) => controller.setDraft(event.target.value)}
                onKeyDown={(event) => { if (shouldSendOnEnter({ key: event.key, shiftKey: event.shiftKey, isComposing: event.nativeEvent.isComposing, keyCode: event.nativeEvent.keyCode })) { event.preventDefault(); submit(); } }}
              />

              <div className="assistant-composer-bar">
                {!contextError && (
                  <div className="assistant-context-controls">
                    <div className="assistant-context-bar">
                      <label htmlFor={`${instanceId}-context`} className="assistant-context-label" title="Chọn bối cảnh hỏi đáp">
                        <Leaf aria-hidden="true" />
                        <span className="assistant-sr-only">Bối cảnh hiện tại</span>
                      </label>
                      {state.context.type === "DESTINATION" && (
                        <strong className="assistant-context-name">
                          {destinations.find(destination => state.context.type === "DESTINATION" && destination.id === state.context.destinationId)?.name ?? "Điểm đến đang chọn"}
                        </strong>
                      )}
                      <select
                        id={`${instanceId}-context`}
                        value={state.context.type === "DESTINATION" ? state.context.destinationId : ""}
                        disabled={unresolved || !available}
                        onChange={event => changeContext(event.target.value ? { type: "DESTINATION", destinationId: event.target.value } : { type: "GENERAL" })}
                        className="assistant-context-select"
                        aria-label="Chọn bối cảnh hỏi đáp"
                      >
                        <option value="">Hỏi đáp chung</option>
                        {destinations.map(destination => <option key={destination.id} value={destination.id}>{destination.name}</option>)}
                      </select>
                      {state.context.type === "DESTINATION" && (
                        <button type="button" className="assistant-context-clear-btn" disabled={unresolved || !available} onClick={() => changeContext({ type: "GENERAL" })} title="Xóa bối cảnh">
                          Xóa bối cảnh
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <button type="submit" disabled={!transport || !available || !!contextError || unresolved || !state.draft.trim()} aria-busy={sending}>
                  <Send aria-hidden="true" />
                  <span>Gửi</span>
                </button>
              </div>
            </div>
            <div className="assistant-composer-footer" id={helpId}>
              <span>Enter để gửi · Shift+Enter xuống dòng</span>
              <span className="assistant-char-counter">{state.draft.normalize("NFC").trim().length}/2000 ký tự</span>
            </div>
          </form>

          <footer className="assistant-trust-footer">
            <div className="assistant-trust-item">
              <ShieldCheck aria-hidden="true" />
              <span>Thông tin thực tế cần có nguồn</span>
            </div>
            <span className="assistant-trust-sep" aria-hidden="true">•</span>
            <div className="assistant-trust-item">
              <FileText aria-hidden="true" />
              <span>Nêu rõ giới hạn khi thiếu dữ liệu</span>
            </div>
          </footer>
        </div>
      </div>

      <dialog ref={dialog} className="assistant-dialog" aria-labelledby={dialogTitleId} aria-describedby={dialogDescriptionId}>
        <h2 id={dialogTitleId}>Bỏ theo dõi lượt chưa xác nhận?</h2>
        <p id={dialogDescriptionId}>Bỏ theo dõi không có nghĩa server đã hủy. Yêu cầu cũ có thể vẫn đang xử lý; thao tác này không xóa dữ liệu server.</p>
        <div>
          <button type="button" autoFocus onClick={() => { setPendingSwitchId(null); dialog.current?.close(); }}>Tiếp tục theo dõi</button>
          <button type="button" onClick={() => {
            dialog.current?.close();
            nearEnd.current = true;
            setUnseen(false);
            if (pendingSwitchId) {
              const targetId = pendingSwitchId;
              setPendingSwitchId(null);
              void loadConversationById(targetId);
            } else {
              controller.newConversation(true);
              if (typeof window !== "undefined") {
                const url = new URL(window.location.href);
                url.searchParams.delete("conversationId");
                window.history.pushState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
              }
              composer.current?.focus();
            }
          }}>Bỏ theo dõi và tiếp tục</button>
        </div>
      </dialog>
    </div>
  </section>;
}

export function AssistantShell({ children }: { children: ReactNode }) {
  const [contextLabel, setContextLabel] = useState<string | null>(null);
  return (
    <AssistantContextDisplay.Provider value={setContextLabel}>
      <main className="assistant-page assistant-page-fullscreen" lang="vi">
        <h1 className="assistant-sr-only">Trợ lý AI Hà Giang</h1>
        {children}
      </main>
    </AssistantContextDisplay.Provider>
  );
}
