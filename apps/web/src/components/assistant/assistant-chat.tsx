"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { QaAnswerPart, QaCompletedTurn, QaPublicCitation } from "../../modules/ai/qa-contract";
import { createIdempotencyKey } from "../../lib/mutation-client";
import { AssistantController, hasUnresolvedAttempt, shouldSendOnEnter, type AssistantTransport, type ConfirmedTurn } from "./assistant-controller";

export type CitationSlot = (input: { part: QaAnswerPart; citations: QaPublicCitation[]; turn: QaCompletedTurn }) => ReactNode;

export function AssistantAnswer({ turn, citationSlot }: { turn: QaCompletedTurn; citationSlot?: CitationSlot }) {
  if (turn.status === "INSUFFICIENT_SOURCE") return <><strong>Chưa đủ nguồn</strong><p>{turn.message}</p></>;
  if (turn.status === "CLARIFICATION_REQUIRED") return <><strong>Cần làm rõ</strong><p>{turn.clarificationQuestion}</p></>;
  return <>
    {turn.status === "PARTIAL" && <strong>Câu trả lời một phần</strong>}
    {turn.answerParts.map((part, index) => <div className="assistant-answer-part" key={index}>
      <p>{part.text}</p>
      <div className="assistant-citation-slot">{citationSlot?.({ part, citations: turn.citations, turn }) ?? <span>Thông tin nguồn chưa được tích hợp.</span>}</div>
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
    if (nearEnd.current && viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight;
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
    <div className="assistant-chat-toolbar"><span>Hỏi đáp chung về Hà Giang</span><button type="button" onClick={startNew} disabled={!transport || sending}>Cuộc hội thoại mới</button></div>
    {!transport && <div className="assistant-notice" role="status"><strong>Trợ lý AI chưa khả dụng</strong><p>Chức năng gửi câu hỏi sẽ mở khi dịch vụ hỏi đáp sẵn sàng.</p></div>}
    {demo && <div className="assistant-notice assistant-demo-notice"><strong>DEMO / DỮ LIỆU MÔ PHỎNG</strong><p>Các phản hồi và tham chiếu chỉ dùng kiểm thử giao diện, không phải thông tin du lịch đã xác minh.</p></div>}
    <div ref={viewport} className="assistant-transcript" tabIndex={0} aria-label="Danh sách tin nhắn" onScroll={() => {
      const el = viewport.current!;
      nearEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 64;
      if (nearEnd.current) setUnseen(false);
    }}>
      {!state.turns.length && !state.pending && <div className="assistant-empty"><span className="assistant-icon" aria-hidden="true">AI</span><h2>Khám phá qua những câu hỏi</h2><p>Hỏi về văn hóa, lịch sử và điểm đến trong phạm vi dữ liệu Hà Giang.</p><p className="assistant-muted">Câu trả lời cần có nguồn. Khi thiếu dữ liệu, trợ lý sẽ nêu rõ giới hạn.</p></div>}
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
      <textarea id={questionId} ref={composer} rows={2} placeholder="Nhập câu hỏi…" value={state.draft} disabled={!transport}
        aria-invalid={!!state.validation} aria-describedby={helpId} onChange={(event) => controller.setDraft(event.target.value)}
        onKeyDown={(event) => { if (shouldSendOnEnter({ key: event.key, shiftKey: event.shiftKey, isComposing: event.nativeEvent.isComposing, keyCode: event.nativeEvent.keyCode })) { event.preventDefault(); submit(); } }} />
      <div className="assistant-composer-footer"><span id={helpId}>Enter để gửi · Shift+Enter xuống dòng<br />{state.draft.normalize("NFC").trim().length}/2000 UTF-16</span><button type="submit" disabled={!transport || unresolved || !state.draft.trim()} aria-busy={sending}>Gửi</button></div>
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
    <header className="assistant-page-heading"><h1>Trợ lý AI</h1><p>Không có bối cảnh cụ thể</p></header>
    <div className="assistant-page-grid"><div className="assistant-chat-column">{children}</div><aside className="assistant-aside" aria-label="Bối cảnh và nguyên tắc AI">
      <section className="assistant-context"><h2>Bối cảnh</h2><p>Hỏi đáp chung về Hà Giang.</p><div className="assistant-context-label">Không có bối cảnh cụ thể</div><p className="assistant-muted">Việc xem nội dung khác không tự thay đổi bối cảnh hội thoại.</p></section>
      <section className="assistant-principles"><h2>Nguyên tắc AI</h2><p>Câu trả lời về thông tin thực tế cần dựa trên nguồn được phép sử dụng.</p><p>Khi chưa đủ dữ liệu được xác minh, trợ lý sẽ nêu rõ thay vì suy đoán.</p></section>
    </aside></div>
  </div></main>;
}
