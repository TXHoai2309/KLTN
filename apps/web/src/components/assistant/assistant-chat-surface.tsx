"use client";

import { useId, useRef, useState, useEffect, type ReactNode, type RefObject } from "react";
import { FileText, Info, Leaf, Loader2, Send, ShieldCheck, Sparkles } from "lucide-react";
import { AssistantLandscape } from "./assistant-landscape";
import { AssistantTurn, type CitationSlot } from "./assistant-chat";
import { isReadingCitation } from "./assistant-citation-utils";
import {
  hasUnresolvedAttempt,
  shouldSendOnEnter,
  type AssistantController,
  type AssistantState,
  type AssistantTransport,
} from "./assistant-controller";
import { assistantFollowupSuggestions } from "./assistant-followups";
import { updateConversationPreference } from "./assistant-conversation-client";
import type { QaContext } from "../../modules/ai/qa-contract";

export const PROMPT_SUGGESTIONS = [
  { icon: "🗺️", title: "Giới thiệu điểm đến", prompt: (subject: string) => `Giới thiệu ngắn gọn về ${subject}.` },
  { icon: "🏛️", title: "Danh hiệu và xếp hạng", prompt: (subject: string) => `${subject} có danh hiệu hoặc xếp hạng nào?` },
  { icon: "🏔️", title: "Đặc điểm tự nhiên", prompt: (subject: string) => `${subject} có những đặc điểm tự nhiên nào nổi bật?` },
  { icon: "🌿", title: "Văn hóa bản địa", prompt: (subject: string) => `${subject} có những nét văn hóa nào đáng chú ý?` },
] as const;

export interface AssistantChatSurfaceProps {
  controller: AssistantController;
  state: AssistantState;
  transport?: AssistantTransport | null;
  available?: boolean;
  contextError?: string;
  citationSlot?: CitationSlot;
  showSources?: boolean;
  demo?: boolean;
  variant?: "page" | "panel";
  pinnedDestinationName?: string;
  destinations?: readonly { id: string; name: string }[];
  showContextControls?: boolean;
  noticeBanner?: ReactNode;
  headerSlot?: ReactNode;
  onNewChat?: () => void;
  onAbandonConfirmed?: () => void;
  onOpenFullPage?: () => void;
  onMinimize?: () => void;
  syncContextUrl?: boolean;
  loadingConversation?: boolean;
  composerRef?: RefObject<HTMLTextAreaElement | null>;
  viewportRef?: RefObject<HTMLDivElement | null>;
  dialogRef?: RefObject<HTMLDialogElement | null>;
}

