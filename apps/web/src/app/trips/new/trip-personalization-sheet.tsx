"use client";

import { useEffect, useRef } from "react";
import { Check, Minus, Plus, X } from "lucide-react";
import {
  COMPANION_OPTIONS,
  INTEREST_OPTIONS,
  MOBILITY_CONSTRAINT_OPTIONS,
  PACE_OPTIONS,
  type CompanionType,
  type MobilityConstraint,
  type TripInterest,
  type TripPace,
} from "@/modules/trip-requirement/trip-requirement-contract";

export type TripPersonalizationSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  companionType: CompanionType | "";
  companionGroupSize: string;
  onCompanionChange?: (type: CompanionType | "", groupSize: string) => void;
  onCompanionTypeChange?: (type: CompanionType | "") => void;
  onCompanionGroupSizeChange?: (size: string) => void;
  interests: TripInterest[];
  onInterestsChange: (interests: TripInterest[]) => void;
  pace: TripPace | "";
  onPaceChange: (pace: TripPace | "") => void;
  mobilityFlags: MobilityConstraint[];
  onMobilityFlagsChange: (flags: MobilityConstraint[]) => void;
  mobilityNote: string;
  onMobilityNoteChange: (note: string) => void;
};

export default function TripPersonalizationSheet({
  isOpen,
  onClose,
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
}: TripPersonalizationSheetProps) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Close on Escape & trap background scroll
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Focus close button on open
    setTimeout(() => {
      closeBtnRef.current?.focus();
    }, 50);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const showGroupSize =
    companionType === "FAMILY" ||
    companionType === "FRIENDS" ||
    companionType === "OTHER";

  const rawSize = Number(companionGroupSize);
  const groupSizeNumber = showGroupSize
    ? Math.max(2, Math.min(20, isNaN(rawSize) || rawSize < 2 ? 2 : rawSize))
    : isNaN(rawSize) || rawSize < 1
      ? 1
      : rawSize;

  const handleCompanionSelect = (val: CompanionType) => {
    if (companionType === val) {
      if (onCompanionChange) {
        onCompanionChange("", "");
      } else {
        onCompanionTypeChange?.("");
        onCompanionGroupSizeChange?.("");
      }
    } else {
      let defaultGroupSize = "";
      if (val === "SOLO") defaultGroupSize = "1";
      else if (val === "COUPLE") defaultGroupSize = "2";
      else if (val === "FAMILY" || val === "FRIENDS" || val === "OTHER") {
        const parsed = Number(companionGroupSize);
        defaultGroupSize = isNaN(parsed) || parsed < 2 ? "2" : String(Math.min(20, parsed));
      }

      if (onCompanionChange) {
        onCompanionChange(val, defaultGroupSize);
      } else {
        onCompanionTypeChange?.(val);
        onCompanionGroupSizeChange?.(defaultGroupSize);
      }
    }
  };

  const toggleInterest = (val: TripInterest) => {
    if (interests.includes(val)) {
      onInterestsChange(interests.filter((i) => i !== val));
    } else {
      if (interests.length < 8) {
        onInterestsChange([...interests, val]);
      }
    }
  };

  const toggleMobilityFlag = (val: MobilityConstraint) => {
    if (mobilityFlags.includes(val)) {
      onMobilityFlagsChange(mobilityFlags.filter((f) => f !== val));
    } else {
      if (mobilityFlags.length < 6) {
        onMobilityFlagsChange([...mobilityFlags, val]);
      }
    }
  };

  const handlePaceSelect = (val: TripPace) => {
    onPaceChange(pace === val ? "" : val);
  };

  return (
    <div
      className="trip-sheet-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="trip-sheet-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="trip-sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky Sheet Header */}
        <div className="trip-sheet-header">
          <div className="trip-sheet-title-wrap">
            <h2 id="trip-sheet-title" className="trip-sheet-title">
              Cá nhân hóa chuyến đi
            </h2>
            <p className="trip-sheet-subtitle">
              Sở thích, người đồng hành, nhịp độ và lưu ý an toàn
            </p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            className="trip-sheet-close-btn"
            onClick={onClose}
            aria-label="Đóng"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="trip-sheet-body">
          {/* ── 1. Bạn đi cùng ai? ── */}
          <section className="trip-sheet-section">
            <div className="trip-sheet-section-header">
              <h3 className="trip-sheet-section-title">Bạn đi cùng ai?</h3>
              <span className="trip-sheet-section-hint">Bấm để chọn, bấm lại để bỏ chọn</span>
            </div>

            <div className="trip-sheet-chips-grid" role="radiogroup" aria-label="Người đồng hành">
              {COMPANION_OPTIONS.map((opt) => {
                const isSelected = companionType === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    className="trip-sheet-chip-btn"
                    data-selected={isSelected}
                    onClick={() => handleCompanionSelect(opt.value)}
                  >
                    {isSelected && <Check size={14} className="trip-sheet-check" aria-hidden="true" />}
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>

            {showGroupSize && (
              <div className="trip-sheet-stepper-row">
                <span className="trip-sheet-stepper-label">Số người trong đoàn:</span>
                <div className="trip-sheet-stepper">
                  <button
                    type="button"
                    className="trip-sheet-stepper-btn"
                    onClick={() => {
                      const next = Math.max(2, groupSizeNumber - 1);
                      if (onCompanionChange) onCompanionChange(companionType, String(next));
                      else onCompanionGroupSizeChange?.(String(next));
                    }}
                    disabled={groupSizeNumber <= 2}
                    aria-label="Giảm số người"
                  >
                    <Minus size={13} aria-hidden="true" />
                  </button>
                  <span className="trip-sheet-stepper-val">{groupSizeNumber} người</span>
                  <button
                    type="button"
                    className="trip-sheet-stepper-btn"
                    onClick={() => {
                      const next = Math.min(20, groupSizeNumber + 1);
                      if (onCompanionChange) onCompanionChange(companionType, String(next));
                      else onCompanionGroupSizeChange?.(String(next));
                    }}
                    disabled={groupSizeNumber >= 20}
                    aria-label="Tăng số người"
                  >
                    <Plus size={13} aria-hidden="true" />
                  </button>
                </div>
                <span className="trip-sheet-stepper-hint">(2 - 20 người)</span>
              </div>
            )}
          </section>

          <div className="trip-sheet-divider" />

          {/* ── 2. Sở thích tại Hà Giang ── */}
          <section className="trip-sheet-section">
            <div className="trip-sheet-section-header">
              <h3 className="trip-sheet-section-title">Sở thích tại Hà Giang</h3>
              <span className="trip-sheet-section-hint">
                {interests.length > 0 ? `Đã chọn ${interests.length} sở thích` : "Chọn nhiều trải nghiệm bạn quan tâm"}
              </span>
            </div>

            <div className="trip-sheet-chips-grid" role="group" aria-label="Sở thích">
              {INTEREST_OPTIONS.map((opt) => {
                const isSelected = interests.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className="trip-sheet-chip-btn"
                    data-selected={isSelected}
                    onClick={() => toggleInterest(opt.value)}
                  >
                    {isSelected && <Check size={14} className="trip-sheet-check" aria-hidden="true" />}
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <div className="trip-sheet-divider" />

          {/* ── 3. Nhịp độ di chuyển ── */}
          <section className="trip-sheet-section">
            <div className="trip-sheet-section-header">
              <h3 className="trip-sheet-section-title">Nhịp độ di chuyển</h3>
              <span className="trip-sheet-section-hint">Tốc độ và mật độ điểm đến</span>
            </div>

            <div className="trip-sheet-pace-list" role="radiogroup" aria-label="Nhịp độ">
              {PACE_OPTIONS.map((opt) => {
                const isSelected = pace === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    className="trip-sheet-pace-row"
                    data-selected={isSelected}
                    onClick={() => handlePaceSelect(opt.value)}
                  >
                    <div className="trip-sheet-pace-info">
                      <span className="trip-sheet-pace-title">{opt.label}</span>
                      <span className="trip-sheet-pace-desc">{opt.description}</span>
                    </div>
                    {isSelected && <Check size={16} className="trip-sheet-check" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </section>

          <div className="trip-sheet-divider" />

          {/* ── 4. Lưu ý sức khỏe & an toàn ── */}
          <section className="trip-sheet-section">
            <div className="trip-sheet-section-header">
              <h3 className="trip-sheet-section-title">Lưu ý sức khỏe & an toàn</h3>
              <span className="trip-sheet-section-hint">Hỗ trợ tối ưu cung đường đèo dốc</span>
            </div>

            <div className="trip-sheet-chips-grid" role="group" aria-label="Ràng buộc sức khỏe">
              {MOBILITY_CONSTRAINT_OPTIONS.map((opt) => {
                const isSelected = mobilityFlags.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className="trip-sheet-chip-btn"
                    data-selected={isSelected}
                    onClick={() => toggleMobilityFlag(opt.value)}
                  >
                    {isSelected && <Check size={14} className="trip-sheet-check" aria-hidden="true" />}
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <div className="trip-sheet-divider" />

          {/* ── 5. Ghi chú khác ── */}
          <section className="trip-sheet-section">
            <div className="trip-sheet-section-header">
              <h3 className="trip-sheet-section-title">Ghi chú khác</h3>
              <span className="trip-sheet-section-hint">Thể trạng, dị ứng hoặc yêu cầu đặc biệt</span>
            </div>

            <textarea
              id="trip-sheet-note"
              className="trip-sheet-textarea"
              placeholder="Ví dụ: có người dễ say xe nặng trên đèo Mã Pí Lèng, muốn ưu tiên nghỉ ngơi yên tĩnh..."
              rows={3}
              maxLength={200}
              value={mobilityNote}
              onChange={(e) => onMobilityNoteChange(e.target.value)}
            />
            <span className="trip-sheet-char-count">{mobilityNote.length}/200</span>
          </section>
        </div>

        {/* Sticky Sheet Footer */}
        <div className="trip-sheet-footer">
          <button
            type="button"
            className="trip-sheet-apply-btn"
            onClick={onClose}
          >
            Lưu thay đổi
          </button>
        </div>
      </div>
    </div>
  );
}
