"use client";
import React, { useEffect, useRef, useState, type RefObject } from "react";
import DestinationVisibilitySwitch from "./destination-visibility-switch";
import { toast } from "sonner";
import type { DestinationDto } from "@/modules/destination/destination-contract";
import { changeDestinationVisibility, loadDestination } from "@/lib/destination-client";
import { createIdempotencyKey } from "@/lib/mutation-client";
import { claimSubmission, releaseSubmission } from "@/lib/auth-submission-guard";
import { authorizationFeedback } from "@/lib/authorization-feedback";

type Item = Pick<DestinationDto, "id" | "name" | "visibility">;
type Attempt = Item & { key: string; target: DestinationDto["visibility"] };

/** One controller per page, shared by desktop/mobile actions and detail-save lock. */
export function useDestinationVisibility(onConfirmed: (dto: DestinationDto) => void, sharedLock?: RefObject<boolean>) {
  const ownLock = useRef(false);
  const lock = sharedLock ?? ownLock;
  const attempt = useRef<Attempt | null>(null);
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [confirmation, setConfirmation] = useState<Item | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { if (confirmation) dialog.current?.showModal(); }, [confirmation]);

  async function execute(item?: Item) {
    if (!claimSubmission(lock)) return;
    setPending(true);
    try {
      if (!attempt.current && item) attempt.current = { ...item, key: createIdempotencyKey(), target: item.visibility === "HIDDEN" ? "VISIBLE" : "HIDDEN" };
      const current = attempt.current;
      if (!current) return;
      // A current read is useful for reconciliation but cannot prove this write succeeded.
      if (uncertain) await loadDestination(current.id);
      const result = await changeDestinationVisibility(current.id, current.target, current.key);
      if (result.status === "SUCCESS") {
        onConfirmed(result.data);
        setUncertain(false); attempt.current = null;
        toast.success(current.target === "VISIBLE" ? "Đã hiển thị điểm đến." : "Đã ẩn điểm đến.", { position: "bottom-right" });
      } else if (result.status === "FAILED") {
        setUncertain(false); attempt.current = null;
        toast.error(authorizationFeedback(result.httpStatus) ?? "Không thể đổi trạng thái. Trạng thái trước đó được giữ nguyên.", { position: "bottom-right" });
      } else {
        setUncertain(true);
        toast.warning("Chưa xác định kết quả đổi trạng thái.", { position: "bottom-right", description: "Giữ nguyên thao tác và thử xác nhận lại." });
      }
    } catch {
      setUncertain(true);
      toast.warning("Chưa thể đọc lại dữ liệu. Thao tác và key vẫn được giữ nguyên.", { position: "bottom-right" });
    } finally { setPending(false); releaseSubmission(lock); }
  }
  const busy = pending || uncertain || confirmation !== null;
  useEffect(() => { if (!busy) opener.current?.focus(); }, [busy]);
  function cancelConfirmation() { dialog.current?.close(); setConfirmation(null); }
  function action(item: Item, disabled = false) {
    const active = attempt.current?.id === item.id;
    const show = item.visibility === "HIDDEN";
    return <DestinationVisibilitySwitch name={item.name} visibility={item.visibility} disabled={disabled || busy}
      pending={pending && active} onClick={event => {
        if (lock.current || busy) return;
        opener.current = event.currentTarget;
        if (show) void execute(item); else setConfirmation(item);
      }} />;
  }
  const feedback = <>
    {uncertain && <div className="destination-uncertain" role="alert"><div><strong>Chưa xác định kết quả đổi trạng thái</strong><p>{attempt.current?.name}: chưa xác nhận {attempt.current?.target === "VISIBLE" ? "hiển thị" : "ẩn"}. Thử lại sẽ đọc dữ liệu rồi gửi cùng target/key.</p><button type="button" disabled={pending} onClick={() => void execute()}>Thử xác nhận lại</button></div></div>}
    {confirmation && <dialog ref={dialog} className="destination-confirm" aria-labelledby="visibility-confirm-title" aria-describedby="visibility-confirm-description" onCancel={event => { event.preventDefault(); cancelConfirmation(); }}>
      <h2 id="visibility-confirm-title">Ẩn điểm đến này?</h2><p id="visibility-confirm-description">Điểm đến sẽ không còn xuất hiện trong nội dung công khai hoặc được dùng cho phương án hành trình mới.</p>
      <div><button type="button" autoFocus onClick={cancelConfirmation}>Hủy</button><button type="button" className="destination-primary" onClick={() => { const item = confirmation; dialog.current?.close(); setConfirmation(null); void execute(item); }}>Ẩn điểm đến</button></div>
    </dialog>}
  </>;
  return { action, feedback, busy };
}
