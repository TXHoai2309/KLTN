"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { LoaderCircle, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteDestination, restoreDestination } from "@/lib/destination-client";
import { createIdempotencyKey } from "@/lib/mutation-client";
import { claimSubmission, releaseSubmission } from "@/lib/auth-submission-guard";
import { authorizationFeedback } from "@/lib/authorization-feedback";

type Item = { id: string; name: string };
type Attempt = { kind: "delete" | "restore"; key: string };

/** One lifecycle controller shared by the desktop table and responsive cards. */
export function useDestinationLifecycle(onConfirmed: (id: string) => void, sharedLock: RefObject<boolean>) {
  const attempts = useRef(new Map<string, Attempt>());
  const activeIds = useRef(new Set<string>());
  const uncertainIdsRef = useRef(new Set<string>());
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [uncertainIds, setUncertainIds] = useState<Set<string>>(() => new Set());
  const [confirmation, setConfirmation] = useState<Item | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const hadConfirmation = useRef(false);
  const restoreFocus = useRef(false);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (confirmation && !dialog.current?.open) dialog.current?.showModal();
    else if (!confirmation && dialog.current?.open) dialog.current.close();
  }, [confirmation]);
  useEffect(() => {
    if (confirmation) { hadConfirmation.current = true; return; }
    if (pendingIds.size) return;
    if (!hadConfirmation.current && !restoreFocus.current) return;
    hadConfirmation.current = false;
    restoreFocus.current = false;
    if (opener.current?.isConnected) opener.current.focus();
    else document.getElementById("destination-list-current-view")?.focus();
  }, [confirmation, pendingIds]);

  function markPending(id: string, pending: boolean) {
    if (pending) activeIds.current.add(id); else activeIds.current.delete(id);
    setPendingIds(current => { const next = new Set(current); pending ? next.add(id) : next.delete(id); return next; });
  }
  function markUncertain(id: string, uncertain: boolean) {
    if (uncertain) uncertainIdsRef.current.add(id); else uncertainIdsRef.current.delete(id);
    setUncertainIds(current => { const next = new Set(current); uncertain ? next.add(id) : next.delete(id); return next; });
  }

  async function execute(id: string) {
    if (activeIds.current.has(id) || sharedLock.current) return;
    const current = attempts.current.get(id);
    if (!current || !claimSubmission(sharedLock)) return;
    markPending(id, true);
    try {
      const result = current.kind === "delete"
        ? await deleteDestination(id, current.key)
        : await restoreDestination(id, current.key);
      if (result.status === "SUCCESS") {
        attempts.current.delete(id);
        markUncertain(id, false);
        if (current.kind === "delete") setConfirmation(null);
        else restoreFocus.current = true;
        onConfirmed(id);
        toast.success(current.kind === "delete" ? "Đã chuyển điểm đến vào danh sách đã xóa." : "Đã khôi phục điểm đến về trạng thái Ẩn.", { position: "bottom-right" });
      } else if (result.status === "FAILED") {
        attempts.current.delete(id);
        markUncertain(id, false);
        toast.error(authorizationFeedback(result.httpStatus) ?? result.error.message ?? "Không thể hoàn tất thao tác.", { position: "bottom-right" });
      } else {
        markUncertain(id, true);
        toast.warning(current.kind === "delete" ? "Chưa xác định kết quả xóa." : "Chưa xác định kết quả khôi phục.", {
          position: "bottom-right",
          description: "Thao tác và Idempotency-Key được giữ nguyên. Thử xác nhận lại để tiếp tục.",
        });
      }
    } catch {
      markUncertain(id, true);
      toast.warning("Chưa xác định kết quả thao tác.", { position: "bottom-right", description: "Thao tác và Idempotency-Key được giữ nguyên để thử lại." });
    } finally {
      markPending(id, false);
      releaseSubmission(sharedLock);
    }
  }

  function action(item: Item, view: "active" | "deleted") {
    const pending = pendingIds.has(item.id);
    const uncertain = uncertainIds.has(item.id);
    const blockedByOtherUncertain = uncertainIds.size > 0 && !uncertain;
    if (view === "active") return <>
      <button type="button" className="destination-delete" aria-label={uncertain ? `Thử xác nhận lại việc xóa ${item.name}` : `Xóa ${item.name}`} aria-busy={pending} disabled={pending || sharedLock.current || blockedByOtherUncertain} onClick={event => {
        if (pending || sharedLock.current || blockedByOtherUncertain) return;
        opener.current = event.currentTarget;
        setConfirmation(item);
      }}>
        {pending ? <LoaderCircle className="destination-spinner" size={15} aria-hidden="true" /> : <Trash2 size={15} aria-hidden="true" />}
        {pending ? "Đang xóa…" : uncertain ? "Thử xác nhận lại" : "Xóa"}
      </button>
      {uncertain && <span className="destination-lifecycle-status" role="status" aria-live="polite">Chưa xác định kết quả. Thử lại sẽ dùng cùng Idempotency-Key.</span>}
    </>;

    return <>
      <button type="button" className="destination-restore" aria-label={uncertain ? `Thử xác nhận lại việc khôi phục ${item.name}` : `Khôi phục ${item.name}`} aria-busy={pending} disabled={pending || sharedLock.current || blockedByOtherUncertain} onClick={event => {
        if (pending || sharedLock.current || blockedByOtherUncertain) return;
        opener.current = event.currentTarget;
        if (!attempts.current.has(item.id)) attempts.current.set(item.id, { kind: "restore", key: createIdempotencyKey() });
        void execute(item.id);
      }}>
        {pending ? <LoaderCircle className="destination-spinner" size={15} aria-hidden="true" /> : <RotateCcw size={15} aria-hidden="true" />}
        {pending ? "Đang khôi phục…" : uncertain ? "Thử xác nhận lại" : "Khôi phục"}
      </button>
      {uncertain && <span className="destination-lifecycle-status" role="status" aria-live="polite">Chưa xác định kết quả. Thử lại sẽ dùng cùng Idempotency-Key.</span>}
    </>;
  }

  function confirmDelete() {
    if (!confirmation) return;
    const id = confirmation.id;
    if (!attempts.current.has(id)) attempts.current.set(id, { kind: "delete", key: createIdempotencyKey() });
    void execute(id);
  }
  function dismissConfirmation() { if (!pendingIds.size) setConfirmation(null); }

  const busy = pendingIds.size > 0 || uncertainIds.size > 0 || confirmation !== null;
  const feedback = confirmation && <dialog
    ref={dialog}
    className="destination-confirm"
    aria-labelledby={titleId}
    aria-describedby={descriptionId}
    onCancel={event => { event.preventDefault(); dismissConfirmation(); }}
  >
    <h2 id={titleId}>{uncertainIds.has(confirmation.id) ? "Xác nhận lại việc xóa?" : "Xóa điểm đến?"}</h2>
    <p id={descriptionId}>Bạn sắp xóa <strong>{confirmation.name}</strong>. Điểm đến sẽ không còn xuất hiện công khai; dữ liệu lịch sử được giữ nguyên và Admin có thể khôi phục sau.</p>
    {uncertainIds.has(confirmation.id) && <p className="destination-uncertain destination-dialog-warning" role="status" aria-live="polite">Kết quả lần trước chưa xác định. Thử lại sẽ gửi cùng yêu cầu và Idempotency-Key.</p>}
    <div>
      <button type="button" autoFocus disabled={pendingIds.size > 0} onClick={dismissConfirmation}>Hủy</button>
      <button type="button" className="destination-destructive" disabled={pendingIds.size > 0} aria-busy={pendingIds.size > 0} onClick={confirmDelete}>
        {pendingIds.size > 0 && <LoaderCircle className="destination-spinner" size={15} aria-hidden="true" />}
        {pendingIds.size > 0 ? "Đang xóa…" : uncertainIds.has(confirmation.id) ? "Thử lại cùng thao tác" : "Xóa điểm đến"}
      </button>
    </div>
  </dialog>;
  return { action, feedback, busy };
}
