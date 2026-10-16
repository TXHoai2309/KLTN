"use client";

import { useEffect, useRef, useState } from "react";

import type { TripProposal } from "../trip-validation/trip-proposal-contract";
import type { TripValidation } from "../trip-validation/trip-validation";
import { TripValidationPanel } from "../trip-validation/trip-validation-panel";
import { submitTripSave } from "./trip-save-client";

type SaveState = "idle" | "pending" | "success" | "failed" | "unknown";

/** Mount when a future planner can provide a proposal and its validation result. */
export function TripSavePanel({ proposal, validation, onSaved }: {
  proposal: TripProposal;
  validation: TripValidation;
  onSaved?: (tripId: string) => void;
}) {
  const signature = JSON.stringify(proposal);
  const validationSignature = JSON.stringify(validation);
  const keyRef = useRef<{ signature: string; key: string } | null>(null);
  const pendingRef = useRef<AbortController | null>(null);
  const [currentValidation, setCurrentValidation] = useState(validation);
  const [state, setState] = useState<SaveState>("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    pendingRef.current?.abort();
    setCurrentValidation(validation);
    setState("idle");
    setMessage("");
    return () => pendingRef.current?.abort();
  }, [signature, validationSignature]);

  async function confirmAndSave() {
    if (!currentValidation.canConfirm || state === "pending" || state === "success") return;
    if (keyRef.current?.signature !== signature) keyRef.current = { signature, key: crypto.randomUUID() };
    const controller = new AbortController();
    pendingRef.current = controller;
    setState("pending");
    setMessage("Đang xác nhận và lưu chuyến đi…");
    const result = await submitTripSave(proposal, keyRef.current.key, controller.signal);
    if (controller.signal.aborted) return;
    pendingRef.current = null;
    if (result.status === "SUCCESS") {
      setCurrentValidation(result.validation);
      setState("success");
      setMessage("Lưu thành công.");
      onSaved?.(result.tripId);
    } else if (result.status === "FAILED") {
      if (result.validation) setCurrentValidation(result.validation);
      setState("failed");
      setMessage(result.message);
    } else {
      setState("unknown");
      setMessage(result.message);
    }
  }

  return <div className="min-w-0 space-y-3">
    <TripValidationPanel
      validation={currentValidation}
      pending={state === "pending"}
      onConfirm={state === "success" ? undefined : confirmAndSave}
      actionLabel={state === "unknown" ? "Kiểm tra lại kết quả lưu" : "Xác nhận và lưu"}
    />
    <p role={state === "failed" ? "alert" : "status"} aria-live="polite" className="min-h-5 break-words text-sm text-foreground">{message}</p>
  </div>;
}
