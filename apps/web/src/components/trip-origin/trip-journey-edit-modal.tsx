"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, LoaderCircle, X } from "lucide-react";
import { Button } from "@KLTN/ui/components/button";
import { toast } from "sonner";
import TripJourneyEditor from "./trip-journey-editor";
import type { TripProposal } from "@/modules/trip-validation/trip-proposal-contract";
import type { TripJourney, OriginSelection } from "@/modules/trip-origin/trip-origin-contract";
import {
  minuteToTimeString,
  timeStringToMinute,
} from "@/modules/trip-origin/journey-time-utils";
import {
  previewJourneyEditClient,
  applyJourneyEditClient,
  type JourneyEditPreviewResult,
} from "@/lib/trip-journey-edit-client";
import { durationText } from "@/components/trip-planner/planner-presentation";

export interface TripJourneyEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  tripId: string;
  baseRevision?: string;
  initialJourney?: TripJourney | null;
  onSaved: () => void;
  isLegacyOptIn?: boolean;
  returnOnly?: boolean;
}

export function TripJourneyEditModal({
  isOpen,
  onClose,
  tripId,
  baseRevision = "",
  initialJourney,
  onSaved,
  isLegacyOptIn = false,
  returnOnly = false,
}: TripJourneyEditModalProps) {
  const [origin, setOrigin] = useState<OriginSelection | null>(
    initialJourney?.origin ?? null
  );
  const [departureTime, setDepartureTime] = useState<string>(
    initialJourney?.departureMinute != null
      ? minuteToTimeString(initialJourney.departureMinute)
      : ""
  );
  const [returnDeadlineTime, setReturnDeadlineTime] = useState<string>(
    initialJourney?.returnDeadlineMinute != null
      ? minuteToTimeString(initialJourney.returnDeadlineMinute)
      : ""
  );

  const [previewing, setPreviewing] = useState(false);
  const [previewResult, setPreviewResult] = useState<Extract<
    JourneyEditPreviewResult,
    { ok: true }
  > | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [isUnknown, setIsUnknown] = useState(false);

  const pendingApply = useRef<{ tripId: string; baseRevision: string; candidate: TripProposal; key: string } | null>(null);
  const applyInFlight = useRef(false);
  const [returnStart, setReturnStart] = useState<number | null>(initialJourney?.returnDepartureMinute ?? null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Reset or initialize state on open
  useEffect(() => {
    if (isOpen && !pendingApply.current) {
      setOrigin(initialJourney?.origin ?? null);
      setReturnStart(initialJourney?.returnDepartureMinute ?? null);
      setDepartureTime(
        initialJourney?.departureMinute != null
          ? minuteToTimeString(initialJourney.departureMinute)
          : ""
      );
      setReturnDeadlineTime(
        initialJourney?.returnDeadlineMinute != null
          ? minuteToTimeString(initialJourney.returnDeadlineMinute)
          : ""
      );
      setPreviewResult(null);
      setPreviewError(null);
      setApplyError(null);
      setIsUnknown(false);
    }
  }, [isOpen, initialJourney]);

  if (!isOpen) return null;

  const currentJourney: TripJourney = {
    returnDepartureMinute: returnStart,
    origin: origin ?? null,
    departureMinute: departureTime ? timeStringToMinute(departureTime) ?? null : null,
    returnDeadlineMinute: returnDeadlineTime
      ? timeStringToMinute(returnDeadlineTime) ?? null
      : null,
  };

  const isFormFilled = Boolean(
    origin &&
      origin.confirmed &&
      currentJourney.departureMinute != null &&
      currentJourney.returnDeadlineMinute != null
      && (!returnOnly || currentJourney.returnDepartureMinute != null)
  );

  const handlePreview = async () => {
    if (!isFormFilled || !baseRevision || pendingApply.current || previewing) return;
    setPreviewing(true);
    setPreviewError(null);
    setPreviewResult(null);
    setApplyError(null);

    const res = await previewJourneyEditClient(tripId, baseRevision, currentJourney);
    setPreviewing(false);

    if (res.ok) {
      setPreviewResult(res);
      if (!res.eligibleForConfirmation) {
        setPreviewError("Phương án di chuyển chưa đáp ứng thời gian hoặc ranh giới hành trình.");
      }
    } else {
      setPreviewError(res.message);
    }
  };

  const handleApply = async () => {
    if (!previewResult?.candidate || !baseRevision || applyInFlight.current) return;
    applyInFlight.current = true;
    if (!pendingApply.current) pendingApply.current = { tripId, baseRevision, candidate: structuredClone(previewResult.candidate), key: crypto.randomUUID() };
    const intent = pendingApply.current;
    setApplying(true);
    setApplyError(null);

    const res = await applyJourneyEditClient(
      intent.tripId,
      intent.baseRevision,
      intent.candidate,
      intent.key
    );
    setApplying(false);
    applyInFlight.current = false;

    if (res.status === "SUCCESS") {
      pendingApply.current = null;
      toast.success(
        isLegacyOptIn
          ? "Đã bổ sung nơi xuất phát thành công."
          : "Đã cập nhật nơi xuất phát và giờ đi/về thành công."
      );
      onSaved();
      onClose();
    } else if (res.status === "FAILED") {
      pendingApply.current = null;
      setApplyError(res.message);
      setIsUnknown(false);
    } else {
      // UNKNOWN: preserve key so retry re-sends exact same key
      setIsUnknown(true);
      setApplyError(res.message);
    }
  };

  return (
    <div
      className="trip-journey-modal-backdrop"
      role="presentation"
      onClick={() => {
        if (!applying && !isUnknown) onClose();
      }}
    >
      <div
        ref={modalRef}
        className="trip-journey-modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="journey-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="trip-journey-modal-header">
          <div>
            <h3 id="journey-modal-title" className="text-lg font-bold">
              {isLegacyOptIn ? "Bổ sung nơi xuất phát" : "Chỉnh sửa nơi & giờ xuất phát"}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Hệ thống sẽ tính toán lại lộ trình đi/về và kiểm tra tính khả thi trước khi áp dụng.
            </p>
          </div>
          <button
            type="button"
            className="trip-confirm-close"
            onClick={() => { if (!applying && !isUnknown) onClose(); }}
            disabled={applying || isUnknown}
            aria-label="Đóng"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="trip-journey-modal-body">
          <TripJourneyEditor journey={currentJourney} returnOnly={returnOnly} disabled={applying || isUnknown || previewing} onChange={next => {
            if (pendingApply.current) return;
            setOrigin(next.origin); setDepartureTime(minuteToTimeString(next.departureMinute));
            setReturnDeadlineTime(minuteToTimeString(next.returnDeadlineMinute)); setReturnStart(next.returnDepartureMinute);
            setPreviewResult(null); setPreviewError(null); setApplyError(null);
          }} />

          {/* Validation / Preview Results */}
          {previewError && (
            <div className="trip-journey-error-banner mt-4" role="alert">
              <AlertCircle size={16} aria-hidden="true" />
              <span>{previewError}</span>
            </div>
          )}

          {applyError && (
            <div className="trip-journey-error-banner mt-4" role="alert">
              <AlertCircle size={16} aria-hidden="true" />
              <div>
                <span>{applyError}</span>
                {isUnknown && (
                  <p className="text-xs mt-1">
                    Bấm <strong>&quot;Thử lại xác nhận&quot;</strong> để tiếp tục gửi lại yêu cầu với cùng khóa idempotency.
                  </p>
                )}
              </div>
            </div>
          )}

          {previewResult?.journeyPlan && (
            <div className="trip-journey-preview-box mt-4" data-testid="journey-preview-result">
              <div className="flex items-center gap-2 mb-2 font-semibold text-sm">
                <CheckCircle2 size={16} className="text-green-600" aria-hidden="true" />
                <span>Kết quả tính toán phương án mới:</span>
              </div>
              <div className="text-sm flex flex-col gap-1 text-muted-foreground">
                {previewResult.journeyPlan.totals.drivingSeconds != null && (
                  <div>
                    Thời gian chạy xe:{" "}
                    <strong>
                      {durationText(Math.ceil(previewResult.journeyPlan.totals.drivingSeconds / 60))}
                    </strong>
                  </div>
                )}
                {previewResult.journeyPlan.totals.restMinutes != null && (
                  <div>
                    Nghỉ ven đường tự động:{" "}
                    <strong>+{previewResult.journeyPlan.totals.restMinutes} phút</strong>
                  </div>
                )}
                {previewResult.journeyPlan.totals.distanceMeters != null && (
                  <div>
                    Tổng quãng đường:{" "}
                    <strong>
                      {(previewResult.journeyPlan.totals.distanceMeters / 1000).toLocaleString(
                        "vi-VN",
                        { maximumFractionDigits: 1 }
                      )}{" "}
                      km
                    </strong>
                  </div>
                )}
                <div className="text-xs mt-1 italic">
                  * Lịch trình chưa bao gồm thời gian nhận/trả phòng lưu trú.
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="trip-journey-modal-footer">
          <Button
            type="button"
            variant="outline"
            onClick={() => { if (!applying && !isUnknown) onClose(); }}
            disabled={applying || isUnknown}
          >
            Hủy bỏ
          </Button>

          {!previewResult?.eligibleForConfirmation ? (
            <Button
              type="button"
              disabled={!isFormFilled || previewing || !baseRevision}
              onClick={handlePreview}
            >
              {previewing ? (
                <>
                  <LoaderCircle size={15} className="animate-spin mr-1.5" aria-hidden="true" />
                  Đang tính phương án…
                </>
              ) : (
                "Xem trước phương án"
              )}
            </Button>
          ) : (
            <Button
              type="button"
              variant="default"
              disabled={applying}
              onClick={handleApply}
            >
              {applying ? (
                <>
                  <LoaderCircle size={15} className="animate-spin mr-1.5" aria-hidden="true" />
                  Đang lưu thay đổi…
                </>
              ) : isUnknown ? (
                "Thử lại xác nhận"
              ) : (
                "Xác nhận & Cập nhật"
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
export default TripJourneyEditModal;
