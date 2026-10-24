"use client";

import { useEffect, useRef } from "react";
import { ArrowRight, AlertCircle, LoaderCircle, X } from "lucide-react";
import {
  INTEREST_OPTIONS,
  type CompanionType,
  type MobilityConstraint,
  type TripInterest,
  type TripPace,
  type TripTransport,
} from "@/modules/trip-requirement/trip-requirement-contract";
import { formatVietnameseDate } from "@/lib/date-only";

export type TripConfirmationDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isSubmitting?: boolean;
  error?: string | null;

  durationDays: string;
  transport: TripTransport | "";
  startDate: string;

  companionType: CompanionType | "";
  companionGroupSize: string;
  interests: TripInterest[];
  pace: TripPace | "";
  mobilityFlags: MobilityConstraint[];
  mobilityNote: string;
};

export default function TripConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  isSubmitting = false,
  error = null,
  durationDays,
  transport,
  startDate,
  companionType,
  companionGroupSize,
  interests,
  pace,
  mobilityFlags,
  mobilityNote,
}: TripConfirmationDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Lock body scroll and handle Escape key
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, isSubmitting, onClose]);

  // Focus dialog on open
  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Format Transport Label
  const transportLabel =
    transport === "MOTORCYCLE" ? "Xe máy" : transport === "CAR" ? "Ô tô" : transport || "Chưa chọn";

  // Format Date Label
  const dateLabel = startDate ? `Khởi hành ${formatVietnameseDate(startDate)}` : "Chưa chốt ngày";

  // Compute Personalization Summary Tags
  const personalizationTags: string[] = [];
  if (companionType === "SOLO") personalizationTags.push("Một mình");
  else if (companionType === "COUPLE") personalizationTags.push("Cặp đôi");
  else if (companionType === "FAMILY") personalizationTags.push(`Gia đình (${companionGroupSize || "2"} người)`);
  else if (companionType === "FRIENDS") personalizationTags.push(`Bạn bè (${companionGroupSize || "2"} người)`);
  else if (companionType === "OTHER") personalizationTags.push(`Khác (${companionGroupSize || "2"} người)`);

  for (const interest of interests) {
    const opt = INTEREST_OPTIONS.find((o) => o.value === interest);
    if (opt) personalizationTags.push(opt.label);
  }

  if (pace === "RELAXED") personalizationTags.push("Thư thả");
  else if (pace === "MODERATE") personalizationTags.push("Vừa phải");
  else if (pace === "PACKED") personalizationTags.push("Nhiều trải nghiệm");

  if (mobilityFlags.length > 0) {
    personalizationTags.push(`${mobilityFlags.length} lưu ý sức khỏe`);
  }

  if (mobilityNote.trim()) {
    personalizationTags.push("Có ghi chú");
  }

  const hasPersonalization = personalizationTags.length > 0;
  const personalizationSummary = personalizationTags.join(" · ");

  return (
    <div
      className="trip-confirm-backdrop"
      onClick={() => {
        if (!isSubmitting) onClose();
      }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        className="trip-confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="trip-confirm-dialog-title"
        aria-describedby="trip-confirm-dialog-desc"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="trip-confirm-header">
          <h2 id="trip-confirm-dialog-title" className="trip-confirm-title">
            Sẵn sàng tạo hành trình
          </h2>
          <button
            type="button"
            className="trip-confirm-close"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Đóng"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="trip-confirm-body">
          <p id="trip-confirm-dialog-desc" className="trip-confirm-desc">
            AI sẽ dựa trên những lựa chọn của bạn để sắp xếp một lịch trình Hà Giang phù hợp.
          </p>

          {/* Recap Card */}
          <div className="trip-confirm-recap">
            <span className="trip-confirm-recap-eyebrow">CHUYẾN ĐI CỦA BẠN</span>
            <div className="trip-confirm-recap-main">
              <span className="trip-confirm-recap-primary">
                {durationDays} ngày · {transportLabel}
              </span>
              <span className="trip-confirm-recap-secondary">{dateLabel}</span>
            </div>

            <div className="trip-confirm-recap-divider" />

            {hasPersonalization ? (
              <div className="trip-confirm-personalization">{personalizationSummary}</div>
            ) : (
              <div className="trip-confirm-personalization trip-confirm-muted">
                Chưa thêm tùy chọn cá nhân hóa.
              </div>
            )}
          </div>

          <p className="trip-confirm-hint">
            Bạn vẫn có thể chỉnh sửa lịch trình sau khi AI tạo xong.
          </p>

          {error && (
            <div className="trip-confirm-error" role="alert">
              <AlertCircle size={16} aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer CTAs */}
        <div className="trip-confirm-footer">
          <button
            type="button"
            className="trip-confirm-secondary-btn"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Quay lại chỉnh sửa
          </button>

          <button
            type="button"
            className="trip-confirm-primary-btn"
            onClick={onConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <LoaderCircle size={16} className="trip-spinner" aria-hidden="true" />
                <span>Đang chuẩn bị…</span>
              </>
            ) : (
              <>
                <span>Tạo bằng AI</span>
                <ArrowRight size={16} aria-hidden="true" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
