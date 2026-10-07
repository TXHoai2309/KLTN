"use client";
import React, { useEffect, useRef, useState, type RefObject } from "react";
import CultureVisibilitySwitch from "../destinations/destination-visibility-switch";
import { toast } from "sonner";
import type { CultureDto } from "@/modules/culture/culture-contract";
import { changeCultureVisibility, loadCulture } from "@/lib/culture-client";
import { createIdempotencyKey } from "@/lib/mutation-client";
import { claimSubmission, releaseSubmission } from "@/lib/auth-submission-guard";
import { authorizationFeedback } from "@/lib/authorization-feedback";

type Item = Pick<CultureDto, "id" | "title" | "visibility">;
type Attempt = Item & { key: string; target: CultureDto["visibility"] };

/** One controller per page, shared by desktop/mobile actions and detail-save lock. */
export function useCultureVisibility(onConfirmed: (dto: CultureDto) => void, sharedLock?: RefObject<boolean>) {
  const attempts = useRef(new Map<string, Attempt>());
  const activeIds = useRef(new Set<string>());
  const uncertainIdsRef = useRef(new Set<string>());
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [uncertainIds, setUncertainIds] = useState<Set<string>>(() => new Set());
  const [confirmation, setConfirmation] = useState<Item | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { if (confirmation) dialog.current?.showModal(); }, [confirmation]);

  function markPending(id: string, pending: boolean) {
    if (pending) activeIds.current.add(id); else activeIds.current.delete(id);
    setPendingIds(current => { const next = new Set(current); pending ? next.add(id) : next.delete(id); return next; });
  }
  function markUncertain(id: string, uncertain: boolean) {
    if (uncertain) uncertainIdsRef.current.add(id); else uncertainIdsRef.current.delete(id);
    setUncertainIds(current => { const next = new Set(current); uncertain ? next.add(id) : next.delete(id); return next; });
  }
  async function execute(item?: Item, retryId?: string) {
    const id = item?.id ?? retryId;
    if (!id || activeIds.current.has(id)) return;
    const existing = attempts.current.get(id);
    if (!existing && !item) return;
    if (sharedLock && !claimSubmission(sharedLock)) return;
    if (!existing && item) attempts.current.set(id, { ...item, key: createIdempotencyKey(), target: item.visibility === "HIDDEN" ? "VISIBLE" : "HIDDEN" });
    markPending(id, true);
    try {
      const current = attempts.current.get(id);
      if (!current) return;
      // A current read is useful for reconciliation but cannot prove this write succeeded.
      if (uncertainIdsRef.current.has(id)) await loadCulture(current.id);
      const result = await changeCultureVisibility(current.id, current.target, current.key);
      if (result.status === "SUCCESS") {
        onConfirmed(result.data);
        markUncertain(id, false); attempts.current.delete(id);
        toast.success(current.target === "VISIBLE" ? "Đã hiển thị nội dung văn hóa." : "Đã ẩn nội dung văn hóa.", { position: "bottom-right" });
      } else if (result.status === "FAILED") {
        markUncertain(id, false); attempts.current.delete(id);
        toast.error(authorizationFeedback(result.httpStatus) ?? "Không thể đổi trạng thái. Trạng thái trước đó được giữ nguyên.", { position: "bottom-right" });
      } else {
        markUncertain(id, true);
        toast.warning("Chưa xác định kết quả đổi trạng thái.", { position: "bottom-right", description: "Giữ nguyên thao tác và thử xác nhận lại." });
      }
    } catch {
      markUncertain(id, true);
      toast.warning("Chưa thể đọc lại dữ liệu. Thao tác và key vẫn được giữ nguyên.", { position: "bottom-right" });
    } finally { markPending(id, false); if (sharedLock) releaseSubmission(sharedLock); }
  }
  const busy = pendingIds.size > 0 || uncertainIds.size > 0 || confirmation !== null;
  useEffect(() => { if (!busy) opener.current?.focus(); }, [busy]);
  function cancelConfirmation() { dialog.current?.close(); setConfirmation(null); }
  function action(item: Item, disabled = false) {
    const pending = pendingIds.has(item.id);
    const uncertain = uncertainIds.has(item.id);
    const show = item.visibility === "HIDDEN";
    return <CultureVisibilitySwitch name={item.title} visibility={item.visibility} disabled={disabled || pending || uncertain}
      pending={pending} onClick={event => {
        if (sharedLock?.current || activeIds.current.has(item.id) || uncertain || confirmation) return;
        opener.current = event.currentTarget;
        if (show) void execute(item); else setConfirmation(item);
      }} />;
  }
  const feedback = <>
    {[...uncertainIds].map(id => { const current = attempts.current.get(id); return current && <div key={id} className="destination-uncertain" role="alert"><div><strong>Chưa xác định kết quả đổi trạng thái</strong><p>{current.title}: chưa xác nhận {current.target === "VISIBLE" ? "hiển thị" : "ẩn"}. Thử lại sẽ đọc dữ liệu rồi gửi cùng target/key.</p><button type="button" disabled={pendingIds.has(id)} onClick={() => void execute(undefined, id)}>Thử xác nhận lại</button></div></div>; })}
    {confirmation && <dialog ref={dialog} className="destination-confirm" aria-labelledby="visibility-confirm-title" aria-describedby="visibility-confirm-description" onCancel={event => { event.preventDefault(); cancelConfirmation(); }}>
      <h2 id="visibility-confirm-title">Ẩn nội dung văn hóa này?</h2><p id="visibility-confirm-description">Nội dung sẽ không còn được hiển thị trong khu vực công khai. Các liên kết điểm đến được giữ nguyên.</p>
      <div><button type="button" autoFocus onClick={cancelConfirmation}>Hủy</button><button type="button" className="destination-primary" onClick={() => { const item = confirmation; dialog.current?.close(); setConfirmation(null); void execute(item); }}>Ẩn nội dung văn hóa</button></div>
    </dialog>}
  </>;
  return { action, feedback, busy };
}
