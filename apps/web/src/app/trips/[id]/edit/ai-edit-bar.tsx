"use client";

import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Info,
  LoaderCircle,
  Map as MapIcon,
  MapPin,
  Navigation,
  RefreshCw,
  Send,
  Sparkles,
  Undo2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, type FormEvent, type KeyboardEvent } from "react";

import ManualLocationPicker from "@/components/in-trip/manual-location-picker";
import { getLocationFlowMessage, type LocationFlowState } from "@/modules/in-trip/location-flow";
import type { MapCoordinate } from "@/modules/map/map-model";

import type {
  EditClarification,
  EditResolution,
} from "@/modules/trip-edit/edit-clarification";
import type {
  AdvisoryCitation,
  AdvisoryKnowledgePart,
} from "@/modules/trip-edit/ai-workspace-plan";
import type { AdviceSuggestionCard } from "@/modules/trip-edit/saved-trip-advisory";
import type { TripStatus } from "@/modules/trip-read/trip-status";
import styles from "./edit-trip.module.css";

const DEFAULT_UPCOMING_CHIPS = [
  "Tôi đi thế này được không?",
  "Sáng đến nơi muốn nghỉ đến 9h mới đi thì chỉnh sao?",
  "Đổi giờ xuất phát sang 07:30",
  "Dự báo thời tiết và giờ mặt trời chuyến này?",
] as const;

const ONGOING_CHIPS = [
  "Tiếp theo mình đi đâu, mấy giờ xuất phát?",
  "Lịch hôm nay còn lại có hợp lý không?",
  "Đoàn nghỉ thêm 1 tiếng thì chỉnh sao?",
  "Thời tiết chặng tiếp theo thế nào?",
] as const;

const UNAVAILABLE_CHIPS = [
  "Điểm bị ẩn trong lịch nên đổi sang điểm nào?",
  "Tôi đi thế này được không?",
  "Sáng đến nơi muốn nghỉ đến 9h mới đi thì chỉnh sao?",
  "Dự báo thời tiết các ngày trong chuyến này?",
] as const;

