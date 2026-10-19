"use client";

import { useEffect, useMemo, useState } from "react";

import type { PlannerResult } from "@/modules/trip-planner/planner-contract";
import { toSaveProposal } from "@/modules/trip-save/trip-save-adapter";
import { requestTripValidation } from "@/modules/trip-save/trip-save-client";
import { TripSavePanel, type SaveState } from "@/modules/trip-save/trip-save-panel";
import type { TripValidation } from "@/modules/trip-validation/trip-validation";

type PreviewState =
  | { signature: string; kind: "loading" }
  | { signature: string; kind: "ready"; validation: TripValidation }
  | { signature: string; kind: "error"; message: string };

export function TripConfirmationSection({ result, onSaved, onSaveStateChange }: { result: PlannerResult; onSaved: (tripId: string) => void; onSaveStateChange?: (state: SaveState) => void }) {
  const proposal = useMemo(() => toSaveProposal(result), [result]);
  const signature = JSON.stringify(proposal);
  const [attempt, setAttempt] = useState(0);
  const [preview, setPreview] = useState<PreviewState>({ signature, kind: "loading" });

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
    {!proposal ? <p role="status">Chưa thể xác nhận và lưu phương án này. Hãy bổ sung ngày đi hoặc điều chỉnh các mục chưa đáp ứng, rồi tạo lại đề xuất.</p>
      : preview.signature !== signature || preview.kind === "loading" ? <p role="status" aria-live="polite">Đang kiểm tra bốn điều kiện xác nhận trên dữ liệu hiện hành…</p>
      : preview.kind === "error" ? <div role="alert"><p>{preview.message}</p><button type="button" className="planner-primary" onClick={() => setAttempt(value => value + 1)}>Kiểm tra lại</button></div>
      : <TripSavePanel key={signature} proposal={proposal} validation={preview.validation} onSaved={onSaved} onStateChange={onSaveStateChange} />}
  </section>;
}
