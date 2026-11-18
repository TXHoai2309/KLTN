"use client";

import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Info,
  LoaderCircle,
  RefreshCw,
  Send,
  Sparkles,
  Undo2,
  X,
} from "lucide-react";
import type { FormEvent } from "react";

import type {
  EditClarification,
  EditResolution,
} from "@/modules/trip-edit/edit-clarification";
import styles from "./edit-trip.module.css";

const QUICK_AI_PROMPTS = [
  "Ngày 1 đi vậy có bị gấp quá không?",
  "Đổi giờ xuất phát sang 07:30",
  "Thêm 1 điểm buổi sáng và tự dời giờ các điểm sau",
  "Kéo dài lượt hiện tại thêm 30 phút",
] as const;

export type AiConversationEntry = {
  id: string;
  role: "user" | "assistant";
  kind?: "ADVISED" | "APPLIED" | "CLARIFYING";
  text: string;
};

export type AiBarUiState =
  | { kind: "IDLE" }
  | { kind: "LOADING"; prompt: string }
  | {
      kind: "CLARIFYING";
      prompt: string;
      clarification: EditClarification;
    }
  | {
      kind: "ADVISED";
      advice: string;
    }
  | {
      kind: "APPLIED";
      summary: string;
      canUndo: boolean;
    }
  | {
      kind: "ERROR";
      prompt: string;
      resolution?: EditResolution;
      message: string;
      canRetry: boolean;
    };

export type AiEditBarProps = {
  open: boolean;
  onToggleOpen: () => void;
  inputValue: string;
  onInputChange: (nextValue: string) => void;
  disabled: boolean;
  state: AiBarUiState;
  messages?: readonly AiConversationEntry[];
  onClearHistory?: () => void;
  onSubmitPrompt: (prompt: string, resolution?: EditResolution) => void;
  onRetry: () => void;
  onUndoAiStep: () => void;
  onDismissApplied: () => void;
};

