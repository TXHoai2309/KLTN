"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { PlannerResult } from "@/modules/trip-planner/planner-contract";
import { chatSaveProposal, createChatSaveController, type ChatSaveView } from "@/modules/tripsage-chat/tripsage-chat-save";
import type { SaveState } from "@/modules/trip-save/trip-save-state";

/** Save button under a chat itinerary. Rendered only when every check is PASS; the server re-validates before writing. */
export function TripsageSaveSection({ result, onStateChange }: { result: PlannerResult; onStateChange?: (state: SaveState) => void }) {
  const controllerRef = useRef<ReturnType<typeof createChatSaveController> | null>(null);
  controllerRef.current ??= createChatSaveController();
  const [view, setView] = useState<ChatSaveView>({ state: "idle", message: "", tripId: null });
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  if (!chatSaveProposal(result)) {
    return <p role="note" className="assistant-muted">Lịch này có mục chưa được kiểm tra hoặc chưa đạt, nên chưa thể lưu.</p>;
  }
  const controller = controllerRef.current;

  async function save() {
    if (controller.view.state === "pending" || controller.view.state === "success") return;
    abortRef.current = new AbortController();
    setView({ state: "pending", message: "Đang lưu hành trình…", tripId: null });
    onStateChange?.("pending");
    const next = await controller.save(result, abortRef.current.signal);
    setView({ ...next });
    onStateChange?.(next.state);
  }

  return (
    <div className="tripsage-save" aria-live="polite">
      {view.state === "success" && view.tripId ? (
        <p role="status">Đã lưu hành trình. <Link href={`/trips/${encodeURIComponent(view.tripId)}`}>Mở chuyến đi</Link></p>
      ) : (
        <>
          <button type="button" className="assistant-save-button" disabled={view.state === "pending"} onClick={() => void save()}>
            {view.state === "pending" ? "Đang lưu…" : view.state === "unknown" ? "Kiểm tra lại kết quả lưu" : "Lưu hành trình"}
          </button>
          {view.state === "idle" && <p role="note" className="assistant-muted">Lịch trình chưa được lưu.</p>}
        </>
      )}
      {view.state === "failed" && <p role="alert" style={{ color: "#b42318" }}>{view.message}</p>}
      {view.state === "unknown" && <p role="status">{view.message}</p>}
    </div>
  );
}
