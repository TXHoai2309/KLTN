"use client";
import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import { FileText, Minus, PanelLeft, PanelLeftOpen, Plus, RotateCcw, Send, ShieldCheck, Sparkles } from "lucide-react";
import { createIdempotencyKey } from "../../lib/mutation-client";
import type { AssistantV2Request } from "../../modules/assistant-agent-v2/http-contract";
import type { PlanningV2Turn } from "../../modules/assistant-agent-v2/travel-planning-session";
import type { InTripV2Turn } from "../../modules/assistant-agent-v2/in-trip-session";
import type { InTripLocation } from "../../modules/in-trip/in-trip-location";
import { requestBrowserLocation } from "../../modules/in-trip/browser-location";
import { createLocationFlowState, transitionLocationFlow, getLocationFlowMessage } from "../../modules/in-trip/location-flow";
import type { MapCoordinate } from "../../modules/map/map-model";
import { TripValidationPanel } from "../../modules/trip-validation/trip-validation-panel";
import { AssistantAnswer, PROMPT_SUGGESTIONS } from "./assistant-chat";
import { AssistantSidebar } from "./assistant-sidebar";
import { deleteConversation, fetchConversations, renameConversation } from "./assistant-conversation-client";
import type { QaConversationSummary } from "../../modules/ai/qa-contract";
import { AssistantLandscape } from "./assistant-landscape";
import { PlanningProposalView } from "./planning-panel";
import { assistantV2Fetch, AssistantV2ClientError, type AssistantV2Reply } from "./assistant-v2-client";
import type { QaContext } from "../../modules/ai/qa-contract";
import { consumePlanningAuthDraft } from "./planning-auth-handoff";

type Exchange = { question: string; turn: PlanningV2Turn | InTripV2Turn };
const ManualLocationPicker = lazy(() => import("../in-trip/manual-location-picker"));
/** Existing visual components; only the transport and transient conversation
 * controller differ. No model or private service is bundled in this client. */
