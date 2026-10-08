"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { CirclePlus, FileText, Info, Leaf, Send, ShieldCheck, Sparkles } from "lucide-react";
import { AssistantLandscape } from "./assistant-landscape";
import { AssistantCitations } from "./assistant-citations";
import { buildCitationIndex, isReadingCitation } from "./assistant-citation-utils";
import type { QaAnswerPart, QaCompletedTurn, QaPublicCitation } from "../../modules/ai/qa-contract";
import { createIdempotencyKey } from "../../lib/mutation-client";
import { AssistantController, hasUnresolvedAttempt, shouldSendOnEnter, type AssistantTransport, type ConfirmedTurn } from "./assistant-controller";

export type CitationSlot = (input: { part: QaAnswerPart; citations: QaPublicCitation[]; turn: QaCompletedTurn }) => ReactNode;

export function AssistantAnswer({ turn, citationSlot }: { turn: QaCompletedTurn; citationSlot?: CitationSlot }) {
  if (turn.status === "INSUFFICIENT_SOURCE") return <><strong>Chưa đủ nguồn</strong><p>{turn.message}</p></>;
  if (turn.status === "CLARIFICATION_REQUIRED") return <><strong>Cần làm rõ</strong><p>{turn.clarificationQuestion}</p></>;
  const citationIndex = buildCitationIndex(turn);
  return <>
    {turn.status === "PARTIAL" && <strong>Câu trả lời một phần</strong>}
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

/** Surface-independent chat core: a page or future popup can reuse this component. */
export function AssistantChat({ transport = null, identity = "unavailable", citationSlot, demo = false }: {
  transport?: AssistantTransport | null; identity?: string; citationSlot?: CitationSlot; demo?: boolean;
}) {
  const instanceId = useId();
  const questionId = `${instanceId}-question`;
  const helpId = `${instanceId}-input-help`;
  const dialogTitleId = `${instanceId}-abandon-title`;
  const dialogDescriptionId = `${instanceId}-abandon-description`;
  // Changing a transport remounts its session; changing identity invalidates it.
  const [controller] = useState(() => new AssistantController(transport, identity, createIdempotencyKey));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
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
    if (!controller.submit()) composer.current?.focus();
  }
  function startNew() {
    if (unresolved) dialog.current?.showModal();
    else { nearEnd.current = true; setUnseen(false); controller.newConversation(); composer.current?.focus(); }
  }
  const status = state.validation ?? state.pending?.message ?? (state.turns.length ? "Đã nhận phản hồi. Bạn có thể hỏi tiếp." : "Chưa có lượt hỏi.");
  return <section className="assistant-chat" aria-label="Hội thoại với trợ lý" lang="vi">
    <div className="assistant-chat-toolbar"><span className="assistant-chat-topic"><Sparkles aria-hidden="true" />Hỏi đáp chung về Hà Giang</span><button type="button" onClick={startNew} disabled={!transport || sending}><CirclePlus aria-hidden="true" />Cuộc hội thoại mới</button></div>
    {!transport && <div className="assistant-notice" role="status"><strong>Trợ lý AI chưa khả dụng</strong><p>Chức năng gửi câu hỏi sẽ mở khi dịch vụ hỏi đáp sẵn sàng.</p></div>}
    {demo && <div className="assistant-notice assistant-demo-notice"><Info aria-hidden="true" /><div><strong>Dữ liệu mô phỏng</strong><p>Phản hồi chỉ dùng để kiểm thử giao diện, không phải thông tin du lịch đã xác minh.</p></div></div>}
    <div ref={viewport} className="assistant-transcript" tabIndex={0} aria-label="Danh sách tin nhắn" onScroll={() => {
      const el = viewport.current!;
      if (isReadingCitation(el)) { nearEnd.current = false; return; }
      nearEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 64;
      if (nearEnd.current) setUnseen(false);
    }}>
      {!state.turns.length && !state.pending && <div className="assistant-empty"><div className="assistant-empty-art"><AssistantLandscape /><Sparkles className="assistant-icon" aria-hidden="true" /></div><h2>Bạn muốn khám phá điều gì?</h2><p>Hỏi về văn hóa, lịch sử và điểm đến tại Hà Giang.</p><p className="assistant-muted">Trợ lý sẽ nêu rõ khi chưa đủ nguồn xác minh.</p></div>}
      {state.turns.map((turn) => <AssistantTurn key={`${turn.response.conversationId}:${turn.response.turnId}`} turn={turn} citationSlot={citationSlot} />)}
      {state.pending && <div className="assistant-local-attempt">
        <article className="assistant-message assistant-user" aria-label="Câu hỏi chưa xác nhận"><p>{state.pending.attempt.payload.question}</p><small>{sending ? "Đang gửi — chưa xác nhận" : "Chưa được xác nhận lưu"}</small></article>
        <div className="assistant-recovery" data-phase={state.pending.phase}>
          <p>{state.pending.message}</p>
          {state.pending.phase === "failed" && <button type="button" onClick={() => { controller.editFailed(); composer.current?.focus(); }}>Sửa câu hỏi</button>}
          {["unknown", "malformed"].includes(state.pending.phase) && <>
            <button type="button" onClick={() => controller.retry()}>Thử xác nhận lại</button>
            <button type="button" className="assistant-abandon" onClick={() => dialog.current?.showModal()}>Bỏ theo dõi và bắt đầu cuộc hội thoại mới</button>
          </>}
        </div>
      </div>}
    </div>
    {unseen && <button className="assistant-new-message" type="button" onClick={() => { nearEnd.current = true; setUnseen(false); viewport.current?.scrollTo({ top: viewport.current.scrollHeight }); }}>Đến tin nhắn mới</button>}
    <div className="assistant-live assistant-muted" role="status" aria-live="polite" aria-atomic="true">{status}</div>
    <form className="assistant-composer" onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <label htmlFor={questionId}>Câu hỏi của bạn</label>
      <div className="assistant-composer-input"><textarea id={questionId} ref={composer} rows={2} placeholder="Nhập câu hỏi về Hà Giang…" value={state.draft} disabled={!transport}
        aria-invalid={!!state.validation} aria-describedby={helpId} onChange={(event) => controller.setDraft(event.target.value)}
        onKeyDown={(event) => { if (shouldSendOnEnter({ key: event.key, shiftKey: event.shiftKey, isComposing: event.nativeEvent.isComposing, keyCode: event.nativeEvent.keyCode })) { event.preventDefault(); submit(); } }} />
      <button type="submit" disabled={!transport || unresolved || !state.draft.trim()} aria-busy={sending}><Send aria-hidden="true" />Gửi</button></div>
      <div className="assistant-composer-footer" id={helpId}><span>Enter để gửi · Shift+Enter xuống dòng</span><span>{state.draft.normalize("NFC").trim().length}/2000 UTF-16</span></div>
    </form>
    <dialog ref={dialog} className="assistant-dialog" aria-labelledby={dialogTitleId} aria-describedby={dialogDescriptionId}>
      <h2 id={dialogTitleId}>Bỏ theo dõi lượt chưa xác nhận?</h2>
      <p id={dialogDescriptionId}>Bỏ theo dõi không có nghĩa server đã hủy. Yêu cầu cũ có thể vẫn đang xử lý; thao tác này không xóa dữ liệu server. Khi rời phiên, bạn có thể mất khả năng phục hồi lượt cũ vì chức năng đọc lịch sử và phục hồi chưa sẵn sàng.</p>
      <div><button type="button" autoFocus onClick={() => dialog.current?.close()}>Tiếp tục theo dõi</button><button type="button" onClick={() => { controller.newConversation(true); dialog.current?.close(); nearEnd.current = true; setUnseen(false); composer.current?.focus(); }}>Bỏ theo dõi và bắt đầu mới</button></div>
    </dialog>
  </section>;
}