export function AssistantChatSurface({
  controller,
  state,
  transport = null,
  available = true,
  contextError,
  citationSlot,
  showSources = false,
  demo = false,
  variant = "page",
  pinnedDestinationName,
  destinations = [],
  showContextControls = true,
  noticeBanner,
  headerSlot,
  onNewChat,
  onAbandonConfirmed,
  onOpenFullPage,
  onMinimize,
  syncContextUrl = false,
  loadingConversation = false,
  composerRef: externalComposerRef,
  viewportRef: externalViewportRef,
  dialogRef: externalDialogRef,
}: AssistantChatSurfaceProps) {
  const instanceId = useId();
  const questionId = `${instanceId}-question`;
  const helpId = `${instanceId}-input-help`;
  const dialogTitleId = `${instanceId}-abandon-title`;
  const dialogDescriptionId = `${instanceId}-abandon-description`;

  const internalComposerRef = useRef<HTMLTextAreaElement>(null);
  const internalViewportRef = useRef<HTMLDivElement>(null);
  const internalDialogRef = useRef<HTMLDialogElement>(null);

  const composer = externalComposerRef ?? internalComposerRef;
  const viewport = externalViewportRef ?? internalViewportRef;
  const dialog = externalDialogRef ?? internalDialogRef;

  const nearEnd = useRef(true);
  const [unseen, setUnseen] = useState(false);
  const unresolved = hasUnresolvedAttempt(state);
  const sending = state.pending?.phase === "sending";

  const openingSubject =
    pinnedDestinationName ??
    (state.context.type === "DESTINATION"
      ? destinations.find(
          destination => state.context.type === "DESTINATION" && destination.id === state.context.destinationId
        )?.name ?? "điểm đến đang chọn"
      : "Cao nguyên đá Đồng Văn");

  const latest = state.turns.at(-1);
  const followups = latest ? assistantFollowupSuggestions(latest.question, latest.response) : [];

  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const sourceToggled = () => {
      if (isReadingCitation(el)) nearEnd.current = false;
    };
    el.addEventListener("toggle", sourceToggled, true);
    return () => el.removeEventListener("toggle", sourceToggled, true);
  }, [viewport]);

  useEffect(() => {
    if (nearEnd.current && viewport.current && !isReadingCitation(viewport.current)) {
      viewport.current.scrollTop = viewport.current.scrollHeight;
    } else {
      setUnseen(true);
    }
  }, [state.turns, state.pending, viewport]);

  function submit() {
    if (!available || contextError) return;
    if (!controller.submit()) composer.current?.focus();
  }

  function changeContext(context: QaContext) {
    if (!available || contextError || !controller.changeContext(context)) return;
    if (syncContextUrl && typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("destinationId");
      if (context.type === "DESTINATION") url.searchParams.set("destinationId", context.destinationId);
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }

  function handleStartNew() {
    if (!available) return;
    if (unresolved) {
      dialog.current?.showModal();
    } else {
      nearEnd.current = true;
      setUnseen(false);
      if (onNewChat) {
        onNewChat();
      } else {
        controller.newConversation();
      }
      composer.current?.focus();
    }
  }

  function handleAbandonConfirm() {
    dialog.current?.close();
    nearEnd.current = true;
    setUnseen(false);
    if (onAbandonConfirmed) {
      onAbandonConfirmed();
    } else {
      controller.newConversation(true);
      composer.current?.focus();
    }
  }

  const status =
    state.validation ??
    (sending ? "Đang soạn câu trả lời…" : state.pending?.message) ??
    (state.turns.length ? "Đã nhận phản hồi. Bạn có thể hỏi tiếp." : "Chưa có lượt hỏi.");

  return (
    <div className={`assistant-surface-container ${variant === "panel" ? "assistant-surface-panel" : "assistant-surface-page"}`}>
      {headerSlot}

      {contextError && (
        <div className="assistant-notice-banner">
          <p className="assistant-context-error" role="alert">
            {contextError}{" "}
            {variant === "page" && <a href="/assistant">Quay về hỏi đáp chung</a>}
          </p>
        </div>
      )}

      {noticeBanner}

      {transport && !available && (
        <div className="assistant-notice-banner">
          <p className="assistant-status-notice" role="status">
            Đang xác minh phiên — tạm dừng gửi câu hỏi.
          </p>
        </div>
      )}

      {!transport && (
        <div className="assistant-notice-banner">
          <div className="assistant-notice" role="status">
            <strong>Trợ lý AI chưa khả dụng</strong>
            <p>Chức năng gửi câu hỏi sẽ mở khi dịch vụ hỏi đáp sẵn sàng.</p>
          </div>
        </div>
      )}

      {demo && (
        <div className="assistant-notice-banner">
          <div className="assistant-notice assistant-demo-notice">
            <Info aria-hidden="true" />
            <div>
              <strong>Dữ liệu mô phỏng</strong>
              <p>Phản hồi chỉ dùng để kiểm thử giao diện, không phải thông tin du lịch đã xác minh.</p>
            </div>
          </div>
        </div>
      )}

      <div
        ref={viewport}
        className="assistant-transcript"
        tabIndex={0}
        aria-label="Danh sách tin nhắn"
        onScroll={() => {
          const el = viewport.current;
          if (!el) return;
          if (isReadingCitation(el)) {
            nearEnd.current = false;
            return;
          }
          nearEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 64;
          if (nearEnd.current) setUnseen(false);
        }}
      >
        <div className="assistant-transcript-inner">
          {loadingConversation ? (
            <div
              className="assistant-sidebar-loading"
              role="status"
              style={{ minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <Loader2 className="assistant-spinner" aria-hidden="true" />
              <span>Đang mở cuộc trò chuyện…</span>
            </div>
          ) : (
            <>
              {!state.turns.length && !state.pending && (
                <div className="assistant-empty">
                  {variant === "page" && (
                    <div className="assistant-empty-art">
                      <AssistantLandscape />
                      <Sparkles className="assistant-icon" aria-hidden="true" />
                    </div>
                  )}
                  <h2>Bạn muốn khám phá điều gì?</h2>
                  <p>
                    {pinnedDestinationName
                      ? `Hỏi trợ lý AI về ${pinnedDestinationName}.`
                      : "Hỏi về văn hóa, lịch sử và điểm đến tại Hà Giang."}
                  </p>
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
                        <span className="assistant-suggestion-icon" aria-hidden="true">
                          {item.icon}
                        </span>
                        <div className="assistant-suggestion-info">
                          <span className="assistant-suggestion-title">{item.title}</span>
                          <span className="assistant-suggestion-prompt">{item.prompt(openingSubject)}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {state.turns.map(turn => (
                <AssistantTurn
                  key={`${turn.response.conversationId}:${turn.response.turnId}`}
                  turn={turn}
                  citationSlot={citationSlot}
                  showSources={showSources}
                />
              ))}

              {!!followups.length && !state.pending && (
                <nav className="assistant-followups" aria-label="Câu hỏi tiếp nối">
                  <p className="assistant-muted">
                    Bạn có thể hỏi tiếp
                    {state.draft.trim() ? " — xóa nội dung ô nhập để chọn gợi ý" : " — chọn để điền vào ô nhập"}:
                  </p>
                  <div>
                    {followups.map(question => (
                      <button
                        type="button"
                        key={question}
                        disabled={!available || !!contextError || unresolved || !!state.draft.trim()}
                        onClick={() => {
                          controller.setDraft(question);
                          composer.current?.focus();
                        }}
                      >
                        {question}
                      </button>
                    ))}
                  </div>
                </nav>
              )}

              {state.pending && (
                <div className="assistant-local-attempt">
                  <article className="assistant-message assistant-user" aria-label="Câu hỏi chưa xác nhận">
                    <p>{state.pending.attempt.payload.question}</p>
                    <small>{sending ? "Đang gửi — chưa xác nhận" : "Chưa được xác nhận lưu"}</small>
                  </article>
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
                      {state.pending.phase === "failed" && (
                        <button
                          type="button"
                          onClick={() => {
                            controller.editFailed();
                            composer.current?.focus();
                          }}
                        >
                          Sửa câu hỏi
                        </button>
                      )}
                      {["unknown", "malformed"].includes(state.pending.phase) && (
                        <>
                          <button
                            type="button"
                            disabled={!available}
                            onClick={() => {
                              if (available) controller.retry();
                            }}
                          >
                            Thử xác nhận lại
                          </button>
                          <button
                            type="button"
                            className="assistant-abandon"
                            onClick={() => dialog.current?.showModal()}
                          >
                            Bỏ theo dõi và bắt đầu cuộc hội thoại mới
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {unseen && (
        <button
          className="assistant-new-message"
          type="button"
          onClick={() => {
            nearEnd.current = true;
            setUnseen(false);
            viewport.current?.scrollTo({ top: viewport.current.scrollHeight });
          }}
        >
          Đến tin nhắn mới
        </button>
      )}

      <div className="assistant-bottom-dock">
        <div className="assistant-bottom-dock-inner">
          <div
            className={`assistant-live ${
              !state.validation && !sending && !state.pending?.message
                ? "assistant-live-idle"
                : "assistant-live-active"
            } ${state.validation ? "assistant-live-error" : ""}`}
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {status}
          </div>

          <form
            noValidate
            className="assistant-composer"
            onSubmit={event => {
              event.preventDefault();
              submit();
            }}
          >
            <label htmlFor={questionId} className="assistant-sr-only">
              Câu hỏi của bạn
            </label>
            <div className="assistant-composer-input">
              <textarea
                className="resize-none"
                id={questionId}
                ref={composer}
                rows={1}
                placeholder={
                  pinnedDestinationName
                    ? `Nhập câu hỏi về ${pinnedDestinationName}…`
                    : "Nhập câu hỏi về Hà Giang…"
                }
                value={state.draft}
                disabled={!transport || !available || !!contextError}
                aria-invalid={!!state.validation}
                aria-describedby={helpId}
                onChange={event => controller.setDraft(event.target.value)}
                onKeyDown={event => {
                  if (
                    shouldSendOnEnter({
                      key: event.key,
                      shiftKey: event.shiftKey,
                      isComposing: event.nativeEvent.isComposing,
                      keyCode: event.nativeEvent.keyCode,
                    })
                  ) {
                    event.preventDefault();
                    submit();
                  }
                }}
              />

              <div className="assistant-composer-bar">
                <div className="assistant-composer-left-tools">
                  {showContextControls && !contextError && (
                    <div className="assistant-context-controls">
                      <div className="assistant-context-bar">
                        <label
                          htmlFor={`${instanceId}-context`}
                          className="assistant-context-label"
                          title="Chọn bối cảnh hỏi đáp"
                        >
                          <Leaf aria-hidden="true" />
                          <span className="assistant-sr-only">Bối cảnh hiện tại</span>
                        </label>
                        {state.context.type === "DESTINATION" && (
                          <strong className="assistant-context-name">
                            {destinations.find(
                              destination =>
                                state.context.type === "DESTINATION" && destination.id === state.context.destinationId
                            )?.name ?? "Điểm đến đang chọn"}
                          </strong>
                        )}
                        <select
                          id={`${instanceId}-context`}
                          value={state.context.type === "DESTINATION" ? state.context.destinationId : ""}
                          disabled={unresolved || !available}
                          onChange={event =>
                            changeContext(
                              event.target.value
                                ? { type: "DESTINATION", destinationId: event.target.value }
                                : { type: "GENERAL" }
                            )
                          }
                          className="assistant-context-select"
                          aria-label="Chọn bối cảnh hỏi đáp"
                        >
                          <option value="">Hỏi đáp chung</option>
                          {destinations.map(destination => (
                            <option key={destination.id} value={destination.id}>
                              {destination.name}
                            </option>
                          ))}
                        </select>
                        {state.context.type === "DESTINATION" && (
                          <button
                            type="button"
                            className="assistant-context-clear-btn"
                            disabled={unresolved || !available}
                            onClick={() => changeContext({ type: "GENERAL" })}
                            title="Xóa bối cảnh"
                            aria-label="Xóa bối cảnh"
                          >
                            <span className="assistant-context-clear-x" aria-hidden="true">✕</span>
                            <span className="assistant-context-clear-text">Xóa bối cảnh</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    className={`assistant-knowledge-toggle ${state.knowledgeMode === "EXPANDED" ? "active" : ""}`}
                    onClick={() => {
                      const nextMode = state.knowledgeMode === "EXPANDED" ? "SOURCE_ONLY" : "EXPANDED";
                      controller.setKnowledgeMode(nextMode);
                      if (state.conversationId) {
                        void updateConversationPreference(state.conversationId, nextMode).catch(() => {});
                      }
                    }}
                    disabled={unresolved || !available}
                    aria-pressed={state.knowledgeMode === "EXPANDED"}
                    title={
                      state.knowledgeMode === "EXPANDED"
                        ? "Mở rộng kiến thức: Đang BẬT (bổ sung kiến thức mô hình)"
                        : "Mở rộng kiến thức: Đang TẮT (chỉ dùng tài liệu xác minh)"
                    }
                  >
                    <Sparkles aria-hidden="true" className="assistant-knowledge-toggle-icon" />
                    <span>Mở rộng kiến thức</span>
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={!transport || !available || !!contextError || unresolved || !state.draft.trim()}
                  aria-busy={sending}
                >
                  <Send aria-hidden="true" />
                  <span>Gửi</span>
                </button>
              </div>
            </div>
            <div className="assistant-composer-footer" id={helpId}>
              <span>Enter để gửi · Shift+Enter xuống dòng</span>
              <span className="assistant-char-counter">
                {state.draft.normalize("NFC").trim().length}/2000 ký tự
              </span>
            </div>
          </form>

          {variant === "page" && (
            <footer className="assistant-trust-footer">
              <div className="assistant-trust-item">
                <ShieldCheck aria-hidden="true" />
                <span>Thông tin thực tế cần có nguồn</span>
              </div>
              <span className="assistant-trust-sep" aria-hidden="true">
                •
              </span>
              <div className="assistant-trust-item">
                <FileText aria-hidden="true" />
                <span>Nêu rõ giới hạn khi thiếu dữ liệu</span>
              </div>
            </footer>
          )}
        </div>
      </div>

      <dialog
        ref={dialog}
        className="assistant-dialog"
        aria-labelledby={dialogTitleId}
        aria-describedby={dialogDescriptionId}
      >
        <h2 id={dialogTitleId}>Bỏ theo dõi lượt chưa xác nhận?</h2>
        <p id={dialogDescriptionId}>
          Bỏ theo dõi không có nghĩa server đã hủy. Yêu cầu cũ có thể vẫn đang xử lý; thao tác này không xóa dữ liệu
          server.
        </p>
        <div>
          <button
            type="button"
            autoFocus
            onClick={() => {
              dialog.current?.close();
            }}
          >
            Tiếp tục theo dõi
          </button>
          <button type="button" onClick={handleAbandonConfirm}>
            Bỏ theo dõi và tiếp tục
          </button>
        </div>
      </dialog>
    </div>
  );
}
