"use client";

import { useCallback, useEffect, useId, useRef, type RefObject } from "react";
import { X } from "lucide-react";
import TripReviewScreen, { type TripReviewScreenProps } from "./trip-review-screen";

/** The existing review/check contract in a native modal, before entering the planner. */
type TripReviewDialogProps = Omit<TripReviewScreenProps, "embedded" | "headingRef" | "titleId" | "onDraftChange"> & {
  returnFocusRef?: RefObject<HTMLElement | null>;
};

export default function TripReviewDialog({ returnFocusRef, ...props }: TripReviewDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const latestDraft = useRef(props.draft);
  const confirmed = useRef(false);
  const titleId = useId();
  const trackDraft = useCallback<NonNullable<TripReviewScreenProps["onDraftChange"]>>(draft => {
    latestDraft.current = draft;
  }, []);

  useEffect(() => {
    const trigger = returnFocusRef?.current ?? document.activeElement;
    const dialog = dialogRef.current;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    headingRef.current?.focus();
    return () => {
      dialog?.close();
      document.body.style.overflow = originalOverflow;
      if (!confirmed.current && trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, [returnFocusRef]);

  function close() {
    props.onBackToForm(latestDraft.current);
  }

  return <dialog
    ref={dialogRef}
    className="trip-review-dialog"
    aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); close(); }}
    onKeyDown={event => {
      if (event.key !== "Tab") return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      )).filter(element => element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === headingRef.current)) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }}
  >
    <button type="button" className="trip-review-dialog-close" aria-label="Đóng kiểm tra, quay lại biểu mẫu" onClick={close}>
      <X size={20} aria-hidden="true" />
    </button>
    <TripReviewScreen
      {...props}
      embedded
      titleId={titleId}
      headingRef={headingRef}
      onDraftChange={trackDraft}
      onConfirmed={(snapshot, draft) => {
        confirmed.current = true;
        props.onConfirmed?.(snapshot, draft);
      }}
    />
  </dialog>;
}
