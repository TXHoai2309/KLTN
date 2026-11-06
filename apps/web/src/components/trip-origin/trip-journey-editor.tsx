"use client";

import { useId, useState } from "react";
import { AlertCircle, Clock } from "lucide-react";
import { Input } from "@KLTN/ui/components/input";
import {
  JOURNEY_MISSING_LABELS,
  missingJourneyFields,
  type TripJourney,
  type OriginSelection,
} from "@/modules/trip-origin/trip-origin-contract";
import { minuteToTimeString, timeStringToMinute } from "@/modules/trip-origin/journey-time-utils";
import OriginLocationPicker from "./origin-location-picker";

import "./trip-origin.css";

export type TripJourneyEditorProps = {
  journey: TripJourney | null | undefined;
  onChange: (nextJourney: TripJourney) => void;
  disabled?: boolean;
  returnOnly?: boolean;
};

export default function TripJourneyEditor({
  journey,
  onChange,
  disabled = false,
  returnOnly = false,
}: TripJourneyEditorProps) {
  const id = useId();
  const [showReturnStart, setShowReturnStart] = useState(false);

  const currentJourney: TripJourney = journey ?? {
    origin: null,
    departureMinute: null,
    returnDeadlineMinute: null,
    returnDepartureMinute: null,
  };

  const missing = missingJourneyFields(currentJourney, returnOnly);

  function handleOriginChange(nextOrigin: OriginSelection | null) {
    onChange({
      ...currentJourney,
      origin: nextOrigin,
    });
  }

  function handleDepartureTimeChange(timeString: string) {
    const minute = timeStringToMinute(timeString);
    onChange({
      ...currentJourney,
      departureMinute: minute,
    });
  }

  function handleReturnDeadlineChange(timeString: string) {
    const minute = timeStringToMinute(timeString);
    onChange({
      ...currentJourney,
      returnDeadlineMinute: minute,
    });
  }

  return (
    <div className="trip-journey-editor" aria-label="Nơi xuất phát và giờ đi/về">
      <OriginLocationPicker
        origin={currentJourney.origin}
        onChange={handleOriginChange}
        disabled={disabled}
      />

      <div className="trip-journey-times-grid">
        <div className="trip-journey-time-card">
          <label htmlFor={`${id}-departure-time`}>Giờ khởi hành ngày đầu (00:00 - 23:59)</label>
          <Input
            id={`${id}-departure-time`}
            type="time"
            value={minuteToTimeString(currentJourney.departureMinute)}
            disabled={disabled}
            onChange={(e) => handleDepartureTimeChange(e.target.value)}
          />
          <span className="trip-time-hint">Múi giờ Asia/Ho_Chi_Minh</span>
        </div>

        <div className="trip-journey-time-card">
          <label htmlFor={`${id}-return-deadline`}>Hạn trở về ngày cuối (00:00 - 23:59)</label>
          <Input
            id={`${id}-return-deadline`}
            type="time"
            value={minuteToTimeString(currentJourney.returnDeadlineMinute)}
            disabled={disabled}
            onChange={(e) => handleReturnDeadlineChange(e.target.value)}
          />
          <span className="trip-time-hint">Mốc giờ tối đa muốn về đến nơi xuất phát</span>
        </div>
      </div>

      {!returnOnly && <label><input type="checkbox" checked={showReturnStart || currentJourney.returnDepartureMinute != null} disabled={disabled} onChange={event => { setShowReturnStart(event.target.checked); if (!event.target.checked) onChange({ ...currentJourney, returnDepartureMinute: null }); }} /> Chọn giờ bắt đầu về nếu ngày cuối chỉ di chuyển</label>}
      {(returnOnly || showReturnStart || currentJourney.returnDepartureMinute != null) && <div className="trip-journey-time-card"><label htmlFor={`${id}-return-start`}>Giờ bắt đầu về ngày cuối chỉ di chuyển</label><Input id={`${id}-return-start`} type="time" disabled={disabled} value={minuteToTimeString(currentJourney.returnDepartureMinute)} onChange={event => onChange({ ...currentJourney, returnDepartureMinute: timeStringToMinute(event.target.value) })} /><p>Chỉ dùng khi ngày cuối không có lượt tham quan.</p></div>}
      {missing.length > 0 && (
        <div className="trip-journey-missing-list" role="status" aria-live="polite">
          <div className="flex items-center gap-1.5 font-medium text-amber-800 text-xs uppercase tracking-wide">
            <Clock className="h-3.5 w-3.5" /> Thông tin chặng đi/về cần hoàn thiện:
          </div>
          {missing.map((field) => (
            <div key={field} className="trip-journey-missing-item flex items-center gap-1">
              <span>•</span>
              <span>{JOURNEY_MISSING_LABELS[field]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