export function AssistantShell({ children }: { children: ReactNode }) {
  return <main className="assistant-page" lang="vi"><div className="assistant-page-inner">
    <header className="assistant-page-heading"><AssistantLandscape className="assistant-heading-art" /><h1>Trợ lý AI</h1><p>Khám phá Hà Giang qua những câu hỏi</p></header>
    <div className="assistant-page-grid"><div className="assistant-chat-column">{children}</div><aside className="assistant-aside" aria-label="Bối cảnh và nguyên tắc AI">
      <section className="assistant-context"><h2>Bối cảnh</h2><p>Hỏi đáp chung về Hà Giang.</p><span className="assistant-context-badge"><Leaf aria-hidden="true" />Hỏi đáp chung</span><div className="assistant-context-label">Không có bối cảnh cụ thể</div><p className="assistant-context-description assistant-muted">Việc xem nội dung khác không tự thay đổi bối cảnh hội thoại.</p></section>
      <section className="assistant-principles"><h2>Nguyên tắc AI</h2><div className="assistant-principle"><span><ShieldCheck aria-hidden="true" /></span><div><strong>Thông tin thực tế cần có nguồn</strong><p>Câu trả lời dựa trên thông tin được phép sử dụng và có nguồn xác minh.</p></div></div><div className="assistant-principle"><span><FileText aria-hidden="true" /></span><div><strong>Nêu rõ giới hạn khi thiếu dữ liệu</strong><p>Khi chưa đủ dữ liệu được xác minh, trợ lý sẽ nêu rõ thay vì suy đoán.</p></div></div><AssistantLandscape className="assistant-principles-art" /></section>
    </aside></div>
  </div></main>;
}
