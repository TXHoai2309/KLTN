"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { X, Lock, Unlock, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import type { AdminUserSummary, AdminUserRole } from "@/modules/admin-users/admin-user-contract";
import { defaultAdminUserDataSource } from "@/modules/admin-users/admin-user-data-source";

/** Native modal dialog is the existing Destination/Editorial confirmation owner. */
export function CmsDialog({ open, busy, title, onClose, children }: { open: boolean; busy: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId(), descriptionId = useId();
  useLayoutEffect(() => {
    const element = dialog.current;
    // Disabling the focused submit during a request can move focus to body.
    if (open && element?.open && !element.contains(document.activeElement)) {
      if (busy) element.focus();
      else element.querySelector<HTMLButtonElement>("[data-cancel]")?.focus();
    }
  }, [open, busy]);
  useEffect(() => {
    if (!open) return;
    const element = dialog.current!;
    const previous = document.activeElement as HTMLElement | null;
    if (!element.open) element.showModal();
    element.querySelector<HTMLButtonElement>("[data-cancel]")?.focus();
    return () => { element.close(); if (previous?.isConnected) previous.focus(); };
  }, [open]);
  return <dialog ref={dialog} tabIndex={-1} className="admin-users-dialog" aria-labelledby={titleId} aria-describedby={descriptionId} onKeyDown={event => {
    if (event.key !== "Tab") return;
    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),a[href]')];
    const first = controls[0], last = controls.at(-1);
    if (!first) { event.preventDefault(); event.currentTarget.focus(); return; }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div className="admin-modal-content">
      <div className="admin-modal-header"><div><h3 id={titleId} className="admin-modal-title">{title}</h3><p id={descriptionId} className="admin-modal-desc">Xác nhận thao tác cho đúng tài khoản. Thay đổi chỉ được áp dụng sau khi máy chủ xác nhận.</p></div><button type="button" className="admin-modal-close" aria-label="Đóng cửa sổ" disabled={busy} onClick={onClose}><X className="size-5" /></button></div>
      {children}
    </div>
  </dialog>;
}
interface Props { user: AdminUserSummary | null; isOpen: boolean; onClose: () => void; onActionComplete?: (message: string) => void }
function UserMutationDialog({ user, isOpen, onClose, onActionComplete, kind }: Props & { kind: "lock" | "role" | "revoke" }) {
  const [reason, setReason] = useState("");
  const [role, setRole] = useState<AdminUserRole>("TRAVELER");
  const [pending, setPending] = useState(false), [unknown, setUnknown] = useState(false), [feedback, setFeedback] = useState<string | null>(null);
  const flight = useRef(false);
  useEffect(() => { if (isOpen) { setReason(""); setRole(user?.role === "ADMIN" ? "TRAVELER" : "ADMIN"); setFeedback(null); setUnknown(false); } }, [isOpen, user?.id]);
  const locking = user?.status !== "LOCKED";
  const title = kind === "role" ? "Thay đổi vai trò người dùng" : kind === "revoke" ? "Thu hồi phiên đăng nhập" : locking ? "Khóa tài khoản người dùng" : "Mở khóa tài khoản người dùng";
  async function confirm(event: FormEvent) {
    event.preventDefault(); if (!user || flight.current) return;
    flight.current = true; setPending(true); setFeedback(null);
    try {
      const result = kind === "role" ? await defaultAdminUserDataSource.requestChangeRole(user.id, role) : kind === "revoke" ? await defaultAdminUserDataSource.requestRevokeSessions(user.id) : locking ? await defaultAdminUserDataSource.requestLockUser(user.id, reason) : await defaultAdminUserDataSource.requestUnlockUser(user.id);
      if (result.success) { setUnknown(false); onActionComplete?.(result.message); onClose(); }
      else { setUnknown(result.operationStatus === "UNKNOWN"); setFeedback(result.message); if (result.operationStatus !== "UNKNOWN") toast.error(result.message); }
    } finally { flight.current = false; setPending(false); }
  }
  if (!user) return null;
  return <CmsDialog open={isOpen} busy={pending || unknown} title={title} onClose={onClose}>
    <form onSubmit={confirm} noValidate aria-busy={pending}>
      <div className="admin-modal-body">
        <div className="admin-modal-user-box"><div className="admin-avatar size-10 text-xs">{user.name.charAt(0).toUpperCase()}</div><div className="flex flex-col min-w-0"><strong className="text-sm truncate">{user.name}</strong><span className="text-xs text-muted-foreground truncate">{user.email}</span><span className="text-[11px] text-muted-foreground">ID: {user.id}</span></div></div>
        <div className="admin-modal-notice"><ShieldAlert className="size-4 shrink-0" /><p>{kind === "role" ? "Quyền quản trị có hiệu lực từ request tiếp theo. Dữ liệu cá nhân và phiên đăng nhập được giữ nguyên. Không được tự đổi quyền hoặc vô hiệu hóa Admin hoạt động cuối cùng." : kind === "revoke" ? "Mọi phiên đang hoạt động sẽ bị thu hồi. Tài khoản không bị khóa; người dùng có thể đăng nhập lại." : locking ? "Tài khoản bị khóa không thể đăng nhập mới; tất cả phiên hiện có sẽ bị thu hồi." : "Người dùng có thể đăng nhập lại bình thường. Các phiên đã thu hồi không được khôi phục."}</p></div>
        {kind === "role" && <fieldset disabled={pending || unknown}><legend className="text-xs font-semibold">Chọn vai trò mới</legend><div className="admin-modal-role-grid">{(["TRAVELER", "ADMIN"] as const).map(value => <label key={value} className={`admin-modal-role-card ${role === value ? "selected" : ""}`}><span>{value}</span><input type="radio" name="role" value={value} checked={role === value} onChange={() => setRole(value)} /></label>)}</div></fieldset>}
        {kind === "lock" && locking && <div className="flex flex-col gap-2"><label htmlFor="lock-reason" className="text-xs font-semibold">Lý do khóa tài khoản (tùy chọn, tối đa 500 ký tự)</label><textarea id="lock-reason" className="admin-modal-textarea resize-none" rows={3} maxLength={500} value={reason} disabled={pending || unknown} onChange={event => setReason(event.target.value)} /></div>}
        {feedback && <p role="alert" className="text-sm text-destructive">{feedback}</p>}
      </div>
      <div className="admin-modal-footer"><button data-cancel type="button" className="admin-btn admin-btn-outline" onClick={onClose} disabled={pending || unknown}>Hủy bỏ</button><button type="submit" className={`admin-btn ${kind === "role" || kind === "lock" && !locking ? "admin-btn-primary" : "admin-btn-destructive"}`} disabled={pending || kind === "role" && role === user.role} aria-busy={pending}>{kind === "lock" && (locking ? <Lock className="size-4" /> : <Unlock className="size-4" />)}{pending ? "Đang xác nhận…" : unknown ? "Kiểm tra lại cùng yêu cầu" : kind === "role" ? "Lưu vai trò mới" : kind === "revoke" ? "Xác nhận thu hồi" : locking ? "Xác nhận khóa" : "Xác nhận mở khóa"}</button></div>
    </form>
  </CmsDialog>;
}
export const LockAccountDialog = (props: Props) => <UserMutationDialog {...props} kind="lock" />;
export const ChangeRoleDialog = (props: Props) => <UserMutationDialog {...props} kind="role" />;
export const RevokeSessionsDialog = (props: Props) => <UserMutationDialog {...props} kind="revoke" />;
