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
  MoreHorizontal,
  Navigation,
  RefreshCw,
  Send,
  Sparkles,
  Square,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";

import ManualLocationPicker from "@/components/in-trip/manual-location-picker";
import { cleanTravelerDisplay, cleanTravelerProse } from "@/lib/traveler-display-clean";
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
  kind?: "ADVISED" | "APPLIED" | "CLARIFYING" | "INTERRUPTED" | "STOPPED";
  text: string;
  steps?: readonly string[];
  correctionNote?: string;
  statusNotice?: string;
  retryPrompt?: string;
  retryResolution?: EditResolution;
  knowledgeParts?: readonly AdvisoryKnowledgePart[];
  citations?: readonly AdvisoryCitation[];
};

/** A Validator finding phrased for the traveler, with a ready-made fix request. */
export type TripIssueHint = {
  key: string;
  label: string;
  prompt: string;
};

export type AiBarUiState =
  | { kind: "IDLE" }
  | { kind: "LOADING"; prompt: string }
  | {
      kind: "STREAMING";
      prompt: string;
      statusLabel: string;
      steps: readonly string[];
      text: string;
      correctionNote?: string;
    }
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
      correctionNote?: string;
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
      correctionNote?: string;
    }
  | {
      kind: "ERROR";
      prompt: string;
      resolution?: EditResolution;
      message: string;
      canRetry: boolean;
    };

function formatStepsSummary(steps: readonly string[]): string {
  if (steps.length === 0) return "";
  const lowerFirst = (label: string) =>
    label.length > 0 ? `${label[0]!.toLowerCase()}${label.slice(1)}` : label;
  return `Đã ${steps.map(lowerFirst).join(" · ")}`;
}

function StepsSummaryDetails({ steps }: { steps: readonly string[] }) {
  if (steps.length === 0) return null;
  return (
    <details className={styles.aiStepsDetails}>
      <summary className={styles.aiStepsSummary}>{formatStepsSummary(steps)}</summary>
      <ul className={styles.aiStepsDetailList}>
        {steps.map((step, idx) => (
          <li key={`step-${idx}`}>{step}</li>
        ))}
      </ul>
    </details>
  );
}

function CorrectionNoteLine({ note }: { note: string }) {
  return (
    <p className={styles.aiCorrectionNote} role="note">
      <AlertTriangle size={14} aria-hidden="true" />
      <span>{cleanTravelerProse(note) || note}</span>
    </p>
  );
}

