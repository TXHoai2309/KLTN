"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronRight,
  LoaderCircle,
  Minus,
  Plus,
  X,
} from "lucide-react";
import {
  INTEREST_OPTIONS,
  type CompanionType,
  type MobilityConstraint,
  type TripInterest,
  type TripPace,
  type TripTransport,
} from "@/modules/trip-requirement/trip-requirement-contract";
import { formatVietnameseDate } from "@/lib/date-only";
import TripPersonalizationSheet from "./trip-personalization-sheet";
import TripCalendarPicker from "./trip-calendar-picker";

export type TripSentenceBuilderProps = {
  durationDays: string;
  onDurationChange: (duration: string) => void;
  transport: TripTransport | "";
  onTransportChange: (transport: TripTransport | "") => void;
  startDate: string;
  onStartDateChange: (date: string) => void;

  companionType: CompanionType | "";
  companionGroupSize: string;
  onCompanionChange?: (type: CompanionType | "", groupSize: string) => void;
  onCompanionTypeChange?: (type: CompanionType | "") => void;
  onCompanionGroupSizeChange?: (size: string) => void;
  interests: TripInterest[];
  onInterestsChange?: (interests: TripInterest[]) => void;
  pace: TripPace | "";
  onPaceChange?: (pace: TripPace | "") => void;
  mobilityFlags: MobilityConstraint[];
  onMobilityFlagsChange?: (flags: MobilityConstraint[]) => void;
  mobilityNote: string;
  onMobilityNoteChange?: (note: string) => void;

  onOpenPersonalization?: () => void;
  onOpenAIModal?: () => void;
  onSubmit: () => void;

  pending: boolean;
  errors?: Record<string, string>;
  feedback?: string | null;
};

const DURATION_PRESETS = [
  { value: "2", label: "2 ngày" },
  { value: "3", label: "3 ngày" },
  { value: "4", label: "4 ngày" },
  { value: "5", label: "5 ngày" },
];

