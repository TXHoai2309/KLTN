"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { useEffect, useRef } from "react";
import { formatVietnameseDate } from "@/lib/date-only";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Compass,
  Gauge,
  MapPin,
  Route,
  ShieldCheck,
  Sparkles,
  Users,
  X,
  XCircle,
  RotateCcw,
} from "lucide-react";
import {
  COMPANION_OPTIONS,
  INTEREST_OPTIONS,
  PACE_OPTIONS,
  type TripRequirementInput,
} from "@/modules/trip-requirement/trip-requirement-contract";
import type {
  CheckStatus,
  PlannerDay,
  PlannerResult,
  PlannerStop,
} from "@/modules/trip-planner/planner-contract";

export const clockText = (minute: number | null) =>
  minute === null
    ? "Chưa xác định"
    : `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

export const durationText = (minutes: number) =>
  `${Math.floor(minutes / 60) ? `${Math.floor(minutes / 60)} giờ ` : ""}${minutes % 60 ? `${minutes % 60} phút` : ""}`.trim();

const statuses: Record<CheckStatus, { label: string; Icon: typeof CheckCircle2 }> = {
  PASS: { label: "Đáp ứng", Icon: CheckCircle2 },
  VIOLATION: { label: "Vi phạm", Icon: XCircle },
  INSUFFICIENT_DATA: { label: "Chưa đủ dữ liệu", Icon: AlertTriangle },
};

export function ValidationBadge({ status }: { status: CheckStatus }) {
  const { label, Icon } = statuses[status];
  return (
    <span className={`planner-badge planner-badge-${status.toLowerCase()}`}>
      <Icon size={12} aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * Thumbnail rendering:
 * ONLY renders when there is a real image URL.
 * NEVER renders a placeholder box if the image is missing, preserving full width for text.
 */
export function DestinationImage({ stop, large = false }: { stop: PlannerStop; large?: boolean }) {
  if (!stop.destination.image?.url) {
    return (
      <div
        className={large ? "planner-photo planner-photo-large planner-photo-empty" : "planner-photo planner-photo-empty"}
        aria-hidden="true"
      >
        <MapPin size={large ? 20 : 16} className="planner-photo-icon" />
      </div>
    );
  }
  return (
    <img
      className={large ? "planner-photo planner-photo-large" : "planner-photo"}
      src={stop.destination.image.url}
      alt={stop.destination.image.alt || stop.destination.name}
      loading="lazy"
    />
  );
}

/**
 * Compact Header:
 * Clean metadata chips + accessible paragraph for screen readers.
 * Preserves .planner-summary selector for integration tests.
 */
export function TripSummaryBar({
  requirement,
  days,
  embedded = false,
  onBack,
  disabled = false,
}: {
  requirement: TripRequirementInput;
  days?: PlannerDay[];
  embedded?: boolean;
  onBack?: () => void;
  disabled?: boolean;
}) {
  const { durationDays, transport, pace, companions, interests, startDate } = requirement;
  const endDate = days?.at(-1)?.date;
  const Heading = embedded ? "h2" : "h1";

  const transportLabel = transport === "CAR" ? "Ô tô" : "Xe máy";
  const paceLabel = pace
    ? PACE_OPTIONS.find((option) => option.value === pace)?.label ?? "Nhịp độ vừa phải"
    : "Nhịp độ vừa phải";
  const companionLabel = companions
    ? `${companions.groupSize} người (${COMPANION_OPTIONS.find((option) => option.value === companions.type)?.label ?? "Nhóm"})`
    : null;
  const interestsList = interests.length
    ? interests
        .map((interest) => INTEREST_OPTIONS.find((option) => option.value === interest)?.label)
        .filter(Boolean)
    : [];

  const totalStops = days?.reduce((sum, d) => sum + d.stops.length, 0);

  const dateRangeText = startDate
    ? `${formatVietnameseDate(startDate)} – ${endDate ? formatVietnameseDate(endDate) : "theo ngày bắt đầu"}`
    : `Ngày 1 – Ngày ${durationDays}`;

  return (
    <header className="planner-summary" aria-label="Tóm tắt chuyến đi">
      {onBack && (
        <button
          type="button"
          className="planner-back-btn"
          onClick={onBack}
          disabled={disabled}
          aria-label="Quay lại chỉnh nhu cầu"
        >
          <ArrowLeft size={15} aria-hidden="true" />
          <span>Chỉnh nhu cầu</span>
        </button>
      )}

      <div className="planner-summary-main">
        <Heading className="planner-title">Hành trình Hà Giang · {durationDays} ngày</Heading>
        <div className="planner-metadata" aria-label="Thông số chuyến đi">
          <span>{transportLabel}</span>
          <span className="planner-meta-sep" aria-hidden="true">·</span>
          <span>{paceLabel}</span>
          {totalStops !== undefined && totalStops > 0 && (
            <>
              <span className="planner-meta-sep" aria-hidden="true">·</span>
              <span>{totalStops} điểm đến</span>
            </>
          )}
          {companionLabel && (
            <>
              <span className="planner-meta-sep" aria-hidden="true">·</span>
              <span>{companionLabel}</span>
            </>
          )}
          {startDate && (
            <>
              <span className="planner-meta-sep" aria-hidden="true">·</span>
              <span>{dateRangeText}</span>
            </>
          )}
          {interestsList.length > 0 && (
            <>
              <span className="planner-meta-sep" aria-hidden="true">·</span>
              <span>{interestsList.join(", ")}</span>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

/**
 * Compact Warning Notice:
 * 1-line banner across the page with a clean status and "Xem chi tiết" action.
 */
export function WarningNoticeRow({
  proposal,
}: {
  proposal: PlannerResult;
  onOpenValidationSheet?: () => void;
}) {
  let message = "";
  if (proposal.status === "PROPOSAL_READY") {
    message = "Đề xuất đáp ứng các kiểm tra hiện tại; chưa được lưu chính thức.";
  } else if (proposal.status === "NO_FEASIBLE_ITINERARY") {
    message = "Chưa thể bố trí một lịch trình đáp ứng tất cả ràng buộc. Hãy xem các mục cần điều chỉnh.";
  } else {
    message = "Đề xuất còn dữ liệu chưa được xác minh. Hãy xem các cảnh báo trước khi sử dụng.";
  }

  return (
    <div
      className="sr-only"
      role="status"
      aria-live="polite"
    >
      <span>{message}</span>
    </div>
  );
}

/**
 * Refined Day Tabs:
 * Editorial journey tabs with day label, stop count, and accessible keyboard navigation.
 */
export function ItineraryDayTabs({
  days,
  selectedDay,
  onChange,
}: {
  days: PlannerDay[];
  selectedDay: number;
  onChange: (day: number) => void;
}) {
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % days.length;
    else if (event.key === "ArrowLeft") next = (index + days.length - 1) % days.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = days.length - 1;
    else return;
    event.preventDefault();
    onChange(days[next]!.day);
    (event.currentTarget.parentElement?.children[next] as HTMLButtonElement | undefined)?.focus();
  }

  return (
    <div className="planner-day-tabs" role="tablist" aria-label="Chọn ngày trong lịch trình">
      {days.map((day, index) => (
        <button
          id={`planner-tab-${day.day}`}
          key={day.day}
          role="tab"
          aria-selected={selectedDay === day.day}
          aria-controls="planner-day-panel"
          tabIndex={selectedDay === day.day ? 0 : -1}
          onClick={() => onChange(day.day)}
          onKeyDown={(event) => navigate(event, index)}
          className={`planner-day-tab ${selectedDay === day.day ? "is-active" : ""}`}
        >
          <span className="planner-day-tab-title">NGÀY {day.day}</span>
          <span className="planner-day-tab-count">{day.stops.length} điểm</span>
          <small className="planner-day-tab-date">
            {day.date ? formatVietnameseDate(day.date) : "Ngày tương đối"}
          </small>
        </button>
      ))}
    </div>
  );
}

/**
 * Compact Route Summary:
 * Editorial header & metadata strip under day tabs:
 * "Ngày 1 · 3 điểm · 175,7 km · khoảng 2 giờ di chuyển"
 */
export function TripOverviewCard({ day }: { day: PlannerDay }) {
  const distanceStr =
    day.distanceMeters === null
      ? "Chưa đủ dữ liệu"
      : `${(day.distanceMeters / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} km`;
  const travelStr =
    day.travelSeconds === null
      ? "Chưa đủ dữ liệu"
      : day.travelSeconds
        ? durationText(Math.ceil(day.travelSeconds / 60))
        : "Không có chặng nối";

  return (
    <div className="planner-overview" aria-label="Tổng quan hành trình ngày">
      <div className="planner-overview-day-heading">
        <h3 className="planner-day-title">Ngày {day.day}</h3>
        <span className="planner-day-subdate">
          {day.date ? formatVietnameseDate(day.date) : "Ngày tương đối"}
        </span>
      </div>
      <p className="planner-overview-meta-line">
        <span>{day.stops.length} điểm dừng</span>
        <span className="planner-meta-sep" aria-hidden="true">·</span>
        <span>{distanceStr}</span>
        <span className="planner-meta-sep" aria-hidden="true">·</span>
        <span>{travelStr.includes("Chưa") ? travelStr : `khoảng ${travelStr} di chuyển`}</span>
      </p>
    </div>
  );
}

/**
 * Itinerary Visit Item:
 * Modern Travel & Editorial timeline item:
 * Clean thumbnail, editorial typography, quiet metadata, and connected route connector.
 */
export function ItineraryStopCard({
  stop,
  selected,
  onSelect,
  nextStop,
}: {
  stop: PlannerStop;
  selected: boolean;
  onSelect: (id: string) => void;
  nextStop?: PlannerStop;
}) {
  const arrival = clockText(stop.arrivalMinute);
  const departure = clockText(stop.departureMinute);

  return (
    <li className={`planner-stop ${selected ? "is-selected" : ""}`}>
      {/* Vertical timeline node & connecting stem */}
      <div className="planner-stop-node-col">
        <span className="planner-stop-number" aria-hidden="true">
          {stop.order}
        </span>
        <span className="planner-stop-stem" aria-hidden="true" />
      </div>

      <div className="planner-stop-body">
        {/* Time row above stop name */}
        <div className="planner-stop-time-row">
          <span className="planner-stop-time">
            <Clock size={12} aria-hidden="true" />
            <span>{arrival} – {departure}</span>
          </span>
          {stop.validationStatus !== "PASS" && (
            <span
              className="planner-stop-warn-hint"
              title={statuses[stop.validationStatus].label}
              aria-label={statuses[stop.validationStatus].label}
            >
              <AlertTriangle size={12} aria-hidden="true" />
              <span className="sr-only">{statuses[stop.validationStatus].label}</span>
            </span>
          )}
          {stop.validationStatus === "PASS" && (
            <span className="sr-only">Đáp ứng</span>
          )}
        </div>

        {/* Destination Card item */}
        <button
          type="button"
          className="planner-stop-select"
          aria-pressed={selected}
          onClick={() => onSelect(stop.destination.id)}
        >
          <DestinationImage stop={stop} large />

          <div className="planner-stop-content">
            <div className="planner-stop-heading">
              <h4 className="planner-stop-name">{stop.destination.name}</h4>
            </div>

            <div className="planner-stop-meta">
              {stop.destination.area || stop.destination.address ? (
                <span className="planner-stop-area">
                  <MapPin size={12} aria-hidden="true" />
                  <span>{stop.destination.area || stop.destination.address}</span>
                </span>
              ) : null}
              <span className="planner-meta-sep" aria-hidden="true">·</span>
              <span className="planner-stop-duration">{durationText(stop.visitDurationMinutes)} dừng chân</span>
            </div>
          </div>
        </button>

        {/* Route Segment connector between stops */}
        {nextStop?.inbound && (
          <div className="planner-route-segment" aria-label="Đoạn đường di chuyển">
            <div className="planner-route-pill">
              <span className="planner-route-arrow" aria-hidden="true">↓</span>
              <span className="planner-route-text">
                {nextStop.inbound.status === "VERIFIED"
                  ? `${durationText(Math.ceil(nextStop.inbound.durationSeconds! / 60))} · ${(nextStop.inbound.distanceMeters! / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} km`
                  : "Chưa có thời gian di chuyển đã xác minh"}
              </span>
            </div>
          </div>
        )}
      </div>
    </li>
  );
}

/**
 * Ultra-compact Floating Destination Card on Map:
 * Sits in bottom corner, small footprint, no image duplication, doesn't hide map route.
 */
export function DestinationPreviewCard({
  stop,
  onClose,
}: {
  stop: PlannerStop | undefined;
  onClose?: () => void;
}) {
  if (!stop) return null;

  return (
    <aside className="planner-preview planner-floating-card" aria-label={`Chi tiết ${stop.destination.name}`}>
      <div className="planner-floating-header">
        <div className="planner-floating-title-row">
          <span className="planner-floating-num" aria-hidden="true">{stop.order}</span>
          <div className="planner-floating-titles">
            <h4 className="planner-floating-name">{stop.destination.name}</h4>
            <p className="planner-floating-sub">
              {clockText(stop.arrivalMinute)} – {clockText(stop.departureMinute)}
              {stop.destination.area ? ` · ${stop.destination.area}` : ""}
            </p>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            className="planner-floating-close"
            onClick={onClose}
            aria-label="Đóng thông tin điểm đến"
          >
            <X size={15} aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="planner-floating-footer">
        <a
          className="planner-detail-link"
          href={`/destinations/${encodeURIComponent(stop.destination.id)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span>Xem chi tiết</span>
          <ArrowRight size={13} aria-hidden="true" />
        </a>
      </div>
    </aside>
  );
}

/**
 * Compact Validator Summary Row:
 * 1 single row trigger below the timeline.
 */
export function ItineraryValidationPanel({
  checks,
  onOpenSheet,
}: {
  checks: PlannerResult["checks"];
  onOpenSheet?: () => void;
}) {
  const passCount = checks.filter((c) => c.status === "PASS").length;
  const violationCount = checks.filter((c) => c.status === "VIOLATION").length;
  const insufficientCount = checks.filter((c) => c.status === "INSUFFICIENT_DATA").length;
  const needReview = violationCount + insufficientCount;

  return (
    <section className="planner-validation" aria-label="Kiểm tra lịch trình">
      <button
        type="button"
        className="planner-validation-summary-row"
        onClick={onOpenSheet}
        aria-haspopup="dialog"
      >
        <div className="planner-val-left">
          <ShieldCheck size={16} className="planner-val-icon" aria-hidden="true" />
          <strong className="planner-val-title">Kiểm tra lịch trình</strong>
          <span className="planner-val-pill">
            {passCount} đạt{needReview > 0 ? ` · ${needReview} cần xem lại` : ""}
          </span>
        </div>

        <div className="planner-val-right">
          <span>Xem chi tiết</span>
          <ChevronRight size={15} aria-hidden="true" />
        </div>
      </button>
    </section>
  );
}

/**
 * Slide-over Side Sheet: Full details of the 5 validation checks and any warnings.
 */
export function ValidationSheet({
  isOpen,
  onClose,
  checks,
  warnings,
}: {
  isOpen: boolean;
  onClose: () => void;
  checks: PlannerResult["checks"];
  warnings: PlannerResult["warnings"];
}) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    const orig = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtnRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = orig;
    };
  }, [isOpen, onClose]);

  const labels: Record<string, string> = {
    OPENING_HOURS: "Giờ mở cửa",
    MINIMUM_DURATION: "Thời lượng tối thiểu",
    TRAVEL_TIME: "Thời gian di chuyển",
    SCHEDULE_CONFLICTS: "Xung đột lịch trình",
    MOBILITY: "Khả năng tiếp cận",
  };

  return (
    <div
      className={`planner-sheet-backdrop ${isOpen ? "is-open" : ""}`}
      onClick={onClose}
      role="presentation"
      aria-hidden={!isOpen}
    >
      <div
        className="planner-sheet-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="planner-val-sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="planner-sheet-header">
          <div>
            <h2 id="planner-val-sheet-title" className="planner-sheet-title">
              Kiểm tra lịch trình
            </h2>
            <p className="planner-sheet-subtitle">
              Đối chiếu quy tắc di chuyển, thời gian và dữ liệu điểm đến
            </p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            className="planner-sheet-close-btn"
            onClick={onClose}
            aria-label="Đóng bảng kiểm tra"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="planner-sheet-body">
          <ul className="planner-sheet-check-list">
            {checks.map((check) => {
              const statusInfo = statuses[check.status];
              const StatusIcon = statusInfo.Icon;
              return (
                <li key={check.key} className={`planner-sheet-check planner-check-${check.status.toLowerCase()}`}>
                  <div className="planner-sheet-check-head">
                    <StatusIcon size={16} className="planner-sheet-status-icon" aria-hidden="true" />
                    <strong>{labels[check.key] ?? check.key}</strong>
                    <ValidationBadge status={check.status} />
                  </div>

                  {check.issues.length > 0 ? (
                    <ul className="planner-sheet-issues">
                      {check.issues.map((issue, idx) => (
                        <li key={idx}>
                          {issue.day ? `Ngày ${issue.day}: ` : ""}
                          {issue.message}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="planner-sheet-check-ok">Không phát hiện vi phạm.</p>
                  )}
                </li>
              );
            })}
          </ul>

          {warnings.length > 0 && (
            <div className="planner-sheet-warnings">
              <h3>Lưu ý cho đề xuất này ({warnings.length})</h3>
              <ul>
                {warnings.map((w, idx) => (
                  <li key={idx}>{w.message}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="planner-sheet-footer">
          <button type="button" className="planner-sheet-confirm-btn" onClick={onClose}>
            Đã hiểu
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Standard PlannerActions: Kept for backwards compatibility with tests.
 */
export function PlannerActions({
  busy,
  disabled = false,
  onBack,
  onRegenerate,
}: {
  busy: boolean;
  disabled?: boolean;
  onBack: () => void;
  onRegenerate: () => void;
}) {
  return (
    <div className="planner-actions">
      <button type="button" onClick={onBack} disabled={busy || disabled}>
        <ArrowLeft size={15} aria-hidden="true" />
        Chỉnh sửa nhu cầu
      </button>
      <button type="button" onClick={onRegenerate} disabled={busy || disabled}>
        <RotateCcw size={15} aria-hidden="true" />
        {busy ? "Đang tạo đề xuất…" : "Tạo lại lịch trình"}
      </button>
    </div>
  );
}