function renderInlineBold(text: string): ReactNode {
  if (!text.includes("**")) return text;
  const parts = text.split(/(\*\*[^*\n]+\*\*)/gu);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={`b-${idx}`}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function renderLabeledLine(text: string): ReactNode {
  const match = /^([^:*\n]{2,64}:)(\s+)([\s\S]+)$/u.exec(text);
  if (!match) return renderInlineBold(text);
  return (
    <>
      <strong>{match[1]}</strong>
      {match[2]}
      {renderInlineBold(match[3]!)}
    </>
  );
}

/**
 * Splits verified plain prose safely into readable paragraphs and bullet lists
 * without parsing raw HTML or modifying factual values.
 */
function FormattedAdvisoryProse({ text }: { text: string }) {
  const normalized = (cleanTravelerProse(text) || text).replace(/\r\n/g, "\n").trim();
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
  /** Findings of the latest check; null while the first check is still running. */
  issues?: readonly TripIssueHint[] | null;
  autoFocus?: boolean;
  tripHeadline?: string;
  showCollapseToggle?: boolean;
  hasSharedLocation?: boolean;
  onRequestUpdateLocation?: () => void;
  onClearHistory?: () => void;
  onSubmitPrompt: (prompt: string, resolution?: EditResolution) => void;
  onStopStream?: () => void;
  onApplySuggestion?: (suggestion: AdviceSuggestionCard) => void;
  onOpenCanvas?: () => void;
  onRequestGps?: () => void;
  onOpenManualLocation?: () => void;
  onCloseManualLocation?: () => void;
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
  return { label: "Hợp lệ · Đạt kiểm tra", isPass: true };
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
  issues = null,
  autoFocus = false,
  tripHeadline,
  showCollapseToggle = false,
  hasSharedLocation = false,
  onRequestUpdateLocation,
  onClearHistory,
  onSubmitPrompt,
  onStopStream,
  onApplySuggestion,
  onOpenCanvas,
  onRequestGps,
  onOpenManualLocation,
  onCloseManualLocation,
  onSelectManualCoords,
  onCancelPendingLocation,
  onRetry,
  onUndoAiStep,
  onDismissApplied,
  onJumpToTab,
}: AiEditBarProps) {
  const MAX_PROMPT_CHARS = 500;
  const CHAR_COUNTER_THRESHOLD = 400;
  const isStreaming = state.kind === "STREAMING";
  const isLoading = state.kind === "LOADING";
  const isBusy = isLoading || isStreaming;
  const controlsDisabled = disabled || isBusy;
  const streamingTextLength = isStreaming ? state.text.length : 0;
  const isManualSheetOpen =
    state.kind === "NEEDS_LOCATION" && state.manualPickerOpen && Boolean(onSelectManualCoords);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const locationBoxRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const manualApplyRef = useRef<(() => void) | null>(null);
  const swipeStartYRef = useRef<number | null>(null);
  const sheetTitleId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const [manualDraftCoords, setManualDraftCoords] = useState<MapCoordinate | null>(() =>
    state.kind === "NEEDS_LOCATION" ? state.manualCoords : null,
  );
  const charCount = inputValue.normalize("NFC").trim().length;
  const showCharCounter = charCount > CHAR_COUNTER_THRESHOLD;

  const stateManualCoords = state.kind === "NEEDS_LOCATION" ? state.manualCoords : null;
  const stateManualLat = stateManualCoords?.latitude ?? null;
  const stateManualLng = stateManualCoords?.longitude ?? null;
  const stateManualOpen = state.kind === "NEEDS_LOCATION" && state.manualPickerOpen;

  useEffect(() => {
    if (stateManualLat !== null && stateManualLng !== null) {
      setManualDraftCoords({ latitude: stateManualLat, longitude: stateManualLng });
    } else if (!stateManualOpen) {
      setManualDraftCoords(null);
    }
  }, [stateManualOpen, stateManualLat, stateManualLng]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!isManualSheetOpen) return;
    const closeSheet = onCloseManualLocation ?? onCancelPendingLocation;
    if (!closeSheet) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") closeSheet();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isManualSheetOpen, onCloseManualLocation, onCancelPendingLocation]);

  useEffect(() => {
    if (!autoFocus || !open) return;
    const frame = window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [autoFocus, open]);

  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    const frame = window.requestAnimationFrame(() => {
      if (state.kind === "NEEDS_LOCATION" && locationBoxRef.current?.scrollIntoView) {
        locationBoxRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
      } else {
        el.scrollTop = el.scrollHeight;
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages.length, state.kind, streamingTextLength]);

  // Single-line 44px composer auto-growing up to 4 lines (§3.6).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    if (!inputValue) {
      el.style.height = "";
      return;
    }
    el.style.height = "auto";
    el.style.height = `${Math.min(92, Math.max(22, el.scrollHeight))}px`;
  }, [inputValue]);

  const starters = useMemo(() => {
    if (tripStatus === "ONGOING") return ONGOING_STARTERS;
    if (unavailableCount > 0) return UNAVAILABLE_STARTERS;
    if (!hasOrigin) return NO_ORIGIN_UPCOMING_STARTERS;
    return DEFAULT_UPCOMING_STARTERS;
  }, [tripStatus, unavailableCount, hasOrigin]);

  // Concrete fixes for this trip first, then generic starters.
  const quickChips = useMemo(
    () => [...(issues ?? []).map((issue) => issue.prompt), ...starters.map((item) => item.prompt)].slice(0, 3),
    [issues, starters],
  );

  const lastMessage = messages.at(-1);
  const advisedAlreadyInMessages =
    state.kind === "ADVISED" &&
    lastMessage?.role === "assistant" &&
    lastMessage.text.trim() === state.advice.trim();
  const clarifyingAlreadyInMessages =
    state.kind === "CLARIFYING" &&
    lastMessage?.role === "assistant" &&
    lastMessage.text.trim() === state.clarification.prompt.trim();
  const latestSharedLocationEntryId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const entry = messages[i];
      if (
        entry?.role === "assistant" &&
        /theo vị trí bạn (?:chia sẻ lúc \d{2}:\d{2}|vừa chia sẻ)/iu.test(entry.text)
      ) {
        return entry.id;
      }
    }
    return null;
  }, [messages]);

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
      <p className={styles.srOnly}>Trợ lý chuyến đi — Hỏi / nhờ AI chỉnh lịch trình</p>
      {(!open || showCollapseToggle) && (
        <div className={styles.aiBarHeaderRow}>
          <div className={styles.aiHeaderMeta}>
            <span className={styles.aiSpeakerEmblem} aria-hidden="true">
              <Sparkles size={13} />
            </span>
            <span className={styles.aiHeaderName}>Trợ lý chuyến đi</span>
          </div>
          <div className={styles.aiHeaderActions}>
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
      )}

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
                    Cứ hỏi bằng lời bình thường như nói với hướng dẫn viên. Mình sẽ xem lịch của bạn, kiểm tra giờ mở cửa và đường đi, rồi đề xuất cách sửa.
                  </p>
                  <p className={styles.aiEmptyNote}>
                    Lịch chỉ thay đổi chính thức khi bạn bấm <strong>Lưu thay đổi</strong>.
                  </p>

                  {issues !== null &&
                    (issues.length > 0 ? (
                      <div className={styles.aiIssueCard} role="note">
                        <p className={styles.aiIssueTitle}>
                          <AlertTriangle size={15} aria-hidden="true" />
                          Lịch đã lưu có {issues.length} điểm cần xem lại
                        </p>
                        <p className={styles.aiIssueHint}>
                          Mỗi lần mở trang, hệ thống kiểm tra lại giờ mở cửa và đường đi theo dữ liệu mới nhất.
                        </p>
                        <ul className={styles.aiIssueList}>
                          {issues.map((issue) => (
                            <li key={issue.key} className={styles.aiIssueItem}>
                              <span>{cleanTravelerDisplay(issue.label) || issue.label}</span>
                              <button
                                type="button"
                                className={styles.aiIssueFixBtn}
                                disabled={controlsDisabled}
                                onClick={() => onSubmitPrompt(cleanTravelerDisplay(issue.prompt) || issue.prompt)}
                              >
                                <Sparkles size={13} aria-hidden="true" />
                                Sửa giúp tôi
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p className={styles.aiIssueOk} role="note">
                        <CheckCircle2 size={15} aria-hidden="true" />
                        Lịch của bạn hiện ổn: không có lỗi giờ mở cửa, thời lượng hay di chuyển.
                      </p>
                    ))}

                  <p className={styles.aiStarterHeading}>Hoặc bắt đầu bằng một câu hỏi:</p>

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
                  {messages.map((entry) => {
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
                            {entry.kind === "APPLIED" && (
                              <span className={styles.aiTurnBadgeApplied}>Đã áp dụng</span>
                            )}
                            {entry.kind === "CLARIFYING" && (
                              <span className={styles.aiTurnBadge}>Cần làm rõ</span>
                            )}
                          </div>
                        )}
                        {entry.role === "assistant" && entry.steps && entry.steps.length > 0 && (
                          <StepsSummaryDetails steps={entry.steps} />
                        )}
                        {entry.role === "user" ? (
                          <p className={styles.aiTurnUserText}>{entry.text}</p>
                        ) : (
                          entry.text.trim().length > 0 && (
                            <AdviceTextWithKnowledge
                              advice={entry.text}
                              knowledgeParts={entry.knowledgeParts}
                              citations={entry.citations}
                            />
                          )
                        )}
                        {entry.role === "assistant" && entry.correctionNote && (
                          <CorrectionNoteLine note={entry.correctionNote} />
                        )}
                        {entry.role === "assistant" && entry.statusNotice && (
                          <div className={styles.aiInterruptedRow} role="status">
                            <span className={styles.aiInterruptedText}>
                              {cleanTravelerProse(entry.statusNotice) || entry.statusNotice}
                            </span>
                            {entry.retryPrompt && (
                              <button
                                type="button"
                                className={styles.aiRetryActionBtn}
                                disabled={controlsDisabled}
                                onClick={() => onSubmitPrompt(entry.retryPrompt!, entry.retryResolution)}
                              >
                                <RefreshCw size={14} aria-hidden="true" />
                                Thử lại
                              </button>
                            )}
                          </div>
                        )}
                        {entry.role === "assistant" &&
                          entry.id === latestSharedLocationEntryId &&
                          hasSharedLocation &&
                          onRequestUpdateLocation &&
                          !isBusy &&
                          state.kind !== "NEEDS_LOCATION" && (
                            <div className={styles.aiTurnLocationActions}>
                              <button
                                type="button"
                                className={styles.aiUpdateLocationBtn}
                                disabled={controlsDisabled}
                                onClick={onRequestUpdateLocation}
                              >
                                <Navigation size={12} aria-hidden="true" />
                                Cập nhật vị trí
                              </button>
                            </div>
                          )}
                      </div>
                    );
                  })}
                </>
              )}

              {state.kind === "STREAMING" && (
                <article className={styles.aiTurnAssistant} role="status" aria-live="polite">
                  <div className={styles.aiTurnHeader}>
                    <span className={styles.aiTurnRole}>
                      <span className={styles.aiSpeakerEmblem} aria-hidden="true">
                        <Sparkles size={11} />
                      </span>
                      <span>Trợ lý AI</span>
                    </span>
                  </div>
                  {state.text.trim().length === 0 ? (
                    <div className={styles.aiStreamProgress}>
                      {state.steps.length > 0 && (
                        <ul className={styles.aiStreamStepList}>
                          {state.steps.map((step, idx) => (
                            <li key={`stream-step-${idx}`}>{step}</li>
                          ))}
                        </ul>
                      )}
                      <div className={styles.aiStreamCurrent}>
                        <LoaderCircle size={15} className={styles.spinIcon} aria-hidden="true" />
                        <span>{state.statusLabel}</span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <StepsSummaryDetails steps={state.steps} />
                      <FormattedAdvisoryProse text={state.text} />
                      {state.correctionNote && <CorrectionNoteLine note={state.correctionNote} />}
                    </>
                  )}
                </article>
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

              {state.kind === "CLARIFYING" &&
                (!clarifyingAlreadyInMessages ||
                  (state.clarification.choices && state.clarification.choices.length > 0)) && (
                  <div className={styles.aiResultBox} role="status" aria-live="polite">
                    {!clarifyingAlreadyInMessages && (
                      <p className={styles.aiResultTitle}>
                        {cleanTravelerProse(state.clarification.prompt) || state.clarification.prompt}
                      </p>
                    )}
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
                            {cleanTravelerDisplay(choice.label) || choice.label}
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
                          <Info size={14} aria-hidden="true" /> Trợ lý AI
                        </span>
                      </div>
                      <AdviceTextWithKnowledge
                        advice={state.advice}
                        knowledgeParts={state.knowledgeParts}
                        citations={state.citations}
                      />
                      {state.correctionNote && <CorrectionNoteLine note={state.correctionNote} />}
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
                                <h4 className={styles.aiSuggestionTitle}>
                                  {cleanTravelerProse(suggestion.title) || suggestion.title}
                                </h4>
                                <span className={badge.isPass ? styles.aiSuggestionStatusPass : styles.aiSuggestionStatusWarn}>
                                  {badge.isPass && <CheckCircle2 size={12} aria-hidden="true" />}
                                  {badge.label}
                                </span>
                              </div>
                              <p className={styles.aiSuggestionSummary}>
                                {cleanTravelerProse(suggestion.summary) || suggestion.summary}
                              </p>
                              {suggestion.diffSummaryLines.length > 0 && (
                                <ul className={styles.aiSuggestionDiffList}>
                                  {suggestion.diffSummaryLines.map((line, index) => (
                                    <li key={`${suggestion.id}-diff-${index}`}>
                                      {cleanTravelerProse(line) || line}
                                    </li>
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
                <div
                  ref={locationBoxRef}
                  className={styles.aiLocationBox}
                  role="status"
                  aria-live="polite"
                >
                  <div className={styles.aiTurnHeader}>
                    <span className={styles.aiTurnRole}>
                      <Navigation size={14} aria-hidden="true" /> Cần vị trí hiện tại
                    </span>
                    <span className={styles.aiTurnBadge}>Chỉ dùng 1 lần trong phiên</span>
                  </div>
                  <p className={styles.aiTurnText}>{cleanTravelerProse(state.prompt) || state.prompt}</p>
                  <p className={styles.aiLocationPendingNote}>
                    Câu hỏi đang chờ: <strong>{state.pendingMessage}</strong>
                  </p>
                  <p className={styles.aiLocationStatusNote}>
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
                          <LoaderCircle size={15} className={styles.spinIcon} aria-hidden="true" />
                          Đang lấy GPS…
                        </>
                      ) : (
                        <>
                          <Navigation size={15} aria-hidden="true" />
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
                      <MapPin size={15} aria-hidden="true" />
                      Chọn vị trí thủ công trên bản đồ
                    </button>
                    {onCancelPendingLocation && (
                      <button
                        type="button"
                        className={styles.aiLocationCancelBtn}
                        disabled={controlsDisabled}
                        onClick={onCancelPendingLocation}
                      >
                        <X size={14} aria-hidden="true" />
                        Hủy
                      </button>
                    )}
                  </div>
                </div>
              )}

              {state.kind === "APPLIED" && (
                <div className={styles.aiAppliedBanner} role="status" aria-live="polite">
                  <span>{cleanTravelerProse(state.summary) || state.summary}</span>
                  <div className={styles.quickActionRow}>
                    {onOpenCanvas && (
                      <button
                        type="button"
                        className={styles.toolButtonCompact}
                        onClick={onOpenCanvas}
                      >
                        <CalendarDays size={14} aria-hidden="true" />
                        Mở Canvas xem ngay
                      </button>
                    )}
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
              {messages.length === 0 &&
                !isBusy &&
                state.kind !== "NEEDS_LOCATION" &&
                quickChips.length > 0 && (
                  <div className={styles.aiChipDrawer} aria-label="Gợi ý câu hỏi nhanh">
                    {quickChips.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        className={styles.aiQuickChip}
                        disabled={controlsDisabled}
                        onClick={() => onSubmitPrompt(prompt)}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                )}

              <form className={styles.aiInputForm} onSubmit={handleFormSubmit}>
                <label htmlFor="ai-edit-prompt-input" className={styles.srOnly}>
                  Nhập yêu cầu chỉnh sửa hoặc hỏi tư vấn lịch trình bằng AI
                </label>
                <div className={styles.aiComposerRow}>
                  {messages.length > 0 && onClearHistory && (
                    <div ref={menuRef} className={styles.aiOverflowWrap}>
                      <button
                        type="button"
                        className={styles.aiOverflowBtn}
                        aria-label="Tùy chọn hội thoại"
                        aria-haspopup="menu"
                        aria-expanded={menuOpen}
                        disabled={controlsDisabled}
                        onClick={() => setMenuOpen((prev) => !prev)}
                      >
                        <MoreHorizontal size={18} aria-hidden="true" />
                      </button>
                      {menuOpen && (
                        <div className={styles.aiOverflowMenu} role="menu" aria-label="Tùy chọn hội thoại">
                          <button
                            type="button"
                            role="menuitem"
                            className={styles.aiOverflowDangerItem}
                            disabled={controlsDisabled}
                            onClick={() => {
                              setMenuOpen(false);
                              onClearHistory();
                            }}
                          >
                            <Trash2 size={14} aria-hidden="true" />
                            Xóa hội thoại tạm
                          </button>
                        </div>
                      )}
                    </div>
                  )}

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
                      maxLength={MAX_PROMPT_CHARS}
                      disabled={controlsDisabled}
                      value={inputValue}
                      onChange={(event) => onInputChange(event.target.value)}
                      onKeyDown={handleTextareaKeyDown}
                      placeholder="Hỏi bằng lời thường, ví dụ: Ngày 2 có gấp quá không?"
                      className={styles.aiPromptTextarea}
                    />
                    {isStreaming ? (
                      <button
                        type="button"
                        className={styles.aiStopPillBtn}
                        aria-label="Dừng trả lời"
                        onClick={onStopStream}
                      >
                        <Square size={13} aria-hidden="true" />
                        <span className={styles.srOnly}>Dừng</span>
                      </button>
                    ) : (
                      <button
                        type="submit"
                        className={styles.aiSendPillBtn}
                        aria-label={isLoading ? "Đang xử lý" : "Gửi"}
                        disabled={controlsDisabled || inputValue.trim().length === 0}
                      >
                        {isLoading ? (
                          <LoaderCircle size={15} className={styles.spinIcon} aria-hidden="true" />
                        ) : (
                          <Send size={15} aria-hidden="true" />
                        )}
                        <span className={styles.srOnly}>
                          {isLoading ? "Đang xử lý" : "Gửi"}
                        </span>
                      </button>
                    )}
                  </div>
                </div>

                <div
                  className={
                    showCharCounter
                      ? `${styles.aiComposerFooter} ${styles.aiComposerFooterWithCounter}`
                      : styles.aiComposerFooter
                  }
                >
                  <span className={styles.aiComposerHint}>
                    Enter gửi · Shift+Enter xuống dòng
                  </span>
                  {showCharCounter && (
                    <span className={styles.aiCharCounter}>
                      {charCount}/{MAX_PROMPT_CHARS} ký tự
                    </span>
                  )}
                </div>
              </form>
            </div>
          </div>

          {isManualSheetOpen && onSelectManualCoords && (
            <div
              className={styles.aiLocationSheetBackdrop}
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  (onCloseManualLocation ?? onCancelPendingLocation)?.();
                }
              }}
            >
              <div
                className={styles.aiLocationSheet}
                role="dialog"
                aria-modal="true"
                aria-labelledby={sheetTitleId}
              >
                <div
                  className={styles.aiSheetDragZone}
                  onTouchStart={(event) => {
                    swipeStartYRef.current = event.touches[0]?.clientY ?? null;
                  }}
                  onTouchEnd={(event) => {
                    const startY = swipeStartYRef.current;
                    swipeStartYRef.current = null;
                    const endY = event.changedTouches[0]?.clientY;
                    if (startY !== null && endY !== undefined && endY - startY > 60) {
                      (onCloseManualLocation ?? onCancelPendingLocation)?.();
                    }
                  }}
                >
                  <span className={styles.aiSheetDragHandle} aria-hidden="true" />
                  <div className={styles.aiSheetHeader}>
                    <h2 id={sheetTitleId} className={styles.aiSheetTitle}>
                      Chọn vị trí thủ công
                    </h2>
                    <button
                      type="button"
                      className={styles.aiSheetCloseBtn}
                      aria-label="Đóng bản đồ chọn vị trí"
                      onClick={() => (onCloseManualLocation ?? onCancelPendingLocation)?.()}
                    >
                      <X size={18} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className={styles.aiSheetBody}>
                  <ManualLocationPicker
                    coordinates={manualDraftCoords}
                    onChange={setManualDraftCoords}
                    onConfirm={(coords) => {
                      setManualDraftCoords(coords);
                      onSelectManualCoords(coords);
                    }}
                    variant="sheet"
                    hideApplyButton
                    applyTriggerRef={manualApplyRef}
                  />
                </div>

                <div className={styles.aiSheetFooter}>
                  <button
                    type="button"
                    className={styles.aiSheetConfirmBtn}
                    disabled={controlsDisabled}
                    onClick={() => {
                      if (manualApplyRef.current) {
                        manualApplyRef.current();
                      } else if (manualDraftCoords) {
                        onSelectManualCoords(manualDraftCoords);
                      }
                    }}
                  >
                    Dùng vị trí này
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
