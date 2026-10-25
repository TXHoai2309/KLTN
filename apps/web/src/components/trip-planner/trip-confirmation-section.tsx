"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Calendar, LoaderCircle, RotateCcw, X } from "lucide-react";
import type { PlannerResult } from "@/modules/trip-planner/planner-contract";
import { toSaveProposal } from "@/modules/trip-save/trip-save-adapter";
import { requestTripValidation, submitTripSave } from "@/modules/trip-save/trip-save-client";
import { isTripSaveNavigationLocked, type SaveState } from "@/modules/trip-save/trip-save-state";
import type { TripValidation } from "@/modules/trip-validation/trip-validation";
import { vietnamDateOf } from "@/modules/trip-requirement/trip-requirement-readiness";
import { formatVietnameseDate } from "@/lib/date-only";

type PreviewState =
  | { signature: string; kind: "loading" }
  | { signature: string; kind: "ready"; validation: TripValidation }
  | { signature: string; kind: "error"; message: string };

export function TripConfirmationSection({
  result,
  onSaved,
  onSaveStateChange,
  onUpdateStartDate,
  secondaryActions,
  onBack,
  onRegenerate,
  disabled = false,
}: {
  result: PlannerResult;
  onSaved: (tripId: string) => void;
  onSaveStateChange?: (state: SaveState) => void;
  onUpdateStartDate?: (newDate: string) => void;
  secondaryActions?: ReactNode;
  onBack?: () => void;
  onRegenerate?: () => void;
  disabled?: boolean;
}) {
  const proposal = useMemo(() => toSaveProposal(result), [result]);
  const signature = JSON.stringify(proposal);
  const [attempt, setAttempt] = useState(0);
  const [preview, setPreview] = useState<PreviewState>({ signature, kind: "loading" });
  const [selectedDate, setSelectedDate] = useState("");
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const keyRef = useRef<{ signature: string; key: string } | null>(null);
  const pendingRef = useRef<AbortController | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!proposal) return;
    const controller = new AbortController();
    setPreview({ signature, kind: "loading" });
    void requestTripValidation(proposal, controller.signal).then((response) => {
      if (controller.signal.aborted) return;
      setPreview(
        response.ok
          ? { signature, kind: "ready", validation: response.validation }
          : { signature, kind: "error", message: response.message },
      );
    });
    return () => controller.abort();
  }, [proposal, signature, attempt]);

  // Click outside to close date popover
  useEffect(() => {
    if (!datePopoverOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setDatePopoverOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [datePopoverOpen]);

  const isLocked = isTripSaveNavigationLocked(saveState);

  async function handleConfirmAndSave() {
    if (
      disabled ||
      !proposal ||
      !proposal.startDate ||
      pendingRef.current ||
      saveState === "pending" ||
      saveState === "success"
    ) {
      return;
    }
    if (preview.kind !== "ready" || !preview.validation.canConfirm) return;

    if (keyRef.current?.signature !== signature) {
      keyRef.current = { signature, key: crypto.randomUUID() };
    }
    const controller = new AbortController();
    pendingRef.current = controller;
    setSaveState("pending");
    onSaveStateChange?.("pending");
    setSaveMessage("Đang xác nhận và lưu chuyến đi…");

    const response = await submitTripSave(proposal, keyRef.current.key, controller.signal);
    if (controller.signal.aborted) return;
    pendingRef.current = null;

    if (response.status === "SUCCESS") {
      setSaveState("success");
      onSaveStateChange?.("success");
      setSaveMessage("Lưu chuyến đi thành công.");
      onSaved(response.tripId);
    } else if (response.status === "FAILED") {
      setSaveState("failed");
      onSaveStateChange?.("failed");
      setSaveMessage(response.message);
    } else {
      setSaveState("unknown");
      onSaveStateChange?.("unknown");
      setSaveMessage(response.message);
    }
  }

  const hasStartDate = Boolean(result.requirement.startDate);
  const isValidationReady = preview.signature === signature && preview.kind === "ready";
  const canConfirm = isValidationReady && preview.validation.canConfirm;
  const canSave = Boolean(proposal) && canConfirm && !disabled && saveState !== "pending" && saveState !== "success";

  const totalStops = result.days.reduce((acc, d) => acc + d.stops.length, 0);
  const endDate = result.days.at(-1)?.date;
  const dateSummary = result.requirement.startDate
    ? `${formatVietnameseDate(result.requirement.startDate)}${endDate ? ` – ${formatVietnameseDate(endDate)}` : ""}`
    : null;

  return (
    <footer className="planner-sticky-bar" aria-label="Thao tác lưu và điều chỉnh lịch trình">
      <div className="planner-bar-content">
        {/* Left Side: Summary / Date prompt / Guidance */}
        <div className="planner-bar-left">
          <div className="planner-bar-trip-info">
            <strong>{result.requirement.durationDays} ngày · {totalStops} điểm</strong>
            {dateSummary && (
              <>
                <span className="planner-bar-dot">·</span>
                <span className="planner-bar-date-text">{dateSummary}</span>
              </>
            )}
          </div>

          {!hasStartDate ? (
            <div className="planner-date-prompt-compact" ref={popoverRef}>
              <span className="planner-date-missing-hint">Chưa chọn ngày khởi hành</span>
              <button
                type="button"
                className="planner-pick-date-btn"
                onClick={() => setDatePopoverOpen((open) => !open)}
              >
                <Calendar size={13} aria-hidden="true" />
                <span>Chọn ngày</span>
              </button>

              {/* Accessible text for server tests */}
              <span className="sr-only">
                Chưa thể xác nhận và lưu phương án này. Chọn ngày khởi hành để lưu chuyến đi.
              </span>

              {/* Floating Date Popover */}
              {datePopoverOpen && (
                <div className="planner-date-popover" role="dialog" aria-label="Chọn ngày bắt đầu chuyến đi">
                  <div className="planner-date-popover-head">
                    <strong>Chọn ngày khởi hành</strong>
                    <button
                      type="button"
                      className="planner-date-popover-close"
                      onClick={() => setDatePopoverOpen(false)}
                      aria-label="Đóng"
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  </div>
                  <div className="planner-date-popover-body">
                    <input
                      type="date"
                      min={vietnamDateOf(new Date())}
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="planner-date-input"
                      aria-label="Ngày bắt đầu chuyến đi"
                    />
                    <button
                      type="button"
                      className="planner-date-apply-btn"
                      disabled={!selectedDate || disabled}
                      onClick={() => {
                        if (selectedDate && onUpdateStartDate) {
                          onUpdateStartDate(selectedDate);
                          setDatePopoverOpen(false);
                        }
                      }}
                    >
                      Áp dụng
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : preview.signature !== signature || preview.kind === "loading" ? (
            <span className="sr-only" role="status" aria-live="polite">
              Đang kiểm tra bốn điều kiện xác nhận trên dữ liệu hiện hành…
            </span>
          ) : saveMessage ? (
            <span
              className={`planner-bar-msg ${saveState === "failed" ? "planner-save-error" : ""}`}
              role={saveState === "failed" ? "alert" : "status"}
              aria-live="polite"
            >
              {saveMessage}
            </span>
          ) : null}
        </div>

        {/* Right Side: Action buttons with strict hierarchy */}
        <div className="planner-bar-actions">
          {secondaryActions ? (
            secondaryActions
          ) : (
            <>
              {onBack && (
                <button
                  type="button"
                  className="planner-btn-tertiary"
                  onClick={onBack}
                  disabled={disabled || isLocked}
                >
                  Chỉnh nhu cầu
                </button>
              )}
              {onRegenerate && (
                <button
                  type="button"
                  className="planner-btn-secondary"
                  onClick={onRegenerate}
                  disabled={disabled || isLocked}
                >
                  <RotateCcw size={14} aria-hidden="true" />
                  <span>{disabled ? "Đang tạo…" : "Tạo lại"}</span>
                </button>
              )}
            </>
          )}

          <button
            type="button"
            className="planner-primary planner-btn-primary"
            disabled={!canSave}
            onClick={handleConfirmAndSave}
            aria-busy={saveState === "pending"}
          >
            {saveState === "pending" && (
              <LoaderCircle className="trip-spinner" size={14} aria-hidden="true" />
            )}
            <span>
              {saveState === "pending"
                ? "Đang lưu…"
                : saveState === "unknown"
                  ? "Kiểm tra lại kết quả lưu"
                  : "Lưu chuyến đi"}
            </span>
          </button>
        </div>
      </div>
    </footer>
  );
}
