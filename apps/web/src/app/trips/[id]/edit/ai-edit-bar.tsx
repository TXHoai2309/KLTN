"use client";

import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Compass,
  CloudSun,
  Info,
  LoaderCircle,
  Map as MapIcon,
  MapPin,
  Navigation,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";

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

type StarterSuggestion = {
  title: string;
  prompt: string;
  icon: "check" | "clock" | "compass" | "weather" | "nav";
};

const DEFAULT_UPCOMING_STARTERS: readonly StarterSuggestion[] = [
  {
    title: "Đánh giá lịch trình",
    prompt: "Tôi đi thế này được không?",
    icon: "check",
  },
  {
    title: "Nghỉ ngơi buổi sáng",
    prompt: "Sáng đến nơi muốn nghỉ đến 9h mới đi thì chỉnh sao?",
    icon: "clock",
  },
  {
    title: "Đổi giờ khởi hành",
    prompt: "Đổi giờ xuất phát sang 07:30",
    icon: "nav",
  },
  {
    title: "Thời tiết & mặt trời",
    prompt: "Dự báo thời tiết và giờ mặt trời chuyến này?",
    icon: "weather",
  },
];

const NO_ORIGIN_UPCOMING_STARTERS: readonly StarterSuggestion[] = [
  {
    title: "Đánh giá lịch trình",
    prompt: "Tôi đi thế này được không?",
    icon: "check",
  },
  {
    title: "Nghỉ ngơi buổi sáng",
    prompt: "Sáng đến nơi muốn nghỉ đến 9h mới đi thì chỉnh sao?",
    icon: "clock",
  },
  {
    title: "Gợi ý đổi / thêm điểm",
    prompt: "Có chỗ nào hợp hơn để đổi hoặc thêm vào lịch không?",
    icon: "compass",
  },
  {
    title: "Thời tiết & mặt trời",
    prompt: "Dự báo thời tiết và giờ mặt trời chuyến này?",
    icon: "weather",
  },
];

const ONGOING_STARTERS: readonly StarterSuggestion[] = [
  {
    title: "Chặng tiếp theo",
    prompt: "Tiếp theo mình đi đâu, mấy giờ xuất phát?",
    icon: "nav",
  },
  {
    title: "Đánh giá phần còn lại",
    prompt: "Lịch hôm nay còn lại có hợp lý không?",
    icon: "check",
  },
  {
    title: "Nghỉ thêm dọc đường",
    prompt: "Đoàn nghỉ thêm 1 tiếng thì chỉnh sao?",
    icon: "clock",
  },
  {
    title: "Thời tiết chặng tới",
    prompt: "Thời tiết chặng tiếp theo thế nào?",
    icon: "weather",
  },
];

const UNAVAILABLE_STARTERS: readonly StarterSuggestion[] = [
  {
    title: "Thay thế điểm đã ẩn",
    prompt: "Điểm bị ẩn trong lịch nên đổi sang điểm nào?",
    icon: "compass",
  },
  {
    title: "Đánh giá lịch trình",
    prompt: "Tôi đi thế này được không?",
    icon: "check",
  },
  {
    title: "Nghỉ ngơi buổi sáng",
    prompt: "Sáng đến nơi muốn nghỉ đến 9h mới đi thì chỉnh sao?",
    icon: "clock",
  },
  {
    title: "Thời tiết chuyến đi",
    prompt: "Dự báo thời tiết các ngày trong chuyến này?",
    icon: "weather",
  },
];

function StarterIcon({ kind }: { kind: StarterSuggestion["icon"] }) {
  switch (kind) {
    case "check":
      return <CheckCircle2 size={17} aria-hidden="true" />;
    case "clock":
      return <Clock size={17} aria-hidden="true" />;
    case "compass":
      return <Compass size={17} aria-hidden="true" />;
    case "weather":
      return <CloudSun size={17} aria-hidden="true" />;
    case "nav":
      return <Navigation size={17} aria-hidden="true" />;
  }
}

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

function renderLabeledLine(text: string): ReactNode {
  const match = /^([^:\n]{2,64}:)(\s+)([\s\S]+)$/u.exec(text);
  if (!match) return text;
  return (
    <>
      <strong>{match[1]}</strong>
      {match[2]}
      {match[3]}
    </>
  );
}

/**
 * Splits verified plain prose safely into readable paragraphs and bullet lists
 * without parsing raw HTML or modifying factual values.
 */