export default function AiEditBar({
  open,
  onToggleOpen,
  inputValue,
  onInputChange,
  disabled,
  state,
  messages = [],
  onClearHistory,
  onSubmitPrompt,
  onRetry,
  onUndoAiStep,
  onDismissApplied,
}: AiEditBarProps) {
  const isLoading = state.kind === "LOADING";
  const controlsDisabled = disabled || isLoading;

  function handleFormSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed || controlsDisabled) return;
    onSubmitPrompt(trimmed);
  }

  return (
    <section className={styles.aiBarCard} aria-label="Trợ lý AI chỉnh sửa hành trình">
      <div className={styles.aiBarHeaderRow}>
        <button
          type="button"
          className={styles.aiToggleBtn}
          aria-expanded={open}
          aria-controls="ai-edit-workspace-panel"
          disabled={disabled}
          onClick={onToggleOpen}
        >
          <span className={styles.aiToggleTitle}>
            <Sparkles size={16} aria-hidden="true" />
            <span>Hỏi / nhờ AI chỉnh lịch trình</span>
          </span>
          {open ? (
            <ChevronUp size={16} aria-hidden="true" />
          ) : (
            <ChevronDown size={16} aria-hidden="true" />
          )}
        </button>

        {!open && state.kind === "APPLIED" && state.canUndo && (
          <button
            type="button"
            className={styles.toolButton}
            disabled={controlsDisabled}
            onClick={onUndoAiStep}
          >
            <Undo2 size={14} aria-hidden="true" />
            Hoàn tác bước AI này
          </button>
        )}
      </div>

      {open && (
        <div id="ai-edit-workspace-panel" className={styles.aiBarBody}>
          {messages.length > 0 && (
            <div className={styles.aiThreadWrap}>
              <div
                className={styles.aiThread}
                role="log"
                aria-label="Hội thoại AI trong phiên"
                aria-live="polite"
              >
                {messages.map((entry) => (
                  <div
                    key={entry.id}
                    className={
                      entry.role === "user"
                        ? styles.aiTurnUser
                        : entry.kind === "ADVISED"
                          ? `${styles.aiTurnAssistant} ${styles.aiTurnAdvised}`
                          : styles.aiTurnAssistant
                    }
                  >
                    <div className={styles.aiTurnHeader}>
                      <span className={styles.aiTurnRole}>
                        {entry.role === "user" ? "Bạn" : "Trợ lý AI"}
                      </span>
                      {entry.kind === "ADVISED" && (
                        <span className={styles.aiTurnBadge}>
                          Tư vấn · không đổi bản nháp
                        </span>
                      )}
                      {entry.kind === "APPLIED" && (
                        <span className={styles.aiTurnBadgeApplied}>Đã áp dụng</span>
                      )}
                    </div>
                    <p className={styles.aiTurnText}>{entry.text}</p>
                  </div>
                ))}
              </div>
              {onClearHistory && (
                <div className={styles.aiThreadFooter}>
                  <span className={styles.fixedNote}>
                    Ngữ cảnh hội thoại chỉ giữ tạm trong phiên này (làm mới trang sẽ xóa).
                  </span>
                  <button
                    type="button"
                    className={styles.toolButton}
                    disabled={controlsDisabled}
                    onClick={onClearHistory}
                  >
                    Xóa hội thoại tạm
                  </button>
                </div>
              )}
            </div>
          )}

          <div className={styles.aiChipRow} aria-label="Gợi ý lệnh nhanh">
            {QUICK_AI_PROMPTS.map((chip) => (
              <button
                key={chip}
                type="button"
                className={styles.aiQuickChip}
                disabled={controlsDisabled}
                onClick={() => {
                  onInputChange(chip);
                  onSubmitPrompt(chip);
                }}
              >
                {chip}
              </button>
            ))}
          </div>

          <form className={styles.aiInputForm} onSubmit={handleFormSubmit}>
            <label htmlFor="ai-edit-prompt-input" className={styles.srOnly}>
              Nhập yêu cầu chỉnh sửa hoặc hỏi tư vấn lịch trình bằng AI
            </label>
            <input
              id="ai-edit-prompt-input"
              type="text"
              maxLength={500}
              disabled={controlsDisabled}
              value={inputValue}
              onChange={(event) => onInputChange(event.target.value)}
              placeholder="Ví dụ: Đổi điểm đó sang 15:00, Đổi giờ xuất phát 07:30, hoặc Ngày 1 đi vậy gấp không?"
              className={styles.aiPromptInput}
            />
            <button
              type="submit"
              className={styles.primaryButton}
              disabled={controlsDisabled || inputValue.trim().length === 0}
            >
              {isLoading ? (
                <>
                  <LoaderCircle size={15} className={styles.spinIcon} aria-hidden="true" />
                  Đang xử lý…
                </>
              ) : (
                <>
                  <Send size={15} aria-hidden="true" />
                  Gửi AI
                </>
              )}
            </button>
          </form>

          <p className={styles.fixedNote}>
            AI luôn đọc bản nháp hiện tại, hiểu câu nối tiếp trong phiên và kiểm tra dữ liệu thực tế trước khi trả lời hoặc cập nhật bản nháp.
          </p>

          {state.kind === "CLARIFYING" && (
            <div className={styles.aiResultBox} role="status" aria-live="polite">
              <p className={styles.aiResultTitle}>{state.clarification.prompt}</p>
              {state.clarification.choices && state.clarification.choices.length > 0 && (
                <div className={styles.aiChoiceList}>
                  {state.clarification.choices.slice(0, 3).map((choice, index) => (
                    <button
                      key={`${choice.label}-${index}`}
                      type="button"
                      className={styles.aiChoiceBtn}
                      disabled={controlsDisabled}
                      onClick={() => onSubmitPrompt(state.prompt, choice.resolution)}
                    >
                      {choice.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {state.kind === "ADVISED" && (
            <div className={styles.aiResultBox} role="status" aria-live="polite">
              <div className={styles.aiTurnHeader}>
                <span className={styles.aiTurnRole}>
                  <Info size={14} aria-hidden="true" /> Tư vấn lịch trình (Planning guidance)
                </span>
                <span className={styles.aiTurnBadge}>Không thay đổi bản nháp</span>
              </div>
              <p className={styles.aiTurnText}>{state.advice}</p>
            </div>
          )}

          {state.kind === "APPLIED" && (
            <div className={styles.aiAppliedBanner} role="status" aria-live="polite">
              <span>{state.summary}</span>
              <div className={styles.quickActionRow}>
                {state.canUndo && (
                  <button
                    type="button"
                    className={styles.toolButton}
                    disabled={controlsDisabled}
                    onClick={onUndoAiStep}
                  >
                    <Undo2 size={14} aria-hidden="true" />
                    Hoàn tác bước AI này
                  </button>
                )}
                <button
                  type="button"
                  className={styles.toolButton}
                  aria-label="Đóng thông báo bước AI"
                  onClick={onDismissApplied}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </div>
            </div>
          )}

          {state.kind === "ERROR" && (
            <div className={styles.aiErrorBanner} role="alert">
              <div className={styles.aiErrorText}>
                <AlertTriangle size={15} aria-hidden="true" />
                <span>{state.message}</span>
              </div>
              {state.canRetry && (
                <button
                  type="button"
                  className={styles.toolButton}
                  disabled={controlsDisabled}
                  onClick={onRetry}
                >
                  <RefreshCw size={14} aria-hidden="true" />
                  Thử lại
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