export default function TripSentenceBuilder({
  durationDays,
  onDurationChange,
  transport,
  onTransportChange,
  startDate,
  onStartDateChange,
  companionType,
  companionGroupSize,
  onCompanionChange,
  onCompanionTypeChange,
  onCompanionGroupSizeChange,
  interests,
  onInterestsChange,
  pace,
  onPaceChange,
  mobilityFlags,
  onMobilityFlagsChange,
  mobilityNote,
  onMobilityNoteChange,
  onSubmit,
  pending,
  errors = {},
  feedback,
}: TripSentenceBuilderProps) {
  const [activePicker, setActivePicker] = useState<"duration" | "transport" | "startDate" | null>(null);
  const [isPersonalizationOpen, setIsPersonalizationOpen] = useState(false);

  const [isCustomDuration, setIsCustomDuration] = useState(() => {
    return durationDays !== "" && !DURATION_PRESETS.some((p) => p.value === durationDays);
  });

  // Lock body scroll and listen for Escape key when activePicker is open
  useEffect(() => {
    if (!activePicker) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActivePicker(null);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [activePicker]);

  const isFormValid = durationDays.trim() !== "" && transport !== "";

  // Compute personalization summary label and count
  const summaryTags: string[] = [];
  if (companionType === "SOLO") summaryTags.push("Một mình");
  else if (companionType === "COUPLE") summaryTags.push("Cặp đôi");
  else if (companionType === "FAMILY") summaryTags.push(`Gia đình (${companionGroupSize || "2"} người)`);
  else if (companionType === "FRIENDS") summaryTags.push(`Bạn bè (${companionGroupSize || "2"} người)`);
  else if (companionType === "OTHER") summaryTags.push(`Khác (${companionGroupSize || "2"} người)`);

  for (const interest of interests) {
    const opt = INTEREST_OPTIONS.find((o) => o.value === interest);
    if (opt) summaryTags.push(opt.label);
  }

  if (pace === "RELAXED") summaryTags.push("Thư thả");
  else if (pace === "MODERATE") summaryTags.push("Vừa phải");
  else if (pace === "PACKED") summaryTags.push("Nhiều trải nghiệm");

  if (mobilityFlags.length > 0) {
    summaryTags.push(`${mobilityFlags.length} lưu ý sức khỏe`);
  }

  if (mobilityNote.trim()) {
    summaryTags.push("Có ghi chú");
  }

  const totalConfigured =
    (companionType ? 1 : 0) +
    (interests.length > 0 ? 1 : 0) +
    (pace ? 1 : 0) +
    (mobilityFlags.length > 0 ? 1 : 0) +
    (mobilityNote.trim() ? 1 : 0);

  const hasPersonalization = totalConfigured > 0;
  const personalizationSummaryText =
    summaryTags.slice(0, 4).join(" · ") + (summaryTags.length > 4 ? ` +${summaryTags.length - 4}` : "");
  const personalizationCountText = `${totalConfigured} mục đã thiết lập`;

  return (
    <div className="trip-sentence-container">
      {/* Editorial Page Header */}
      <header className="trip-config-header">
        <div className="trip-config-eyebrow">
          <span className="trip-eyebrow-sparkle" aria-hidden="true">✦</span>
          <span>LẬP HÀNH TRÌNH</span>
        </div>
        <h1 className="trip-config-title">
          Một chuyến Hà Giang<br className="trip-title-break" /> theo cách của bạn.
        </h1>
        <p className="trip-config-lead">Chỉ cần vài lựa chọn để bắt đầu.</p>
      </header>

      {/* Main Compact Configurator Card */}
      <div className="trip-config-card">
        {/* ── 1. Thời lượng chuyến đi ── */}
        <div className="trip-config-item">
          <button
            type="button"
            className="trip-config-row"
            onClick={() => setActivePicker(activePicker === "duration" ? null : "duration")}
            aria-expanded={activePicker === "duration"}
            aria-haspopup="dialog"
            data-error={Boolean(errors.durationDays)}
          >
            <div className="trip-config-row-text">
              <span className="trip-config-row-label">THỜI LƯỢNG</span>
              <span className="trip-config-row-value">
                {durationDays ? `${durationDays} ngày` : "Chưa chọn"}
              </span>
            </div>
            <ChevronRight
              size={18}
              className="trip-config-chevron"
              aria-hidden="true"
            />
          </button>

          <input
            id="trip-duration"
            type="hidden"
            name="trip-duration"
            value={durationDays}
          />
        </div>

        <div className="trip-config-divider" />

        {/* ── 2. Phương tiện di chuyển ── */}
        <div className="trip-config-item">
          <button
            type="button"
            className="trip-config-row"
            onClick={() => setActivePicker(activePicker === "transport" ? null : "transport")}
            aria-expanded={activePicker === "transport"}
            aria-haspopup="dialog"
            data-error={Boolean(errors.transport)}
          >
            <div className="trip-config-row-text">
              <span className="trip-config-row-label">PHƯƠNG TIỆN</span>
              <span className="trip-config-row-value">
                {transport === "MOTORCYCLE" ? "Xe máy" : transport === "CAR" ? "Ô tô" : "Chưa chọn"}
              </span>
            </div>
            <ChevronRight
              size={18}
              className="trip-config-chevron"
              aria-hidden="true"
            />
          </button>

          <input
            id="trip-transport"
            type="hidden"
            name="trip-transport"
            value={transport}
          />
        </div>

        <div className="trip-config-divider" />

        {/* ── 3. Ngày khởi hành ── */}
        <div className="trip-config-item">
          <button
            type="button"
            className="trip-config-row"
            onClick={() => setActivePicker(activePicker === "startDate" ? null : "startDate")}
            aria-expanded={activePicker === "startDate"}
            aria-haspopup="dialog"
            data-error={Boolean(errors.startDate)}
          >
            <div className="trip-config-row-text">
              <span className="trip-config-row-label">NGÀY KHỞI HÀNH</span>
              <span className="trip-config-row-value">
                {startDate ? formatVietnameseDate(startDate) : "Chưa chốt ngày"}
              </span>
            </div>
            <ChevronRight
              size={18}
              className="trip-config-chevron"
              aria-hidden="true"
            />
          </button>

          <input
            id="trip-start-date"
            type="hidden"
            name="trip-start-date"
            value={startDate}
          />
        </div>

        <div className="trip-config-divider" />

        {/* ── 4. Cá nhân hóa chuyến đi ── */}
        <div className="trip-config-item">
          <button
            type="button"
            className="trip-config-row trip-config-row-personalization"
            onClick={() => setIsPersonalizationOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={isPersonalizationOpen}
          >
            <div className="trip-config-row-text">
              <span className="trip-config-row-label">CÁ NHÂN HÓA CHUYẾN ĐI</span>
              <span className="trip-config-row-subtitle">
                Sở thích, người đồng hành, nhịp độ và lưu ý
              </span>
              {hasPersonalization ? (
                <div className="trip-config-personalization-meta">
                  <span className="trip-config-personalization-tags">{personalizationSummaryText}</span>
                  <span className="trip-config-personalization-count">{personalizationCountText}</span>
                </div>
              ) : (
                <span className="trip-config-row-value trip-config-muted">Chưa thiết lập</span>
              )}
            </div>
            <ChevronRight size={18} className="trip-config-chevron" aria-hidden="true" />
          </button>
        </div>

        <div className="trip-config-divider" />

        {/* Validation Errors */}
        {(errors.durationDays || errors.transport || errors.startDate || feedback) && (
          <div className="trip-sentence-errors" role="alert">
            {errors.durationDays && <p className="trip-error-item">{errors.durationDays}</p>}
            {errors.transport && <p className="trip-error-item">{errors.transport}</p>}
            {errors.startDate && <p className="trip-error-item">{errors.startDate}</p>}
            {feedback && <p className="trip-error-item">{feedback}</p>}
          </div>
        )}

        {/* Primary CTA */}
        <div className="trip-config-cta-wrap">
          <button
            type="button"
            className="trip-sentence-primary-btn"
            disabled={!isFormValid || pending}
            onClick={onSubmit}
          >
            {pending ? (
              <>
                <LoaderCircle size={16} className="trip-spinner" aria-hidden="true" />
                <span>Đang xử lý…</span>
              </>
            ) : (
              <>
                <span>Tạo lịch trình</span>
                <ArrowRight size={16} aria-hidden="true" />
              </>
            )}
          </button>

          {!isFormValid && (
            <p className="trip-sentence-cta-hint">
              Chọn thời lượng và phương tiện để tiếp tục.
            </p>
          )}
        </div>
      </div>

      {/* Centered Modal Dialog for Duration, Transport, and Start Date */}
      {activePicker && (
        <div
          className="trip-picker-backdrop"
          onClick={() => setActivePicker(null)}
          role="presentation"
        >
          <div
            className="trip-picker-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="trip-picker-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="trip-picker-modal-header">
              <h3 id="trip-picker-modal-title" className="trip-picker-modal-title">
                {activePicker === "duration" && "Thời lượng chuyến đi"}
                {activePicker === "transport" && "Phương tiện di chuyển"}
                {activePicker === "startDate" && "Ngày khởi hành"}
              </h3>
              <button
                type="button"
                className="trip-picker-modal-close"
                onClick={() => setActivePicker(null)}
                aria-label="Đóng"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="trip-picker-modal-body">
              {activePicker === "duration" && (
                <div id="duration-picker-panel" className="trip-picker-modal-content">
                  <div className="trip-picker-options">
                    {DURATION_PRESETS.map((preset) => {
                      const isSelected = durationDays === preset.value && !isCustomDuration;
                      return (
                        <button
                          key={preset.value}
                          type="button"
                          className="trip-picker-option-row"
                          data-selected={isSelected}
                          onClick={() => {
                            onDurationChange(preset.value);
                            setIsCustomDuration(false);
                            setActivePicker(null);
                          }}
                        >
                          <span className="trip-picker-option-label">{preset.label}</span>
                          {isSelected && <Check size={16} className="trip-picker-check" aria-hidden="true" />}
                        </button>
                      );
                    })}

                    <button
                      type="button"
                      className="trip-picker-option-row"
                      data-selected={isCustomDuration}
                      onClick={() => {
                        setIsCustomDuration(true);
                        if (!durationDays || DURATION_PRESETS.some((p) => p.value === durationDays)) {
                          onDurationChange("6");
                        }
                      }}
                    >
                      <span className="trip-picker-option-label">Khác…</span>
                      {isCustomDuration && <Check size={16} className="trip-picker-check" aria-hidden="true" />}
                    </button>
                  </div>

                  {isCustomDuration && (
                    <div className="trip-picker-custom-row">
                      <span className="trip-picker-custom-label">Số ngày đi:</span>
                      <div className="trip-stepper-control">
                        <button
                          type="button"
                          className="trip-stepper-btn"
                          disabled={(Number(durationDays) || 3) <= 1}
                          onClick={() => {
                            const current = Math.max(1, (Number(durationDays) || 3) - 1);
                            onDurationChange(String(current));
                          }}
                          aria-label="Giảm số ngày"
                        >
                          <Minus size={13} aria-hidden="true" />
                        </button>
                        <span className="trip-stepper-value">{durationDays || "3"} ngày</span>
                        <button
                          type="button"
                          className="trip-stepper-btn"
                          disabled={(Number(durationDays) || 3) >= 14}
                          onClick={() => {
                            const current = Math.min(14, (Number(durationDays) || 3) + 1);
                            onDurationChange(String(current));
                          }}
                          aria-label="Tăng số ngày"
                        >
                          <Plus size={13} aria-hidden="true" />
                        </button>
                      </div>
                      <button
                        type="button"
                        className="trip-picker-done-btn"
                        onClick={() => setActivePicker(null)}
                      >
                        Xong
                      </button>
                    </div>
                  )}
                </div>
              )}

              {activePicker === "transport" && (
                <div id="transport-picker-panel" className="trip-picker-modal-content">
                  <div className="trip-picker-options">
                    <button
                      type="button"
                      className="trip-picker-card-option"
                      data-selected={transport === "MOTORCYCLE"}
                      onClick={() => {
                        onTransportChange("MOTORCYCLE");
                        setActivePicker(null);
                      }}
                    >
                      <div className="trip-picker-card-info">
                        <span className="trip-picker-card-title">Xe máy</span>
                        <span className="trip-picker-card-desc">Chủ động, linh hoạt trên cung đèo</span>
                      </div>
                      {transport === "MOTORCYCLE" && (
                        <Check size={16} className="trip-picker-check" aria-hidden="true" />
                      )}
                    </button>

                    <button
                      type="button"
                      className="trip-picker-card-option"
                      data-selected={transport === "CAR"}
                      onClick={() => {
                        onTransportChange("CAR");
                        setActivePicker(null);
                      }}
                    >
                      <div className="trip-picker-card-info">
                        <span className="trip-picker-card-title">Ô tô</span>
                        <span className="trip-picker-card-desc">Thoải mái, thuận tiện hơn</span>
                      </div>
                      {transport === "CAR" && (
                        <Check size={16} className="trip-picker-check" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {activePicker === "startDate" && (
                <div id="start-date-picker-panel" className="trip-picker-modal-content">
                  <TripCalendarPicker
                    selectedDate={startDate}
                    onSelectDate={(iso) => {
                      onStartDateChange(iso);
                    }}
                    onClearDate={() => {
                      onStartDateChange("");
                    }}
                    onClose={() => setActivePicker(null)}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Accessible Personalization Sheet */}
      <TripPersonalizationSheet
        isOpen={isPersonalizationOpen}
        onClose={() => setIsPersonalizationOpen(false)}
        companionType={companionType}
        companionGroupSize={companionGroupSize}
        onCompanionChange={onCompanionChange}
        onCompanionTypeChange={onCompanionTypeChange}
        onCompanionGroupSizeChange={onCompanionGroupSizeChange}
        interests={interests}
        onInterestsChange={onInterestsChange ?? (() => {})}
        pace={pace}
        onPaceChange={onPaceChange ?? (() => {})}
        mobilityFlags={mobilityFlags}
        onMobilityFlagsChange={onMobilityFlagsChange ?? (() => {})}
        mobilityNote={mobilityNote}
        onMobilityNoteChange={onMobilityNoteChange ?? (() => {})}
      />
    </div>
  );
}
