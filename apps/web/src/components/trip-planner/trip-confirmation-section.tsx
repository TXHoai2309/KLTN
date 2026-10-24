"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { PlannerResult } from "@/modules/trip-planner/planner-contract";
import { toSaveProposal } from "@/modules/trip-save/trip-save-adapter";
import { requestTripValidation } from "@/modules/trip-save/trip-save-client";
import { TripSavePanel, type SaveState } from "@/modules/trip-save/trip-save-panel";
import type { TripValidation } from "@/modules/trip-validation/trip-validation";

type PreviewState =
  | { signature: string; kind: "loading" }
  | { signature: string; kind: "ready"; validation: TripValidation }
  | { signature: string; kind: "error"; message: string };

import { CalendarDays } from "lucide-react";
import { vietnamDateOf } from "@/modules/trip-requirement/trip-requirement-readiness";

export function TripConfirmationSection({
  result,
  onSaved,
  onSaveStateChange,
  onUpdateStartDate,
  secondaryActions,
  disabled = false,
}: {
  result: PlannerResult;
  onSaved: (tripId: string) => void;
  onSaveStateChange?: (state: SaveState) => void;
  onUpdateStartDate?: (newDate: string) => void;
  secondaryActions?: ReactNode;
  disabled?: boolean;
}) {
  const proposal = useMemo(() => toSaveProposal(result), [result]);
  const signature = JSON.stringify(proposal);
  const [attempt, setAttempt] = useState(0);
  const [preview, setPreview] = useState<PreviewState>({ signature, kind: "loading" });
  const [selectedDate, setSelectedDate] = useState("");

  useEffect(() => {
    if (!proposal) return;
    const controller = new AbortController();
    setPreview({ signature, kind: "loading" });
    void requestTripValidation(proposal, controller.signal).then(response => {
      if (controller.signal.aborted) return;
      setPreview(response.ok
        ? { signature, kind: "ready", validation: response.validation }
        : { signature, kind: "error", message: response.message });
    });
    return () => controller.abort();
  }, [proposal, signature, attempt]);

  return <section className="planner-confirmation" aria-labelledby="planner-confirmation-title">
    <h3 id="planner-confirmation-title">Xác nhận chuyến đi</h3>
    {!proposal ? (
      <div className="planner-confirmation-guidance" role="status">
        {!result.requirement.startDate ? (
          <div className="planner-date-prompt">
            <div className="planner-date-prompt-text">
              <CalendarDays size={20} className="planner-date-prompt-icon" aria-hidden="true" />
              <div>
                <strong>Chọn ngày khởi hành để mở khóa lưu chuyến đi</strong>
                <p>Chưa thể xác nhận và lưu phương án này vì chưa có ngày bắt đầu. Hãy chọn ngày khởi hành để đối chiếu giờ mở cửa thực tế và lưu chính thức vào tài khoản của bạn.</p>
              </div>
            </div>
            {onUpdateStartDate && (
              <div className="planner-date-prompt-controls">
                <input
                  type="date"
                  min={vietnamDateOf(new Date())}
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="planner-date-input"
                  aria-label="Chọn ngày bắt đầu chuyến đi"
                />
                <button
                  type="button"
                  className="planner-primary planner-date-apply-btn"
                  disabled={!selectedDate || disabled}
                  onClick={() => {
                    if (selectedDate) onUpdateStartDate(selectedDate);
                  }}
                >
                  Áp dụng ngày
                </button>
              </div>
            )}
          </div>
        ) : (
          <p>Chưa thể xác nhận và lưu phương án này. Hãy bổ sung ngày đi hoặc điều chỉnh các mục chưa đáp ứng, rồi tạo lại đề xuất.</p>
        )}
      </div>
    )
      : preview.signature !== signature || preview.kind === "loading" ? <p role="status" aria-live="polite">Đang kiểm tra bốn điều kiện xác nhận trên dữ liệu hiện hành…</p>
      : preview.kind === "error" ? <div role="alert"><p>{preview.message}</p><button type="button" className="planner-primary" onClick={() => setAttempt(value => value + 1)}>Kiểm tra lại</button></div>
      : <TripSavePanel key={signature} proposal={proposal} validation={preview.validation} onSaved={onSaved} onStateChange={onSaveStateChange} secondaryActions={secondaryActions} disabled={disabled} />}
    {(!proposal || preview.signature !== signature || preview.kind !== "ready") && <div className="flex flex-wrap items-center justify-end gap-3">{secondaryActions}<button type="button" className="planner-primary" disabled>Lưu chuyến đi</button></div>}
  </section>;
}