export function AssistantV2Chat({ available = true, tripId, onMinimize, initialContext, identity }: { available?: boolean; tripId?: string; onMinimize?: () => void; initialContext?: QaContext; identity?: string }) {
  const inputId = useId();
  const [sessionId, setSessionId] = useState<string | null>(null);
  // Encrypted server capsule stays in this page's memory, never localStorage,
  // history, URLs or logs. Reload deliberately requires a fresh interaction.
  const stateToken = useRef<string | undefined>(undefined);
  const [draft, setDraft] = useState("");
  const [context, setContext] = useState<QaContext>(initialContext ?? { type: "GENERAL" });
  useEffect(() => { if (identity) { const retained = consumePlanningAuthDraft(identity); if (retained) { setDraft(retained.text); setContext(retained.context); } } }, [identity]);
  const [messages, setMessages] = useState<Exchange[]>([]);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [savedTripId, setSavedTripId] = useState<string | null>(null);
  const [writeUnknown, setWriteUnknown] = useState(false);
  const [manual, setManual] = useState(false);
  const [coordinates, setCoordinates] = useState<MapCoordinate | null>(null);
  const [locationMessage, setLocationMessage] = useState("");
  const [locationFlow, setLocationFlow] = useState(createLocationFlowState);
  const pending = useRef<{ request: AssistantV2Request; key: string; question: string } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const composer = useRef<HTMLTextAreaElement>(null);
  // Saved Q&A history only: V2 planning sessions are temporary and are not listed.
  const [conversations, setConversations] = useState<QaConversationSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyMore, setHistoryMore] = useState(false);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const listFetch = useRef<AbortController | null>(null);
  const isPage = !onMinimize;
  // Same rule as the original chat: the history sidebar is open on desktop widths.
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
    } catch { /* History is optional; the conversation itself must keep working. */ }
    finally { if (listFetch.current === request) { setHistoryMore(false); setHistoryLoading(false); } }
  }
  useEffect(() => {
    if (!isPage || !available) return;
    const timer = setTimeout(() => { void loadHistory(searchQuery); }, searchQuery ? 250 : 0);
    return () => { clearTimeout(timer); listFetch.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, available, isPage, identity]);
  function openConversation(id: string) {
    if (working.current || pending.current || uncertain) { setError("Hoàn tất hoặc đối soát thao tác hiện tại trước khi mở cuộc trò chuyện khác."); return; }
    if (messages.length && !savedTripId && !window.confirm("Phiên lập hành trình hiện tại là tạm thời và sẽ không được lưu. Mở cuộc trò chuyện đã lưu?")) return;
    window.location.assign(`/assistant?conversationId=${encodeURIComponent(id)}`);
  }
  async function renameHistory(id: string, title: string) {
    try { await renameConversation(id, title); setConversations(current => current.map(item => item.id === id ? { ...item, title } : item)); return true; } catch { return false; }
  }
  async function deleteHistory(id: string) {
    try { await deleteConversation(id); setConversations(current => current.filter(item => item.id !== id)); return true; } catch { return false; }
  }
  /** A fresh server session is the only reset; nothing unconfirmed is discarded. */
  function startNew() {
    if (working.current || pending.current || !available) return;
    setSessionId(null); stateToken.current = undefined; setMessages([]); setDraft(""); setError(null); setExpired(false);
    setSavedTripId(null); setWriteUnknown(false); setManual(false); setCoordinates(null); setLocationMessage(""); setLocationFlow(createLocationFlowState());
    composer.current?.focus();
  }
  const latest = messages.at(-1)?.turn;
  const uncertain = !!latest?.uncertain || writeUnknown;
  const latestPlanning = latest && "workspace" in latest ? latest : null;
  const latestInTrip = latest && "trip" in latest ? latest : null;
  async function consume(result: AssistantV2Reply, question: string) {
    if (result.sessionId) setSessionId(result.sessionId);
    if (result.stateToken) stateToken.current = result.stateToken;
    if (result.turn) setMessages(current => [...current, { question, turn: result.turn! }]);
    if (result.save) {
      const write = result.save.save;
      const id = write?.status === "SUCCESS" ? write.data?.tripId : result.save.workspace?.savedTripId;
      if (id) { setSavedTripId(id); setWriteUnknown(false); setError(null); }
      else { const unknown = write?.status === "UNKNOWN" || !!result.save.workspace?.pendingSaveKey; setWriteUnknown(unknown); setError(unknown ? "Chưa rõ kết quả lưu. Hãy kiểm tra lại cùng thao tác." : result.save.message ?? "Chưa có xác nhận lưu thành công."); }
    }
  }
  async function perform(request: AssistantV2Request, question: string, retry = false) {
    if (working.current || !available || expired) return;
    working.current = true; setBusy(true); setError(null);
    const attempt = retry && pending.current ? pending.current : { request: request.operation === "START" ? request : { ...request, stateToken: stateToken.current }, key: createIdempotencyKey(), question };
    pending.current = attempt;
    try {
      const result = await assistantV2Fetch(attempt.request, attempt.key);
      await consume(result, attempt.question);
      pending.current = null;
      if (attempt.request.operation !== "START") setDraft("");
    } catch (cause) {
      setError(cause instanceof AssistantV2ClientError ? cause.message : "Chưa nhận được kết quả. Kiểm tra lại cùng yêu cầu trước khi tiếp tục.");
      if (cause instanceof AssistantV2ClientError && ["ASSISTANT_RUNTIME_CHANGED", "ASSISTANT_SESSION_EXPIRED"].includes(cause.code)) { setExpired(true); pending.current = null; }
      else if (cause instanceof AssistantV2ClientError && cause.status < 500) pending.current = null;
    } finally { working.current = false; setBusy(false); }
  }
  async function send() {
    if (!draft.trim() || working.current || !available || expired || pending.current) return;
    let handle = sessionId;
    if (!handle) {
      working.current = true; setBusy(true); setError(null);
      const request: AssistantV2Request = { action: "ASSISTANT_V2", operation: "START", ...(tripId ? { tripId } : { context }) };
      const key = createIdempotencyKey();
      pending.current = { request, key, question: "Mở phiên trợ lý" };
      try { const result = await assistantV2Fetch(request, key); handle = result.sessionId ?? null; if (!handle || !result.stateToken) throw Error(); stateToken.current = result.stateToken; setSessionId(handle); pending.current = null; }
      catch (cause) { setError(cause instanceof AssistantV2ClientError ? cause.message : "Chưa mở được phiên trợ lý. Nội dung vẫn được giữ."); }
      finally { working.current = false; setBusy(false); }
    }
    if (handle) await perform({ action: "ASSISTANT_V2", operation: "TURN", sessionId: handle, text: draft.trim() }, draft.trim());
  }
  async function provideLocation(location: InTripLocation) {
    if (sessionId) await perform({ action: "ASSISTANT_V2", operation: "LOCATION", sessionId, location }, "Cung cấp vị trí cho yêu cầu đang chờ");
  }
  async function gps() {
    if (working.current || uncertain || !available) return;
    working.current = true; setBusy(true);
    const requested = transitionLocationFlow(locationFlow, { type: "REQUEST_GPS" }); setLocationFlow(requested);
    const result = await requestBrowserLocation(typeof navigator !== "undefined" ? navigator.geolocation : null);
    const next = transitionLocationFlow(requested, { type: "GPS_RESULT", requestId: requested.requestId, result });
    setLocationFlow(next); setLocationMessage(getLocationFlowMessage(next));
    working.current = false; setBusy(false);
    if (result.status === "OK") await provideLocation({ source: "GPS", latitude: result.latitude, longitude: result.longitude, accuracyMeters: result.accuracyMeters, capturedAt: new Date(result.capturedAt).toISOString() });
    else { setManual(true); setLocationFlow(transitionLocationFlow(next, { type: "SELECT_MANUAL" })); }
  }
  const disabled = !available || busy || expired || !!pending.current || !!savedTripId;
  const mode = onMinimize ? "panel" : "page";
  return <section className={`${mode === "panel" ? "assistant-chat assistant-chat-panel" : "assistant-chat"} assistant-v2-chat assistant-planning`} data-runtime="v2" aria-label="Trợ lý AI" aria-busy={busy} lang="vi">
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
    {!messages.length && <div className="assistant-empty">
      {mode === "page" && <div className="assistant-empty-art"><AssistantLandscape/><Sparkles className="assistant-icon" aria-hidden="true"/></div>}
      <h2>{tripId ? "Chuyến đi của bạn" : "Bạn muốn khám phá điều gì?"}</h2>
      <p>{tripId ? "Bạn muốn xem lượt tiếp theo hay đề xuất chỉnh phần nào của chuyến đi?" : "Hỏi về văn hóa, lịch sử và điểm đến tại Hà Giang, hoặc nhờ mình lên hành trình."}</p>
      <p className="assistant-muted">Phiên trò chuyện tạm thời. Tải lại trang sẽ mở phiên mới; hành trình đã lưu vẫn giữ nguyên.</p>
      {!tripId && <div className="assistant-suggestions" aria-label="Gợi ý câu hỏi">{PROMPT_SUGGESTIONS.map((item, index) => <button key={index} type="button" className="assistant-suggestion-chip" disabled={disabled} onClick={() => { setDraft(item.prompt("Hà Giang")); composer.current?.focus(); }}>
        <span className="assistant-suggestion-icon" aria-hidden="true">{item.icon}</span>
        <div className="assistant-suggestion-info"><span className="assistant-suggestion-title">{item.title}</span><span className="assistant-suggestion-prompt">{item.prompt("Hà Giang")}</span></div>
      </button>)}</div>}
    </div>}
    <div className="assistant-messages" aria-live="polite">{messages.map(({ question, turn }, index) => {
      const planning = "workspace" in turn ? turn : null;
      const inTrip = "trip" in turn ? turn : null;
      const qa = planning?.responsePlan.qa ?? inTrip?.plan.qa;
      return <div className="assistant-turn assistant-planning-exchange" key={index}>
        <article className="assistant-message assistant-user"><p>{question}</p></article>
        <article className="assistant-message assistant-answer"><span className="assistant-speaker"><Sparkles className="assistant-speaker-icon" aria-hidden="true"/><span>Trợ lý AI</span></span>{qa ? <><AssistantAnswer turn={qa} question={question} showSources/>{(qa.status === "ANSWERED" || qa.status === "PARTIAL") && qa.citations.some(source => source.sourceUrl === null) && <details className="assistant-answer-sources"><summary>Nguồn tài liệu nội bộ</summary><ul>{qa.citations.filter(source => source.sourceUrl === null).map(source => <li key={source.id}><strong>{source.title}</strong>{source.locators.map((locator, i) => <p key={i}>{locator.pageNumber ? `Trang ${locator.pageNumber}` : ""}{locator.pageNumber && locator.section ? " · " : ""}{locator.section}</p>)}<small>Tài liệu chưa có liên kết công khai.</small></li>)}</ul></details>}{(planning?.responsePlan.compound || inTrip?.plan.compound) && <p>Phần chỉnh lịch chưa được thực hiện. Bạn hãy gửi riêng yêu cầu chỉnh sau khi xem thông tin nguồn.</p>}</> : <p>{turn.message}</p>}</article>
        {planning?.generated && (planning.responsePlan.proposalChanged || planning.responsePlan.goal === "PRESENT_PROPOSAL") && <PlanningProposalView generated={planning.generated} isCurrent={planning.generated.proposal.proposalId === latestPlanning?.generated?.proposal.proposalId && planning.generated.version === latestPlanning.generated.version} disabled={disabled || uncertain} savedTripId={savedTripId} onSave={() => sessionId && void perform({ action: "ASSISTANT_V2", operation: "SAVE", sessionId, confirmed: true }, "Xác nhận và lưu chuyến đi")}/>}
        {inTrip?.plan.validation && <TripValidationPanel validation={inTrip.plan.validation}/>}
        {inTrip?.proposal && inTrip.plan.goal === "AWAIT_CONFIRMATION" && <ol className="assistant-planning-days">{inTrip.proposal.candidate.days.map(day => <li key={day.dayIndex}>Ngày {day.dayIndex}<ul>{day.visits.map(visit => <li key={visit.visitId}>{inTrip.plan.labels?.[visit.destinationId] ?? inTrip.trip.destinationLabels[visit.destinationId] ?? "Điểm đến không còn khả dụng"} · {Math.floor(visit.startMinute / 60)}:{String(visit.startMinute % 60).padStart(2, "0")} · {visit.plannedDurationMinutes} phút</li>)}</ul></li>)}</ol>}
      </div>;
    })}</div>
    {error && <p role="alert">{error}</p>}
    {busy && <p role="status">Mình đang xử lý yêu cầu…</p>}
    {latestInTrip && <p className="assistant-muted">Nguồn vị trí: {latestInTrip.plan.currentLocationSource === "GPS" ? "GPS" : latestInTrip.plan.currentLocationSource === "MANUAL" ? "Thủ công" : "Chưa cung cấp"}.</p>}
    {pending.current && <button type="button" disabled={busy || !available} onClick={() => void perform(pending.current!.request, pending.current!.question, true)}>Kiểm tra lại cùng yêu cầu</button>}
    {uncertain && sessionId && <button type="button" disabled={busy || !available} onClick={() => void perform({ action: "ASSISTANT_V2", operation: "RECONCILE", sessionId }, "Kiểm tra kết quả thao tác trước")}>Đối soát thao tác trước</button>}
    {latestInTrip?.plan.goal === "ASK_LOCATION" && !uncertain && <div className="assistant-planning-actions">
      <button type="button" disabled={disabled} onClick={() => void gps()}>Dùng GPS hiện tại</button><button type="button" disabled={disabled} onClick={() => setManual(true)}>Chọn vị trí thủ công</button>
      {locationMessage && <p role="status">{locationMessage}</p>}
      {manual && <><Suspense fallback={<p role="status">Đang mở chọn vị trí…</p>}><ManualLocationPicker coordinates={coordinates} onChange={setCoordinates}/></Suspense><button type="button" disabled={disabled || !coordinates} onClick={() => coordinates && void provideLocation({ source: "MANUAL", ...coordinates, capturedAt: new Date().toISOString() })}>Xác nhận vị trí thủ công</button></>}
    </div>}
    {latestInTrip?.plan.requiresConfirmation && sessionId && <button type="button" disabled={disabled || uncertain} onClick={() => void perform({ action: "ASSISTANT_V2", operation: "TURN", sessionId, text: "Áp dụng đi" }, "Áp dụng đi")}>Xác nhận áp dụng phương án</button>}
    {savedTripId && <p role="status">Đã lưu chuyến đi. <a href={`/trips/${encodeURIComponent(savedTripId)}`}>Mở chuyến đi</a></p>}
    </div></div>
    <div className="assistant-bottom-dock"><div className="assistant-bottom-dock-inner">
    {expired ? <a className="assistant-notice-banner" href={tripId ? `/trips/${encodeURIComponent(tripId)}/in-trip` : "/assistant"}>Mở lại phiên từ trạng thái hiện tại</a> : <form noValidate className="assistant-composer" onSubmit={event => { event.preventDefault(); void send(); }}>
      <label htmlFor={inputId} className="assistant-sr-only">Tin nhắn cho trợ lý</label>
      <div className="assistant-composer-input">
        <textarea className="resize-none" ref={composer} id={inputId} maxLength={tripId ? 500 : 1000} rows={1} placeholder={tripId ? "Nhập yêu cầu về chuyến đi…" : "Nhập câu hỏi hoặc nhu cầu chuyến đi Hà Giang…"} value={draft} disabled={disabled} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }}/>
        <div className="assistant-composer-bar">
          <div className="assistant-composer-left-tools"/>
          <button type="submit" disabled={disabled || !draft.trim()} aria-busy={busy}><Send aria-hidden="true"/><span>Gửi</span></button>
        </div>
      </div>
      <div className="assistant-composer-footer"><span>Enter để gửi · Shift+Enter xuống dòng</span><span className="assistant-char-counter">{draft.normalize("NFC").trim().length}/{tripId ? 500 : 1000} ký tự</span></div>
    </form>}
    {mode === "page" && <footer className="assistant-trust-footer">
      <div className="assistant-trust-item"><ShieldCheck aria-hidden="true"/><span>Thông tin thực tế cần có nguồn</span></div>
      <span className="assistant-trust-sep" aria-hidden="true">•</span>
      <div className="assistant-trust-item"><FileText aria-hidden="true"/><span>Nêu rõ giới hạn khi thiếu dữ liệu</span></div>
    </footer>}
    </div></div>
    </div>
  </section>;
}
