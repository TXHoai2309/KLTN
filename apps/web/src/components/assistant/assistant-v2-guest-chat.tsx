"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { FileText, Minus, PanelLeft, PanelLeftOpen, Plus, RotateCcw, Send, ShieldCheck, Sparkles } from "lucide-react";
import type { QaContext, QaConversationSummary } from "../../modules/ai/qa-contract";
import { AssistantAnswer, PROMPT_SUGGESTIONS } from "./assistant-chat";
import { AssistantController, shouldSendOnEnter } from "./assistant-controller";
import { deleteConversation, fetchConversations, renameConversation } from "./assistant-conversation-client";
import { AssistantHttpTransport } from "./assistant-http-transport";
import { GUEST_SIGN_IN_INVITATION, submitGuestMessage } from "./assistant-guest-mode";
import { AssistantLandscape } from "./assistant-landscape";
import { AssistantSidebar } from "./assistant-sidebar";
import { retainPlanningAuthDraft } from "./planning-auth-handoff";
import { createIdempotencyKey } from "../../lib/mutation-client";

/** V2 chat in Guest mode: Q&A only through the existing guest-capable endpoint.
 * It never opens a V2 session and never calls the planning route. */
export function AssistantV2GuestChat({ available = true, onMinimize, initialContext, identity }: { available?: boolean; onMinimize?: () => void; initialContext?: QaContext; identity: string }) {
  const inputId = useId();
  const [controller] = useState(() => new AssistantController(new AssistantHttpTransport(), identity, createIdempotencyKey, initialContext ?? { type: "GENERAL" }));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => () => controller.dispose(), [controller]);
  // Invitations are local to this page; `at` is the number of confirmed turns when asked.
  const [invitations, setInvitations] = useState<{ at: number; text: string }[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const composer = useRef<HTMLTextAreaElement>(null);
  const [conversations, setConversations] = useState<QaConversationSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyMore, setHistoryMore] = useState(false);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const listFetch = useRef<AbortController | null>(null);
  const isPage = !onMinimize;
  const mode = isPage ? "page" : "panel";
  useEffect(() => {
    if (!isPage) return;
    const sync = () => setSidebarOpen(window.innerWidth >= 1024);
    sync(); window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, [isPage]);
  async function loadHistory(search = "", cursor: string | null = null, more = false) {
    listFetch.current?.abort();
    const request = new AbortController(); listFetch.current = request;
    if (more) setHistoryMore(true); else setHistoryLoading(true);
    try {
      const result = await fetchConversations({ search, cursor, signal: request.signal });
      if (request.signal.aborted) return;
      setConversations(current => more ? [...current, ...result.items] : result.items);
      setHistoryCursor(result.nextCursor); setHistoryHasMore(result.hasMore);
    } catch { /* History is optional; Q&A must keep working. */ }
    finally { if (listFetch.current === request) { setHistoryMore(false); setHistoryLoading(false); } }
  }
  useEffect(() => {
    if (!isPage || !available) return;
    const timer = setTimeout(() => { void loadHistory(searchQuery); }, searchQuery ? 250 : 0);
    return () => { clearTimeout(timer); listFetch.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, available, isPage, identity]);
  const pending = state.pending;
  const busy = pending?.phase === "sending";
  const disabled = !available || (!!pending && pending.phase !== "failed");
  function send() {
    if (disabled || !state.draft.trim()) return;
    const text = state.draft;
    const outcome = submitGuestMessage({ controller, text, context: state.context, retain: retainPlanningAuthDraft });
    if (outcome === "SIGN_IN") { setInvitations(current => [...current, { at: state.turns.length, text: text.trim() }]); controller.setDraft(""); }
  }
  function startNew() { if (controller.newConversation()) { setInvitations([]); composer.current?.focus(); } }
  function openConversation(id: string) { window.location.assign(`/assistant?conversationId=${encodeURIComponent(id)}`); }
  async function renameHistory(id: string, title: string) {
    try { await renameConversation(id, title); setConversations(current => current.map(item => item.id === id ? { ...item, title } : item)); return true; } catch { return false; }
  }
  async function deleteHistory(id: string) {
    try { await deleteConversation(id); setConversations(current => current.filter(item => item.id !== id)); return true; } catch { return false; }
  }
  const invite = (at: number) => invitations.filter(item => item.at === at).map((item, index) => <div className="assistant-turn assistant-planning-exchange" key={`invite-${at}-${index}`}>
    <article className="assistant-message assistant-user"><p>{item.text}</p></article>
    <article className="assistant-message assistant-answer"><span className="assistant-speaker"><Sparkles className="assistant-speaker-icon" aria-hidden="true"/><span>Trợ lý AI</span></span>
      <div className="assistant-planning-auth"><p>{GUEST_SIGN_IN_INVITATION}</p><Link className="assistant-planning-login" href="/login?returnTo=%2Fassistant">Đăng nhập để tiếp tục</Link></div>
    </article></div>);
  const empty = !state.turns.length && !pending && !invitations.length;
  return <section className={`${mode === "panel" ? "assistant-chat assistant-chat-panel" : "assistant-chat"} assistant-v2-chat assistant-planning`} data-runtime="v2" data-mode="guest" aria-label="Trợ lý AI" aria-busy={busy} lang="vi">
    {mode === "page" && <AssistantSidebar conversations={conversations} activeConversationId={null} loading={historyLoading} loadingMore={historyMore} hasMore={historyHasMore} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} onNewChat={startNew} onSelectConversation={openConversation} onRenameConversation={renameHistory} onDeleteConversation={deleteHistory} onLoadMore={() => void loadHistory(searchQuery, historyCursor, true)} searchQuery={searchQuery} onSearchChange={setSearchQuery}/>}
    <div className={`assistant-chat-main ${mode === "panel" ? "assistant-panel-main" : "assistant-chat-fullscreen"}`}>
    {mode === "page" && <div className={`assistant-floating-header ${sidebarOpen ? "sidebar-open" : "sidebar-collapsed"}`}>
      <div className="assistant-header-left">
        <button type="button" className="assistant-sidebar-toggle-btn" onClick={() => setSidebarOpen(open => !open)} aria-label={sidebarOpen ? "Thu nhỏ thanh bên lịch sử" : "Mở thanh bên lịch sử (phóng to)"} title={sidebarOpen ? "Thu nhỏ thanh bên" : "Mở thanh bên (phóng to)"}>{sidebarOpen ? <PanelLeft aria-hidden="true"/> : <PanelLeftOpen aria-hidden="true"/>}</button>
        {!sidebarOpen && <button type="button" className="assistant-floating-new-btn" onClick={startNew} aria-label="Tạo cuộc trò chuyện mới" title="Đoạn chat mới"><Plus aria-hidden="true"/></button>}
      </div>
    </div>}
    {mode === "panel" && <header className="destination-panel-header">
      <div className="destination-panel-title-area">
        <span className="destination-panel-badge"><Sparkles className="destination-panel-title-icon" aria-hidden="true" size={16}/></span>
        <div className="destination-panel-title-text"><h2 className="destination-panel-title">Trợ lý AI</h2></div>
      </div>
      <div className="destination-panel-actions">
        <button type="button" className="destination-panel-action-btn" onClick={startNew} aria-label="Bắt đầu cuộc trò chuyện mới" title="Chat mới"><RotateCcw aria-hidden="true" size={16}/></button>
        <button type="button" className="destination-panel-action-btn" onClick={onMinimize} aria-label="Thu nhỏ trợ lý" title="Thu nhỏ"><Minus aria-hidden="true" size={16}/></button>
      </div>
    </header>}
    <div className="assistant-transcript" tabIndex={0} aria-label="Danh sách tin nhắn"><div className="assistant-transcript-inner">
    {empty && <div className="assistant-empty">
      {mode === "page" && <div className="assistant-empty-art"><AssistantLandscape/><Sparkles className="assistant-icon" aria-hidden="true"/></div>}
      <h2>Bạn muốn khám phá điều gì?</h2>
      <p>Hỏi về văn hóa, lịch sử và điểm đến tại Hà Giang. Đăng nhập để nhờ mình lên hành trình.</p>
      <div className="assistant-suggestions" aria-label="Gợi ý câu hỏi">{PROMPT_SUGGESTIONS.map((item, index) => <button key={index} type="button" className="assistant-suggestion-chip" disabled={disabled} onClick={() => { controller.setDraft(item.prompt("Hà Giang")); composer.current?.focus(); }}>
        <span className="assistant-suggestion-icon" aria-hidden="true">{item.icon}</span>
        <div className="assistant-suggestion-info"><span className="assistant-suggestion-title">{item.title}</span><span className="assistant-suggestion-prompt">{item.prompt("Hà Giang")}</span></div>
      </button>)}</div>
    </div>}
    <div className="assistant-messages" aria-live="polite">
      {invite(0)}
      {state.turns.map((turn, index) => <div key={turn.response.turnId}>
        <div className="assistant-turn assistant-planning-exchange">
          <article className="assistant-message assistant-user"><p>{turn.question}</p></article>
          <article className="assistant-message assistant-answer"><span className="assistant-speaker"><Sparkles className="assistant-speaker-icon" aria-hidden="true"/><span>Trợ lý AI</span></span><AssistantAnswer turn={turn.response} question={turn.question} showSources/></article>
        </div>
        {invite(index + 1)}
      </div>)}
      {pending && <div className="assistant-turn assistant-planning-exchange"><article className="assistant-message assistant-user"><p>{pending.attempt.payload.question}</p></article></div>}
    </div>
    {pending && pending.phase !== "sending" && <div role="alert"><p>{pending.message}</p>
      {pending.phase === "failed" ? <button type="button" onClick={() => controller.editFailed()}>Sửa câu hỏi</button> : <button type="button" onClick={() => controller.retry()}>Kiểm tra lại cùng yêu cầu</button>}
    </div>}
    {state.validation && <p role="alert">{state.validation}</p>}
    {busy && <p role="status">Mình đang xử lý yêu cầu…</p>}
    </div></div>
    <div className="assistant-bottom-dock"><div className="assistant-bottom-dock-inner">
    <form noValidate className="assistant-composer" onSubmit={event => { event.preventDefault(); send(); }}>
      <label htmlFor={inputId} className="assistant-sr-only">Tin nhắn cho trợ lý</label>
      <div className="assistant-composer-input">
        <textarea className="resize-none" ref={composer} id={inputId} maxLength={1000} rows={1} placeholder="Nhập câu hỏi về Hà Giang…" value={state.draft} disabled={disabled} onChange={event => controller.setDraft(event.target.value)} onKeyDown={event => { if (shouldSendOnEnter({ key: event.key, shiftKey: event.shiftKey, isComposing: event.nativeEvent.isComposing, keyCode: event.keyCode })) { event.preventDefault(); send(); } }}/>
        <div className="assistant-composer-bar">
          <div className="assistant-composer-left-tools"/>
          <button type="submit" disabled={disabled || !state.draft.trim()} aria-busy={busy}><Send aria-hidden="true"/><span>Gửi</span></button>
        </div>
      </div>
      <div className="assistant-composer-footer"><span>Enter để gửi · Shift+Enter xuống dòng</span><span className="assistant-char-counter">{state.draft.normalize("NFC").trim().length}/1000 ký tự</span></div>
    </form>
    {mode === "page" && <footer className="assistant-trust-footer">
      <div className="assistant-trust-item"><ShieldCheck aria-hidden="true"/><span>Thông tin thực tế cần có nguồn</span></div>
      <span className="assistant-trust-sep" aria-hidden="true">•</span>
      <div className="assistant-trust-item"><FileText aria-hidden="true"/><span>Nêu rõ giới hạn khi thiếu dữ liệu</span></div>
    </footer>}
    </div></div>
    </div>
  </section>;
}
