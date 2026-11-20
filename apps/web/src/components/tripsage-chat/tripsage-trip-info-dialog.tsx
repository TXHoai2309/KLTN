"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Button } from "@KLTN/ui/components/button";
import { Input } from "@KLTN/ui/components/input";
import { Label } from "@KLTN/ui/components/label";

import TripJourneyEditor from "@/components/trip-origin/trip-journey-editor";
import { VietnameseDateInput } from "@/components/vietnamese-date-input";
import { JOURNEY_MISSING_LABELS, missingJourneyFields, type TripJourney } from "@/modules/trip-origin/trip-origin-contract";
import { INTEREST_OPTIONS, MAX_DURATION_DAYS, MIN_DURATION_DAYS, TRANSPORT_OPTIONS, type TripInterest, type TripTransport } from "@/modules/trip-requirement/trip-requirement-contract";
import { draftFromRequirement, validateRequirementDraft, type TripsageRequirement, type TripsageRequirementDraft } from "@/modules/tripsage-chat/tripsage-chat-context";

/** Confirm is allowed only with a valid shared-rule requirement and a confirmed origin with both clocks (KLTN `missingJourneyFields`). */
export function canConfirmTripInfo(draft: TripsageRequirementDraft, journey: TripJourney | null): boolean {
  return validateRequirementDraft(draft).ok && missingJourneyFields(journey).length === 0;
}

export type TripsageTripInfoDialogProps = {
  open: boolean;
  requirement: TripsageRequirement | null;
  journey: TripJourney | null;
  onClose: () => void;
  onConfirm: (requirement: TripsageRequirement, journey: TripJourney) => void;
};

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** One-page modal collecting everything the planner needs. Mounted only while open, so each opening starts from the saved values. */
export function TripsageTripInfoDialog(props: TripsageTripInfoDialogProps) {
  return props.open ? <DialogBody {...props} /> : null;
}

function DialogBody({ requirement, journey: initialJourney, onClose, onConfirm }: TripsageTripInfoDialogProps) {
  const titleId = useId(); const descId = useId();
  const [draft, setDraft] = useState<TripsageRequirementDraft>(() => draftFromRequirement(requirement));
  const [journey, setJourney] = useState<TripJourney | null>(initialJourney);
  const panel = useRef<HTMLDivElement>(null);

  // Focus moves into the dialog, the page behind does not scroll, and focus returns to the opener on close.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => { document.body.style.overflow = previousOverflow; opener?.focus?.(); };
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { event.stopPropagation(); onClose(); return; }
    if (event.key !== "Tab" || !panel.current) return;
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(item => item.offsetParent !== null || item === document.activeElement);
    if (!items.length) return;
    const first = items[0]!; const last = items.at(-1)!;
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  const checked = validateRequirementDraft(draft);
  const journeyMissing = missingJourneyFields(journey);
  const ready = checked.ok && journeyMissing.length === 0;
  const toggleInterest = (value: TripInterest) => setDraft(current => ({ ...current, interests: current.interests.includes(value) ? current.interests.filter(item => item !== value) : [...current.interests, value] }));
  const confirm = () => { if (checked.ok && journeyMissing.length === 0 && journey) onConfirm(checked.requirement, journey); };

  return (
    <div className="trip-journey-modal-backdrop" role="presentation" onClick={onClose}>
      <div ref={panel} className="trip-journey-modal-content" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descId} tabIndex={-1} lang="vi" onClick={event => event.stopPropagation()} onKeyDown={onKeyDown}>
        <div className="trip-journey-modal-header">
          <div>
            <h3 id={titleId} className="text-lg font-bold">Thông tin chuyến đi</h3>
            <p id={descId} className="text-xs text-muted-foreground mt-0.5">Điền một lần, trợ lý AI sẽ lập hành trình ngay rồi bạn có thể hỏi đáp và chỉnh sửa trong khung chat.</p>
          </div>
          <button type="button" className="trip-confirm-close" onClick={onClose} aria-label="Đóng"><X size={18} aria-hidden="true" /></button>
        </div>

        <div className="trip-journey-modal-body">
          <fieldset className="grid gap-2">
            <legend className="text-sm font-semibold">Phương tiện</legend>
            <div className="flex gap-4">
              {TRANSPORT_OPTIONS.map(option => (
                <label key={option.value} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="tripsage-transport" value={option.value} checked={draft.transport === option.value} onChange={() => setDraft(current => ({ ...current, transport: option.value as TripTransport }))} />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor={`${titleId}-days`}>Số ngày</Label>
              <Input id={`${titleId}-days`} type="number" inputMode="numeric" min={MIN_DURATION_DAYS} max={MAX_DURATION_DAYS} step={1} placeholder={`${MIN_DURATION_DAYS}-${MAX_DURATION_DAYS}`} value={draft.durationDays} aria-invalid={Boolean(draft.durationDays && !checked.ok && checked.errors.durationDays)} onChange={event => setDraft(current => ({ ...current, durationDays: event.target.value }))} />
              {draft.durationDays && !checked.ok && checked.errors.durationDays && <p role="alert" className="text-xs text-destructive">{checked.errors.durationDays}</p>}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${titleId}-start`}>Ngày bắt đầu</Label>
              <VietnameseDateInput id={`${titleId}-start`} value={draft.startDate} onChange={value => setDraft(current => ({ ...current, startDate: value }))} />
            </div>
          </div>

          <fieldset className="grid gap-2">
            <legend className="text-sm font-semibold">Sở thích</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {INTEREST_OPTIONS.map(option => (
                <label key={option.value} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={draft.interests.includes(option.value)} onChange={() => toggleInterest(option.value)} />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>

          <section className="grid gap-2" aria-label="Điểm xuất phát">
            <h4 className="text-sm font-semibold">Điểm xuất phát và giờ giấc</h4>
            <TripJourneyEditor journey={journey} onChange={setJourney} />
          </section>

          {!ready && (
            <p role="status" className="text-xs text-muted-foreground">
              Còn thiếu: {[...(checked.ok ? [] : Object.values(checked.errors)), ...journeyMissing.map(field => JOURNEY_MISSING_LABELS[field])].join(" ")}
            </p>
          )}
        </div>

        <div className="trip-journey-modal-footer">
          <Button type="button" variant="outline" onClick={onClose}>Đóng</Button>
          <Button type="button" variant="default" disabled={!ready} onClick={confirm}>Xác nhận và lập hành trình</Button>
        </div>
      </div>
    </div>
  );
}