function FormattedAdvisoryProse({ text }: { text: string }) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return null;

  // Insert visual breaks before known summary labels only when backend sent single-line joined prose.
  const structured = normalized.includes("\n")
    ? normalized
    : normalized.replace(
        /\s+(?=(?:Di chuyển nội bộ:|Kiểm tra ràng buộc|Lộ trình xuất phát\/trở về:|Lưu ý ánh sáng ban ngày:|Lưu ý thời tiết tham khảo:|Mình đã mô phỏng sẵn ))/gu,
        "\n\n",
      );

  const lines = structured.split("\n");
  const blocks: Array<{ kind: "p"; text: string } | { kind: "ul"; items: string[] }> = [];
  let listBuffer: string[] = [];

  const flushList = () => {
    if (listBuffer.length > 0) {
      blocks.push({ kind: "ul", items: listBuffer });
      listBuffer = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      continue;
    }
    const bulletMatch = /^(?:[-•*]|\d+[.)])\s+(.+)$/u.exec(line);
    if (bulletMatch) {
      listBuffer.push(bulletMatch[1]!);
    } else {
      flushList();
      blocks.push({ kind: "p", text: line });
    }
  }
  flushList();

  return (
    <div className={styles.aiProseBlocks}>
      {blocks.map((block, index) =>
        block.kind === "ul" ? (
          <ul key={`blk-${index}`} className={styles.aiProseList}>
            {block.items.map((item, itemIdx) => (
              <li key={`li-${index}-${itemIdx}`}>{renderLabeledLine(item)}</li>
            ))}
          </ul>
        ) : (
          <p key={`blk-${index}`} className={styles.aiTurnText}>
            {renderLabeledLine(block.text)}
          </p>
        ),
      )}
    </div>
  );
}

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
    return <FormattedAdvisoryProse text={advice} />;
  }
  return (
    <div className={styles.aiKnowledgeList}>
      {knowledgeParts.map((part, idx) => (
        <div key={`kp-${idx}`} className={styles.aiKnowledgePartWrap}>
          {part.mode === "EXPANDED" && (
            <span className={styles.aiExpandedBadge}>Kiến thức mở rộng</span>
          )}
          <FormattedAdvisoryProse text={part.text} />
        </div>
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
  tripHeadline?: string;
  showCollapseToggle?: boolean;
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
  tripHeadline,
  showCollapseToggle = true,
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
  const [quickPromptsOpen, setQuickPromptsOpen] = useState(false);

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

  // Auto-grow composer textarea smoothly up to ~120px like /assistant.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(120, Math.max(26, el.scrollHeight))}px`;
  }, [inputValue]);

  const starters = useMemo(() => {
    if (tripStatus === "ONGOING") return ONGOING_STARTERS;
    if (unavailableCount > 0) return UNAVAILABLE_STARTERS;
    if (!hasOrigin) return NO_ORIGIN_UPCOMING_STARTERS;
    return DEFAULT_UPCOMING_STARTERS;
  }, [tripStatus, unavailableCount, hasOrigin]);

  const lastMessage = messages.at(-1);
  const advisedAlreadyInMessages =
    state.kind === "ADVISED" &&
    lastMessage?.role === "assistant" &&
    lastMessage.text.trim() === state.advice.trim();

  function submitCurrentPrompt() {
    const trimmed = inputValue.trim();
    if (!trimmed || controlsDisabled) return;
    setQuickPromptsOpen(false);
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
        <div className={styles.aiHeaderMeta}>
          <span className={styles.aiSpeakerEmblem} aria-hidden="true">
            <Sparkles size={13} />
          </span>
          <span className={styles.aiHeaderName}>Trợ lý chuyến đi</span>
          <span className={styles.aiSubtitleBadge}>Hỏi / nhờ AI chỉnh lịch trình</span>
        </div>

        <div className={styles.aiHeaderActions}>
          {messages.length > 0 && onClearHistory && (
            <button
              type="button"
              className={styles.aiGhostBtn}
              disabled={controlsDisabled}
              onClick={onClearHistory}
            >
              <Trash2 size={14} aria-hidden="true" />
              <span>Xóa hội thoại tạm</span>
            </button>
          )}
          {!open && state.kind === "APPLIED" && state.canUndo && (
            <button
              type="button"
              className={styles.toolButtonCompact}
              disabled={controlsDisabled}
              onClick={onUndoAiStep}
            >
              <Undo2 size={14} aria-hidden="true" />
              Hoàn tác bước AI này
            </button>
          )}
          {showCollapseToggle && (
            <button
              type="button"
              className={styles.aiGhostBtn}
              aria-expanded={open}
              aria-controls="ai-edit-workspace-panel"
              disabled={disabled}
              onClick={onToggleOpen}
            >
              <span>{open ? "Thu gọn" : "Mở rộng"}</span>
              {open ? (
                <ChevronUp size={15} aria-hidden="true" />
              ) : (
                <ChevronDown size={15} aria-hidden="true" />
              )}
            </button>
          )}
        </div>
      </div>

      {open && (
        <div id="ai-edit-workspace-panel" className={styles.aiBarBody}>
          <div
            ref={threadRef}
            className={styles.aiThread}
            role="log"
            aria-label="Hội thoại Trợ lý chuyến đi"
            aria-live="polite"
          >
            <div className={styles.aiThreadInner}>
              {messages.length === 0 ? (
                <div className={styles.aiEmptyState}>
                  <div className={styles.aiEmptyCrest} aria-hidden="true">
                    <Sparkles size={24} />
                  </div>
                  <h2>{tripHeadline ?? "Trợ lý chuyến đi của bạn"}</h2>
                  <p className={styles.aiEmptyLead}>
                    Mình đọc trực tiếp <strong>bản nháp chỉnh sửa</strong> hiện tại. Bạn có thể hỏi đánh giá, xin phương án nghỉ ngơi, gợi ý đổi điểm, xem thời tiết hoặc ra lệnh chỉnh lịch.
                  </p>
                  <p className={styles.aiEmptyNote}>
                    Ghi nhớ tối đa 16 lượt gần nhất trong phiên này (làm mới trang sẽ xóa; thay đổi chỉ lưu chính thức khi bạn xác nhận).
                  </p>

                  {unavailableCount > 0 && (
                    <div className={styles.oqBAlert} role="note" style={{ textAlign: "left", maxWidth: 640 }}>
                      <p className={styles.oqBAlertText}>
                        Lịch hiện có {unavailableCount} điểm đến không còn khả dụng (đã bị ẩn). Hỏi Trợ lý để xem 3 điểm công khai cùng khu vực thay thế hoặc xóa nhanh.
                      </p>
                    </div>
                  )}

                  <div className={styles.aiStarterGrid} aria-label="Gợi ý câu hỏi theo ngữ cảnh chuyến đi">
                    {starters.map((item) => (
                      <button
                        key={item.prompt}
                        type="button"
                        className={styles.aiStarterCard}
                        disabled={controlsDisabled}
                        onClick={() => {
                          onInputChange(item.prompt);
                          onSubmitPrompt(item.prompt);
                        }}
                      >
                        <span className={styles.aiStarterIcon}>
                          <StarterIcon kind={item.icon} />
                        </span>
                        <span className={styles.aiStarterInfo}>
                          <span className={styles.aiStarterTitle}>{item.title}</span>
                          <span className={styles.aiStarterPrompt}>{item.prompt}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {unavailableCount > 0 && (
                    <div className={styles.oqBAlert} role="note">
                      <p className={styles.oqBAlertText}>
                        Lịch hiện có {unavailableCount} điểm đến không còn khả dụng (đã bị ẩn). Hỏi Trợ lý để xem 3 điểm công khai cùng khu vực thay thế hoặc xóa nhanh.
                      </p>
                    </div>
                  )}
                  {messages.map((entry, idx) => {
                    const isLatestAssistant =
                      entry.role === "assistant" && idx === messages.length - 1;
                    return (
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
                        {entry.role === "assistant" && (
                          <div className={styles.aiTurnHeader}>
                            <span className={styles.aiTurnRole}>
                              <span className={styles.aiSpeakerEmblem} aria-hidden="true">
                                <Sparkles size={11} />
                              </span>
                              <span>Trợ lý AI</span>
                            </span>
                            {entry.kind === "ADVISED" && (
                              <span className={styles.aiTurnBadge}>
                                {isLatestAssistant && advisedAlreadyInMessages
                                  ? "Tư vấn lịch trình (Planning guidance) · Không thay đổi bản nháp"
                                  : "Tư vấn · không đổi bản nháp"}
                              </span>
                            )}
                            {entry.kind === "APPLIED" && (
                              <span className={styles.aiTurnBadgeApplied}>Đã áp dụng</span>
                            )}
                            {entry.kind === "CLARIFYING" && (
                              <span className={styles.aiTurnBadge}>Cần làm rõ</span>
                            )}
                          </div>
                        )}
                        {entry.role === "user" ? (
                          <p className={styles.aiTurnUserText}>{entry.text}</p>
                        ) : (
                          <AdviceTextWithKnowledge
                            advice={entry.text}
                            knowledgeParts={entry.knowledgeParts}
                            citations={entry.citations}
                          />
                        )}
                      </div>
                    );
                  })}
                </>
              )}

              {state.kind === "LOADING" && (
                <div className={styles.aiLoadingBubble} role="status" aria-live="polite">
                  <div className={styles.aiTypingDots} aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                  <span className={styles.aiLoadingLabel}>
                    Đang phân tích bản nháp và kiểm tra phương án hợp lý…
                  </span>
                </div>
              )}

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
                <div className={styles.aiAdvisoryFollowup} role="status" aria-live="polite">
                  {!advisedAlreadyInMessages && (
                    <article className={`${styles.aiTurnAssistant} ${styles.aiTurnAdvised}`}>
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
                    </article>
                  )}

                  {state.suggestions && state.suggestions.length > 0 && (
                    <div className={styles.aiSuggestionList} aria-label="Gợi ý chỉnh sửa từ tư vấn">
                      <p className={styles.aiSuggestionHeading}>
                        Gợi ý chỉnh sửa từ tư vấn (bấm để thử ngay lên bản nháp):
                      </p>
                      <div className={styles.aiSuggestionCardsRow}>
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
                          className={styles.toolButtonCompact}
                          onClick={() => onJumpToTab("timeline")}
                        >
                          <CalendarDays size={14} aria-hidden="true" />
                          Xem Lịch trình
                        </button>
                        <button
                          type="button"
                          className={styles.toolButtonCompact}
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
                        className={styles.toolButtonCompact}
                        disabled={controlsDisabled}
                        onClick={onUndoAiStep}
                      >
                        <Undo2 size={14} aria-hidden="true" />
                        Hoàn tác bước AI này
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.aiIconCloseBtn}
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
                      className={styles.toolButtonCompact}
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
          </div>

          <div className={styles.aiBottomDock}>
            <div className={styles.aiBottomDockInner}>
              {messages.length > 0 && quickPromptsOpen && (
                <div className={styles.aiChipDrawer} aria-label="Gợi ý câu hỏi nhanh">
                  {starters.map((item) => (
                    <button
                      key={item.prompt}
                      type="button"
                      className={styles.aiQuickChip}
                      disabled={controlsDisabled}
                      onClick={() => {
                        setQuickPromptsOpen(false);
                        onInputChange(item.prompt);
                        onSubmitPrompt(item.prompt);
                      }}
                    >
                      {item.prompt}
                    </button>
                  ))}
                </div>
              )}

              <form className={styles.aiInputForm} onSubmit={handleFormSubmit}>
                <label htmlFor="ai-edit-prompt-input" className={styles.srOnly}>
                  Nhập yêu cầu chỉnh sửa hoặc hỏi tư vấn lịch trình bằng AI
                </label>
                <div
                  className={styles.aiComposerPill}
                  onPointerDown={(event) => {
                    if (event.target === event.currentTarget) {
                      event.preventDefault();
                      textareaRef.current?.focus();
                    }
                  }}
                >
                  <textarea
                    ref={textareaRef}
                    id="ai-edit-prompt-input"
                    rows={1}
                    maxLength={500}
                    disabled={controlsDisabled}
                    value={inputValue}
                    onChange={(event) => onInputChange(event.target.value)}
                    onKeyDown={handleTextareaKeyDown}
                    placeholder="Hỏi tư vấn, xin phương án nghỉ ngơi, thời tiết hoặc nhờ chỉnh lịch…"
                    className={styles.aiPromptTextarea}
                  />
                  <button
                    type="submit"
                    className={styles.aiSendPillBtn}
                    disabled={controlsDisabled || inputValue.trim().length === 0}
                  >
                    {isLoading ? (
                      <>
                        <LoaderCircle size={15} className={styles.spinIcon} aria-hidden="true" />
                        <span>Đang xử lý</span>
                      </>
                    ) : (
                      <>
                        <Send size={15} aria-hidden="true" />
                        <span>Gửi AI</span>
                      </>
                    )}
                  </button>
                </div>

                <div className={styles.aiComposerFooter}>
                  <span className={styles.aiComposerHint}>
                    Enter để gửi · Shift+Enter xuống dòng
                  </span>
                  <div className={styles.aiComposerFooterRight}>
                    {messages.length > 0 && (
                      <button
                        type="button"
                        className={styles.aiChipToggleBtn}
                        aria-expanded={quickPromptsOpen}
                        onClick={() => setQuickPromptsOpen((prev) => !prev)}
                      >
                        <Sparkles size={12} aria-hidden="true" />
                        {quickPromptsOpen ? "Ẩn gợi ý" : "Gợi ý câu hỏi"}
                      </button>
                    )}
                    <span className={styles.aiCharCounter}>
                      {inputValue.normalize("NFC").trim().length}/500 ký tự
                    </span>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
