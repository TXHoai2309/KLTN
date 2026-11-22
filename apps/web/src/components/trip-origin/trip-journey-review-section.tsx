"use client";

import { useState } from "react";
import { CheckCircle2, Clock, Edit2, MapPin, X } from "lucide-react";
import { Button } from "@KLTN/ui/components/button";
import {
  missingJourneyFields,
  type TripJourney,
} from "@/modules/trip-origin/trip-origin-contract";
import { formatMinuteLabel } from "@/modules/trip-origin/journey-time-utils";
import type { TripRequirementReviewDraft } from "@/modules/trip-requirement/trip-requirement-review";
import TripJourneyEditor from "./trip-journey-editor";

import "./trip-origin.css";

export type TripJourneyReviewSectionProps = {
  draft: TripRequirementReviewDraft;
  onJourneyChange: (nextJourney: TripJourney) => void;
  editable?: boolean;
};

export default function TripJourneyReviewSection({
  draft,
  onJourneyChange,
  editable = true,
}: TripJourneyReviewSectionProps) {
  const [isEditing, setIsEditing] = useState(false);
  const journey = draft.journey ?? null;
  const [tempJourney, setTempJourney] = useState<TripJourney>(() => ({
    origin: journey?.origin ?? null,
    departureMinute: journey?.departureMinute ?? null,
    returnDeadlineMinute: journey?.returnDeadlineMinute ?? null,
    returnDepartureMinute: journey?.returnDepartureMinute ?? null,
  }));

  const missing = missingJourneyFields(journey);
  const origin = journey?.origin;

  function handleStartEdit() {
    setTempJourney({
      origin: journey?.origin ?? null,
      departureMinute: journey?.departureMinute ?? null,
      returnDeadlineMinute: journey?.returnDeadlineMinute ?? null,
      returnDepartureMinute: journey?.returnDepartureMinute ?? null,
    });
    setIsEditing(true);
  }

  function handleSaveEdit() {
    onJourneyChange(tempJourney);
    setIsEditing(false);
  }

  function handleCancelEdit() {
    setIsEditing(false);
  }

  return (
    <div className="trip-journey-review-card" data-testid="trip-journey-review-card">
      <div className="trip-journey-review-header">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <h3 className="trip-journey-review-title">Nơi xuất phát & Lịch trình đi/về</h3>
        </div>
        {editable && !isEditing && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleStartEdit}
            className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
            data-testid="edit-journey-btn"
          >
            <Edit2 className="mr-1 h-3.5 w-3.5" /> Sửa chặng đi/về
          </Button>
        )}
      </div>

      {isEditing ? (
        <div className="flex flex-col gap-4 border-t pt-4">
          <TripJourneyEditor journey={tempJourney} onChange={setTempJourney} />
          <div className="flex items-center justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="outline" size="sm" onClick={handleCancelEdit}>
              <X className="mr-1 h-3.5 w-3.5" /> Hủy
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSaveEdit}
              className="bg-emerald-700 hover:bg-emerald-800 text-white"
            >
              Lưu thay đổi chặng
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="trip-journey-review-items">
            <div className="trip-journey-review-item">
              <span className="trip-journey-review-label">Điểm xuất phát</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="trip-journey-review-value" data-testid="journey-origin-label">
                  {origin ? origin.label : "Chưa chọn điểm xuất phát"}
                </span>
                {origin?.confirmed ? (
                  <span className="trip-origin-badge trip-origin-badge-confirmed text-xs py-0.5">
                    <CheckCircle2 className="h-3 w-3" /> Đã xác nhận
                  </span>
                ) : origin ? (
                  <span className="trip-origin-badge trip-origin-badge-unconfirmed text-xs py-0.5">
                    <Clock className="h-3 w-3" /> Chưa xác nhận ghim
                  </span>
                ) : (
                  <span className="trip-origin-badge trip-origin-badge-empty text-xs py-0.5">
                    Chưa có
                  </span>
                )}
              </div>
              {origin && (
                <span className="text-xs text-muted-foreground">
                  Tọa độ: {origin.latitude.toFixed(4)}, {origin.longitude.toFixed(4)} ({origin.source})
                </span>
              )}
            </div>

            <div className="trip-journey-review-item">
              <span className="trip-journey-review-label">Giờ đi ngày đầu</span>
              <span className="trip-journey-review-value" data-testid="journey-departure-time">
                {formatMinuteLabel(journey?.departureMinute)}
              </span>
              <span className="text-xs text-muted-foreground">Giờ xuất phát chuyến đi</span>
            </div>

            <div className="trip-journey-review-item">
              <span className="trip-journey-review-label">Hạn về ngày cuối</span>
              <span className="trip-journey-review-value" data-testid="journey-return-deadline">
                {formatMinuteLabel(journey?.returnDeadlineMinute)}
              </span>
              <span className="text-xs text-muted-foreground">Mốc tối đa có mặt tại điểm xuất phát</span>
            </div>
          </div>

          {missing.length > 0 && (
            <div className="trip-journey-missing-list" role="status">
              <div className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                Lưu ý: Chưa hoàn thành đủ thông tin chặng đi/về
              </div>
              <p className="text-xs text-amber-700 dark:text-amber-400 m-0">
                Đề xuất lập lịch hiện tại chỉ mang tính sơ bộ (preliminary proposal). Bạn cần chọn và xác
                nhận điểm xuất phát cũng như giờ đi/về trước khi có thể xác nhận và lưu chuyến đi chính thức.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

