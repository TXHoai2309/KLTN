"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CheckCircle2, LoaderCircle, Trash2, Undo2 } from "lucide-react";
import { Button } from "@KLTN/ui/components/button";
import { toast } from "sonner";
import { changeTrip, type TripAction, type TripChange } from "@/modules/trip-read/trip-management-client";
import type { TripSummary } from "@/modules/trip-read/trip-read-service";

export function TripManagementActions({ trip, onConfirmed }: { trip: TripSummary; onConfirmed: (change: TripChange) => void }) {
 const [action, setAction] = useState<TripAction | null>(null);
 const [state, setState] = useState<"idle" | "pending" | "failed" | "unknown">("idle");
 const [message, setMessage] = useState("");
 const dialog = useRef<HTMLDialogElement>(null), cancel = useRef<HTMLButtonElement>(null);
 const lock = useRef(false), key = useRef<string | null>(null);
 const titleId = useId(), descriptionId = useId();
 useEffect(() => {
  if (action !== null) { dialog.current?.showModal(); cancel.current?.focus(); }
  else dialog.current?.close();
 }, [action]);
 function open(next: TripAction) {
  if (lock.current || state === "unknown") return;
  key.current = null; setMessage(""); setState("idle"); setAction(next);
 }
 async function confirm() {
  if (lock.current || action === null) return;
  lock.current = true; setState("pending"); setMessage("");
  key.current ??= crypto.randomUUID();
  // Identical retry first reconciles the persisted idempotency record on server.
  const result = await changeTrip(trip.id, action, key.current);
  lock.current = false;
  if (result.status === "SUCCESS") {
   dialog.current?.close(); setAction(null); setState("idle"); key.current = null;
   toast.success(action === "delete" ? "Đã xóa chuyến đi." : action ? "Đã đánh dấu chuyến đi hoàn thành." : "Đã bỏ đánh dấu hoàn thành.");
   onConfirmed(result.data);
  } else { setState(result.status === "UNKNOWN" ? "unknown" : "failed"); setMessage(result.error.message); }
 }
 const pending = state === "pending", unresolved = pending || state === "unknown";
 const label = action === "delete" ? "Xóa chuyến đi" : action ? "Đánh dấu hoàn thành" : "Bỏ đánh dấu hoàn thành";
 return <>
  <div className="my-trips-management">
   <Button variant="outline" className="my-trips-completion-button" onClick={() => open(!trip.manuallyCompletedAt)} disabled={unresolved}>
    {trip.manuallyCompletedAt ? <Undo2 aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}{trip.manuallyCompletedAt ? "Bỏ đánh dấu hoàn thành" : "Đánh dấu đã hoàn thành"}
   </Button>
   <Button variant="destructive" className="my-trips-delete-button" onClick={() => open("delete")} disabled={unresolved}><Trash2 aria-hidden="true" />Xóa chuyến đi</Button>
  </div>
  <dialog ref={dialog} className="my-trips-dialog" aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={event => { if (unresolved) event.preventDefault(); else setAction(null); }}>
   <h2 id={titleId}>{label}?</h2>
   <p className="my-trips-dialog-trip">Chuyến đi {trip.durationDays} ngày · {trip.startDate} – {trip.endDate}</p>
   <p id={descriptionId}>{action === "delete" ? "Chuyến đi sẽ bị xóa vĩnh viễn khỏi danh sách cùng lịch trình và liên kết yêu thích. Không thể hoàn tác." : action ? "Chuyến đi sẽ được chuyển vào nhóm Đã hoàn thành. Thao tác này không xác nhận riêng từng điểm tham quan." : "Trạng thái sẽ được tính lại theo ngày kế hoạch. Nếu ngày kết thúc đã qua, chuyến đi vẫn thuộc nhóm Đã hoàn thành theo lịch."}</p>
   {message && <p role={state === "failed" ? "alert" : "status"} className="my-trips-mutation-feedback">{message}</p>}
   <div className="my-trips-dialog-actions">
    <Button ref={cancel} variant="outline" disabled={unresolved} onClick={() => setAction(null)}>Hủy</Button>
    <Button variant={action === "delete" ? "destructive" : "default"} disabled={pending} onClick={() => { void confirm(); }} aria-busy={pending}>
     {pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}{pending ? action === "delete" ? "Đang xóa…" : "Đang cập nhật…" : state === "unknown" ? "Kiểm tra lại kết quả" : label}
    </Button>
   </div>
  </dialog>
 </>;
}
