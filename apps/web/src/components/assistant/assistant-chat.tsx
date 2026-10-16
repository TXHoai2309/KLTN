"use client";

import { createContext, useContext, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { CirclePlus, FileText, Info, Leaf, Send, ShieldCheck, Sparkles } from "lucide-react";
import { AssistantLandscape } from "./assistant-landscape";
import { AssistantCitations } from "./assistant-citations";
import { buildCitationIndex, isReadingCitation } from "./assistant-citation-utils";
import type { QaContext, QaAnswerPart, QaCompletedTurn, QaPublicCitation } from "../../modules/ai/qa-contract";
import { createIdempotencyKey } from "../../lib/mutation-client";
import { AssistantController, hasUnresolvedAttempt, shouldSendOnEnter, type AssistantTransport, type ConfirmedTurn } from "./assistant-controller";
import { assistantContextFromUrl } from "./assistant-context-navigation";

export type CitationSlot = (input: { part: QaAnswerPart; citations: QaPublicCitation[]; turn: QaCompletedTurn }) => ReactNode;

// Shell-local presentation only; the controller remains the context authority.
const AssistantContextDisplay = createContext<((label: string | null) => void) | null>(null);

export function AssistantAnswer({ turn, citationSlot }: { turn: QaCompletedTurn; citationSlot?: CitationSlot }) {
  if (turn.status === "CONVERSATIONAL") return <p>{turn.message}</p>;
  if (turn.status === "INSUFFICIENT_SOURCE") return <div className="assistant-source-notice"><strong>Chưa đủ dữ liệu được xác minh</strong><p>Chưa đủ dữ liệu được xác minh để trả lời chính xác câu hỏi này.</p><p className="assistant-muted">Bạn có thể nêu rõ điểm đến và thông tin muốn hỏi, hoặc điều chỉnh câu hỏi trong ô bên dưới.</p></div>;
  if (turn.status === "CLARIFICATION_REQUIRED") return <><strong>Cần làm rõ</strong><p>{turn.clarificationQuestion}</p></>;
  const citationIndex = buildCitationIndex(turn);
  return <>
    {turn.status === "PARTIAL" && <strong>Câu trả lời một phần — chỉ những nội dung có nguồn hỗ trợ</strong>}
    {turn.answerParts.map((part, index) => <div className="assistant-answer-part" key={index}>
      <p>{part.text}</p>
      <div className="assistant-citation-slot">{citationSlot?.({ part, citations: turn.citations, turn }) ?? <AssistantCitations part={part} index={citationIndex} />}</div>
    </div>)}
    {turn.status === "PARTIAL" && <div className="assistant-unanswered"><strong>Phần chưa đủ dữ liệu</strong><ul>{turn.unansweredAspects.map((aspect, index) => <li key={index}>{aspect}</li>)}</ul></div>}
  </>;
}

export function AssistantTurn({ turn, citationSlot }: { turn: ConfirmedTurn; citationSlot?: CitationSlot }) {
  return <div className="assistant-turn">
    <article className="assistant-message assistant-user" aria-label="Câu hỏi đã được xác nhận"><p>{turn.question}</p><small>Đã xác nhận lượt hỏi</small></article>
    <article className="assistant-message assistant-answer" aria-label="Phản hồi của trợ lý"><span className="assistant-speaker">Trợ lý AI</span><AssistantAnswer turn={turn.response} citationSlot={citationSlot} /></article>
  </div>;
}

const PROMPT_SUGGESTIONS = [
  { icon: "🗺️", title: "Lịch trình 3N2Đ", prompt: "Gợi ý lịch trình du lịch tự túc Hà Giang 3 ngày 2 đêm tối ưu nhất." },
  { icon: "🌸", title: "Mùa hoa tam giác mạch", prompt: "Thời điểm nào hoa tam giác mạch Hà Giang nở đẹp nhất và các địa điểm ngắm đẹp nhất?" },
  { icon: "🏍️", title: "Đèo Mã Pí Lèng & Sông Nho Quế", prompt: "Kinh nghiệm vượt đèo Mã Pí Lèng và chèo thuyền sông Nho Quế an toàn." },
  { icon: "🍲", title: "Ẩm thực bản địa", prompt: "Những món ăn đặc sản vùng cao Hà Giang nhất định phải thử một lần?" },
] as const;

/** Surface-independent chat core: a page or future popup can reuse this component. */
export type AssistantContextProps = { initialContext?: QaContext; destinations?: readonly { id: string; name: string }[]; contextError?: string; syncContextUrl?: boolean };
export function AssistantChat({ transport = null, identity = "unavailable", citationSlot, demo = false, available = true, initialContext, destinations = [], contextError, syncContextUrl = false }: {
  transport?: AssistantTransport | null; identity?: string; citationSlot?: CitationSlot; demo?: boolean; available?: boolean;
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
    if (unresolved) dialog.current?.showModal();
    else { nearEnd.current = true; setUnseen(false); controller.newConversation(); composer.current?.focus(); }
  }
  const status = state.validation ?? state.pending?.message ?? (state.turns.length ? "Đã nhận phản hồi. Bạn có thể hỏi tiếp." : "Chưa có lượt hỏi.");
  return <section className="assistant-chat" aria-label="Hội thoại với trợ lý" lang="vi">
    <header className="assistant-chat-header">
      <div className="assistant-chat-header-inner">
        <div className="assistant-header-left">
          <div className="assistant-brand">
            <span className="assistant-brand-icon"><Sparkles aria-hidden="true" /></span>
            <h2>Trợ lý AI Hà Giang</h2>
          </div>
        </div>

        <div className="assistant-header-right">
          {contextError ? (
            <p className="assistant-context-controls assistant-context-error" role="alert">
              {contextError} <a href="/assistant">Quay về hỏi đáp chung</a>
            </p>
          ) : (
            <div className="assistant-context-controls">
              <div className="assistant-context-bar">
                <label htmlFor={`${instanceId}-context`} className="assistant-context-label" title="Chọn bối cảnh hội thoại">
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
                  <button type="button" className="assistant-context-clear-btn" disabled={unresolved || !available} onClick={() => changeContext({ type: "GENERAL" })}>
                    Xóa bối cảnh
                  </button>
                )}
              </div>
            </div>
          )}

          <button type="button" className="assistant-new-chat-btn" onClick={startNew} disabled={!transport || !available || sending}>
            <CirclePlus aria-hidden="true" />
            <span>Cuộc hội thoại mới</span>
          </button>
        </div>
      </div>
    </header>

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
                    controller.setDraft(item.prompt);
                    composer.current?.focus();
                  }}
                >
                  <span className="assistant-suggestion-icon" aria-hidden="true">{item.icon}</span>
                  <div className="assistant-suggestion-info">
                    <span className="assistant-suggestion-title">{item.title}</span>
                    <span className="assistant-suggestion-prompt">{item.prompt}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
        {state.turns.map((turn) => <AssistantTurn key={`${turn.response.conversationId}:${turn.response.turnId}`} turn={turn} citationSlot={citationSlot} />)}
        {state.pending && <div className="assistant-local-attempt">
          <article className="assistant-message assistant-user" aria-label="Câu hỏi chưa xác nhận"><p>{state.pending.attempt.payload.question}</p><small>{sending ? "Đang gửi — chưa xác nhận" : "Chưa được xác nhận lưu"}</small></article>
          <div className="assistant-recovery" data-phase={state.pending.phase}>
            <p>{state.pending.message}</p>
            {state.pending.phase === "failed" && <button type="button" onClick={() => { controller.editFailed(); composer.current?.focus(); }}>Sửa câu hỏi</button>}
            {["unknown", "malformed"].includes(state.pending.phase) && <>
              <button type="button" disabled={!available} onClick={() => { if (available) controller.retry(); }}>Thử xác nhận lại</button>
              <button type="button" className="assistant-abandon" onClick={() => dialog.current?.showModal()}>Bỏ theo dõi và bắt đầu cuộc hội thoại mới</button>
            </>}
          </div>
        </div>}
      </div>
    </div>

    {unseen && <button className="assistant-new-message" type="button" onClick={() => { nearEnd.current = true; setUnseen(false); viewport.current?.scrollTo({ top: viewport.current.scrollHeight }); }}>Đến tin nhắn mới</button>}

    <div className="assistant-bottom-dock">
      <div className="assistant-bottom-dock-inner">
        <div className="assistant-live assistant-muted" role="status" aria-live="polite" aria-atomic="true">{status}</div>

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
            <button type="submit" disabled={!transport || !available || !!contextError || unresolved || !state.draft.trim()} aria-busy={sending}>
              <Send aria-hidden="true" />
              <span>Gửi</span>
            </button>
          </div>
          <div className="assistant-composer-footer" id={helpId}>
            <span>Enter để gửi · Shift+Enter xuống dòng</span>
            <span>{state.draft.normalize("NFC").trim().length}/2000 UTF-16</span>
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
      <p id={dialogDescriptionId}>Bỏ theo dõi không có nghĩa server đã hủy. Yêu cầu cũ có thể vẫn đang xử lý; thao tác này không xóa dữ liệu server. Khi rời phiên, bạn có thể mất khả năng phục hồi lượt cũ vì chức năng đọc lịch sử và phục hồi chưa sẵn sàng.</p>
      <div><button type="button" autoFocus onClick={() => dialog.current?.close()}>Tiếp tục theo dõi</button><button type="button" onClick={() => { controller.newConversation(true); dialog.current?.close(); nearEnd.current = true; setUnseen(false); composer.current?.focus(); }}>Bỏ theo dõi và bắt đầu mới</button></div>
    </dialog>
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
