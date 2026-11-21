"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import type { TripProposal } from "../trip-validation/trip-proposal-contract";
import type { TripValidation } from "../trip-validation/trip-validation";
import { TripValidationPanel } from "../trip-validation/trip-validation-panel";
import { submitTripSave } from "./trip-save-client";

import type { SaveState } from "./trip-save-state";
export type { SaveState } from "./trip-save-state";

/** Save only a validated proposal; the planner screen supplies the current preview. */
export function TripSavePanel({ proposal, validation, onSaved, onStateChange, secondaryActions, disabled = false }: {
  proposal: TripProposal;
  validation: TripValidation;
  onSaved?: (tripId: string) => void;
  onStateChange?: (state: SaveState) => void;
  secondaryActions?: ReactNode;
  disabled?: boolean;
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
    onStateChange?.("idle");
    setMessage("");
    return () => pendingRef.current?.abort();
  }, [signature, validationSignature]);

  async function confirmAndSave() {
    if (disabled || !proposal.startDate || pendingRef.current || !currentValidation.canConfirm || state === "pending" || state === "success") return;
    if (keyRef.current?.signature !== signature) keyRef.current = { signature, key: crypto.randomUUID() };
    const controller = new AbortController();
    pendingRef.current = controller;
    setState("pending");
    onStateChange?.("pending");
    setMessage("Đang xác nhận và lưu chuyến đi…");
    const result = await submitTripSave(proposal, keyRef.current.key, controller.signal);
    if (controller.signal.aborted) return;
    pendingRef.current = null;
    if (result.status === "SUCCESS") {
      setCurrentValidation(result.validation);
      setState("success");
      onStateChange?.("success");
      setMessage("Lưu thành công.");
      onSaved?.(result.tripId);
    } else if (result.status === "FAILED") {
      if (result.validation) setCurrentValidation(result.validation);
      setState("failed");
      onStateChange?.("failed");
      setMessage(result.message);
    } else {
      setState("unknown");
      onStateChange?.("unknown");
      setMessage(result.message);
    }
  }

  return <div className="min-w-0 space-y-3">
    <TripValidationPanel
      validation={currentValidation}
      pending={state === "pending"}
      onConfirm={disabled || !proposal.startDate || state === "success" ? undefined : confirmAndSave}
      secondaryActions={secondaryActions}
      actionLabel={state === "unknown" ? "Kiểm tra lại kết quả" : "Lưu chuyến đi"}
    />
    <p role={state === "failed" ? "alert" : "status"} aria-live="polite" className="min-h-5 break-words text-sm text-foreground">{message}</p>
  </div>;
}
