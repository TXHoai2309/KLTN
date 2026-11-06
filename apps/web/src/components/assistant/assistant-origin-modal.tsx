"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@KLTN/ui/components/button";
import TripJourneyEditor from "@/components/trip-origin/trip-journey-editor";
import type { TripJourney, OriginSelection } from "@/modules/trip-origin/trip-origin-contract";
import {
  minuteToTimeString,
  timeStringToMinute,
} from "@/modules/trip-origin/journey-time-utils";

export interface AssistantOriginModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialJourney?: TripJourney | null;
  onConfirm: (journey: TripJourney) => void;
  returnOnly?: boolean;
}

export function AssistantOriginModal({
  isOpen,
  onClose,
  initialJourney,
  onConfirm,
  returnOnly = false,
}: AssistantOriginModalProps) {
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

  const [returnStart, setReturnStart] = useState<number | null>(initialJourney?.returnDepartureMinute ?? null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
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

  const isComplete = Boolean(
    origin &&
      origin.confirmed &&
      currentJourney.departureMinute != null &&
      currentJourney.returnDeadlineMinute != null
      && (!returnOnly || currentJourney.returnDepartureMinute != null)
  );

  const handleApply = () => {
    if (!isComplete) return;
    onConfirm(currentJourney);
  };

  return (
    <div
      className="trip-journey-modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className="trip-journey-modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="assistant-origin-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="trip-journey-modal-header">
          <div>
            <h3 id="assistant-origin-modal-title" className="text-lg font-bold">
              Chọn nơi xuất phát cho chuyến đi
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Trợ lý AI sẽ dùng điểm xuất phát và khung giờ này để tính toán toàn bộ hành trình đi/về Hà Giang.
            </p>
          </div>
          <button
            type="button"
            className="trip-confirm-close"
            onClick={onClose}
            aria-label="Đóng"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="trip-journey-modal-body">
          <TripJourneyEditor journey={currentJourney} returnOnly={returnOnly} onChange={next => { setOrigin(next.origin); setDepartureTime(minuteToTimeString(next.departureMinute)); setReturnDeadlineTime(minuteToTimeString(next.returnDeadlineMinute)); setReturnStart(next.returnDepartureMinute); }} />
        </div>

        <div className="trip-journey-modal-footer">
          <Button type="button" variant="outline" onClick={onClose}>
            Hủy bỏ
          </Button>
          <Button
            type="button"
            variant="default"
            disabled={!isComplete}
            onClick={handleApply}
          >
            Áp dụng cho Trợ lý
          </Button>
        </div>
      </div>
    </div>
  );
}