export type AiConversationEntry = {
  id: string;
  role: "user" | "assistant";
  kind?: "ADVISED" | "APPLIED" | "CLARIFYING";
  text: string;
  knowledgeParts?: readonly AdvisoryKnowledgePart[];
  citations?: readonly AdvisoryCitation[];
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
      suggestions?: readonly AdviceSuggestionCard[];
      knowledgeParts?: readonly AdvisoryKnowledgePart[];
      citations?: readonly AdvisoryCitation[];
    }
  | {
      kind: "NEEDS_LOCATION";
      prompt: string;
      pendingMessage: string;
      locationFlow: LocationFlowState;
      manualPickerOpen: boolean;
      manualCoords: MapCoordinate | null;
      coverageError: string | null;
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

function AdviceTextWithKnowledge({
  advice,
  knowledgeParts,
  citations,
}: {
  advice: string;
  knowledgeParts?: readonly AdvisoryKnowledgePart[];
  citations?: readonly AdvisoryCitation[];
}) {
  if (!knowledgeParts || knowledgeParts.length === 0) {
    return <p className={styles.aiTurnText}>{advice}</p>;
  }
  return (
    <div className={styles.aiKnowledgeList}>
      {knowledgeParts.map((part, idx) => (
        <p key={`kp-${idx}`} className={styles.aiKnowledgePart}>
          {part.mode === "EXPANDED" && (
            <span className={styles.aiExpandedBadge}>Kiến thức mở rộng</span>
          )}
          <span>{part.text}</span>
        </p>
      ))}
      {citations && citations.length > 0 && (
        <div className={styles.aiCitationBox}>
          <strong>Nguồn tham khảo đã duyệt:</strong>
          <ul className={styles.aiCitationList}>
            {citations.map((cit) => {
              const loc = cit.locators
                .map((l) =>
                  l.pageNumber != null
                    ? `Trang ${l.pageNumber}`
                    : l.section
                      ? `Mục ${l.section}`
                      : "",
                )
                .filter(Boolean)
                .join(", ");
              return (
                <li key={cit.id}>
                  {cit.sourceUrl ? (
                    <a
                      href={cit.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.aiCitationLink}
                    >
                      {cit.title}
                    </a>
                  ) : (
                    <span>{cit.title}</span>
                  )}
                  {loc ? ` (${loc})` : ""}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export type AiEditBarProps = {
  open: boolean;
  onToggleOpen: () => void;
  inputValue: string;
  onInputChange: (nextValue: string) => void;
  disabled: boolean;
  state: AiBarUiState;
  messages?: readonly AiConversationEntry[];
  tripStatus?: TripStatus;
  hasOrigin?: boolean;
  unavailableCount?: number;
  autoFocus?: boolean;
  onClearHistory?: () => void;
  onSubmitPrompt: (prompt: string, resolution?: EditResolution) => void;
  onApplySuggestion?: (suggestion: AdviceSuggestionCard) => void;
  onRequestGps?: () => void;
  onOpenManualLocation?: () => void;
  onSelectManualCoords?: (coords: MapCoordinate) => void;
  onCancelPendingLocation?: () => void;
  onRetry: () => void;
  onUndoAiStep: () => void;
  onDismissApplied: () => void;
  onJumpToTab?: (tab: "timeline" | "map") => void;
};

function suggestionStatusLabel(suggestion: AdviceSuggestionCard): {
  label: string;
  isPass: boolean;
} {
  const { groups, canConfirm } = suggestion.validation;
  const hasViolation = [
    ...groups.openingHours.findings,
    ...groups.minimumDuration.findings,
    ...groups.travelTime.findings,
    ...groups.scheduleConflict.findings,
  ].some((finding) => finding.status === "VIOLATION");
  if (hasViolation) return { label: "Cần rà lại trước khi lưu", isPass: false };
  if (suggestion.saveEligibility === "NEEDS_UNCHECKED_ACK") {
    return { label: "Cần xác nhận", isPass: false };
  }
  if (!canConfirm) return { label: "Cần rà lại trước khi lưu", isPass: false };
  return { label: "Hợp lệ · PASS", isPass: true };
}

export default function AiEditBar({
  open,
  onToggleOpen,
  inputValue,
  onInputChange,
  disabled,
  state,
  messages = [],
  tripStatus = "UPCOMING",
  hasOrigin = false,
  unavailableCount = 0,
  autoFocus = false,
  onClearHistory,
  onSubmitPrompt,
  onApplySuggestion,
  onRequestGps,
  onOpenManualLocation,
  onSelectManualCoords,
  onCancelPendingLocation,
  onRetry,
  onUndoAiStep,
  onDismissApplied,
  onJumpToTab,
}: AiEditBarProps) {
  const isLoading = state.kind === "LOADING";
  const controlsDisabled = disabled || isLoading;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!autoFocus || !open) return;
    const frame = window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [autoFocus, open]);

  useEffect(() => {
    if (!threadRef.current) return;
    threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [messages.length, state.kind]);

  const quickPrompts = useMemo(() => {
    if (tripStatus === "ONGOING") return ONGOING_CHIPS;
    if (unavailableCount > 0) return UNAVAILABLE_CHIPS;
    if (!hasOrigin) {
      return [
        "Tôi đi thế này được không?",
        "Sáng đến nơi muốn nghỉ đến 9h mới đi thì chỉnh sao?",
        "Có chỗ nào hợp hơn để đổi hoặc thêm vào lịch không?",
        "Dự báo thời tiết và giờ mặt trời chuyến này?",
      ] as const;
    }
    return DEFAULT_UPCOMING_CHIPS;
  }, [tripStatus, unavailableCount, hasOrigin]);

  function submitCurrentPrompt() {
    const trimmed = inputValue.trim();
    if (!trimmed || controlsDisabled) return;
    onSubmitPrompt(trimmed);
  }

  function handleFormSubmit(event: FormEvent) {
    event.preventDefault();
    submitCurrentPrompt();
  }

  function handleTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submitCurrentPrompt();
    }
  }

  return (
    <section className={styles.aiBarCard} aria-label="Trợ lý chuyến đi">
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
            <span>Trợ lý chuyến đi</span>
            <span className={styles.aiSubtitleBadge}>Hỏi / nhờ AI chỉnh lịch trình</span>
          </span>
          <span className={styles.aiToggleActionLabel}>
            <span>{open ? "Thu gọn" : "Mở rộng"}</span>
            {open ? (
              <ChevronUp size={16} aria-hidden="true" />
            ) : (
              <ChevronDown size={16} aria-hidden="true" />
            )}
          </span>
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
          <div className={styles.aiThreadWrap}>
            <div
              ref={threadRef}
              className={styles.aiThread}
              role="log"
              aria-label="Hội thoại Trợ lý chuyến đi"
              aria-live="polite"
            >
              {messages.length === 0 ? (
                <div className={styles.aiWelcomeCard}>
                  <p className={styles.aiTurnText}>
                    Mình đọc trực tiếp <strong>bản nháp chỉnh sửa</strong> hiện tại (bao gồm mọi thao tác bạn vừa sửa tay). Bạn có thể hỏi đánh giá độ hợp lý, xin phương án nghỉ ngơi/đi trễ, nhờ gợi ý đổi điểm, hỏi thông tin địa phương, xem dự báo thời tiết hoặc ra lệnh chỉnh lịch trực tiếp.
                  </p>
                </div>
              ) : (
                messages.map((entry) => (
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
                      {entry.kind === "CLARIFYING" && (
                        <span className={styles.aiTurnBadge}>Cần làm rõ</span>
                      )}
                    </div>
                    <AdviceTextWithKnowledge
                      advice={entry.text}
                      knowledgeParts={entry.knowledgeParts}
                      citations={entry.citations}
                    />
                  </div>
                ))
              )}
            </div>
            {messages.length > 0 && onClearHistory && (
              <div className={styles.aiThreadFooter}>
                <span className={styles.fixedNote}>
                  Ghi nhớ tối đa 16 lượt gần nhất trong phiên này (làm mới trang sẽ xóa).
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

          <div className={styles.aiChipRow} aria-label="Gợi ý câu hỏi theo ngữ cảnh chuyến đi">
            {unavailableCount > 0 && (
              <div className={styles.oqBAlert} role="note">
                <p className={styles.oqBAlertText}>
                  Lịch hiện có {unavailableCount} điểm đến không còn khả dụng (đã bị ẩn). Hỏi Trợ lý để xem 3 điểm công khai cùng khu vực thay thế hoặc xóa nhanh.
                </p>
              </div>
            )}
            {quickPrompts.map((chip) => (
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
            <textarea
              ref={textareaRef}
              id="ai-edit-prompt-input"
              rows={2}
              maxLength={500}
              disabled={controlsDisabled}
              value={inputValue}
              onChange={(event) => onInputChange(event.target.value)}
              onKeyDown={handleTextareaKeyDown}
              placeholder="Hỏi tư vấn, xin phương án nghỉ ngơi, hỏi thời tiết/địa điểm, hoặc lệnh chỉnh lịch (Enter để gửi, Shift+Enter xuống dòng)…"
              className={styles.aiPromptTextarea}
            />
            <div className={styles.aiInputActions}>
              <span className={styles.fixedNote}>
                Enter gửi · Shift+Enter xuống dòng
              </span>
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
            </div>
          </form>

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
              <AdviceTextWithKnowledge
                advice={state.advice}
                knowledgeParts={state.knowledgeParts}
                citations={state.citations}
              />
              {state.suggestions && state.suggestions.length > 0 && (
                <div className={styles.aiSuggestionList} aria-label="Gợi ý chỉnh sửa từ tư vấn">
                  <p className={styles.aiSuggestionHeading}>Gợi ý chỉnh sửa từ tư vấn (bấm để thử ngay lên bản nháp):</p>
                  {state.suggestions.slice(0, 4).map((suggestion) => {
                    const badge = suggestionStatusLabel(suggestion);
                    return (
                      <article key={suggestion.id} className={styles.aiSuggestionCard}>
                        <div className={styles.aiSuggestionHeader}>
                          <h4 className={styles.aiSuggestionTitle}>{suggestion.title}</h4>
                          <span className={badge.isPass ? styles.aiSuggestionStatusPass : styles.aiSuggestionStatusWarn}>
                            {badge.isPass && <CheckCircle2 size={12} aria-hidden="true" />}
                            {badge.label}
                          </span>
                        </div>
                        <p className={styles.aiSuggestionSummary}>{suggestion.summary}</p>
                        {suggestion.diffSummaryLines.length > 0 && (
                          <ul className={styles.aiSuggestionDiffList}>
                            {suggestion.diffSummaryLines.map((line, index) => (
                              <li key={`${suggestion.id}-diff-${index}`}>{line}</li>
                            ))}
                          </ul>
                        )}
                        {onApplySuggestion && (
                          <button
                            type="button"
                            className={styles.aiSuggestionApplyBtn}
                            disabled={controlsDisabled}
                            onClick={() => onApplySuggestion(suggestion)}
                          >
                            <Sparkles size={14} aria-hidden="true" />
                            Áp dụng phương án này vào bản nháp
                          </button>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {state.kind === "NEEDS_LOCATION" && (
            <div className={styles.aiLocationBox} role="status" aria-live="polite">
              <div className={styles.aiTurnHeader}>
                <span className={styles.aiTurnRole}>
                  <Navigation size={14} aria-hidden="true" /> Cần vị trí hiện tại (ONGOING)
                </span>
                <span className={styles.aiTurnBadge}>Chỉ dùng 1 lần trong phiên</span>
              </div>
              <p className={styles.aiTurnText}>{state.prompt}</p>
              <p className={styles.fixedNote}>
                Câu hỏi đang chờ: <strong>{state.pendingMessage}</strong>
              </p>
              <p className={styles.fixedNote}>
                {state.coverageError ?? getLocationFlowMessage(state.locationFlow)}
              </p>
              <div className={styles.aiLocationActions}>
                <button
                  type="button"
                  className={styles.aiLocationPrimaryBtn}
                  disabled={controlsDisabled || state.locationFlow.status === "requesting"}
                  onClick={onRequestGps}
                >
                  {state.locationFlow.status === "requesting" ? (
                    <>
                      <LoaderCircle size={14} className={styles.spinIcon} aria-hidden="true" />
                      Đang lấy GPS…
                    </>
                  ) : (
                    <>
                      <Navigation size={14} aria-hidden="true" />
                      Dùng vị trí GPS hiện tại
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className={styles.aiLocationSecondaryBtn}
                  disabled={controlsDisabled}
                  onClick={onOpenManualLocation}
                >
                  <MapPin size={14} aria-hidden="true" />
                  Chọn vị trí thủ công trên bản đồ
                </button>
                {onCancelPendingLocation && (
                  <button
                    type="button"
                    className={styles.toolButton}
                    disabled={controlsDisabled}
                    onClick={onCancelPendingLocation}
                  >
                    <X size={14} aria-hidden="true" />
                    Hủy
                  </button>
                )}
              </div>
              {state.manualPickerOpen && onSelectManualCoords && (
                <ManualLocationPicker
                  coordinates={state.manualCoords}
                  onChange={onSelectManualCoords}
                />
              )}
            </div>
          )}

          {state.kind === "APPLIED" && (
            <div className={styles.aiAppliedBanner} role="status" aria-live="polite">
              <span>{state.summary}</span>
              <div className={styles.quickActionRow}>
                {onJumpToTab && (
                  <>
                    <button
                      type="button"
                      className={styles.toolButton}
                      onClick={() => onJumpToTab("timeline")}
                    >
                      <CalendarDays size={14} aria-hidden="true" />
                      Xem Lịch trình
                    </button>
                    <button
                      type="button"
                      className={styles.toolButton}
                      onClick={() => onJumpToTab("map")}
                    >
                      <MapIcon size={14} aria-hidden="true" />
                      Xem Bản đồ
                    </button>
                  </>
                )}
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
