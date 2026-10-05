"use client";
import { authorizationFeedback } from "@/lib/authorization-feedback";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { CalendarDays, CheckCircle2, Home, Info, LoaderCircle, LogOut, Mail, Pencil, Save, UserRound, UsersRound, X } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { createIdempotencyKey } from "@/lib/mutation-client";
import { loadAccount, saveAccount } from "@/lib/account-client";
import { claimSubmission, releaseSubmission } from "@/lib/auth-submission-guard";
import { fetchAuthWithTimeout } from "@/lib/auth-fetch";
import { isSignOutConfirmed } from "@/lib/sign-out-confirmation";
import { accountNameSchema, ACCOUNT_UPDATE_ERROR, type AccountDto } from "@/modules/account/account-contract";

export default function AccountProfile({ initialAccount }: { initialAccount: AccountDto }) {
  const [account, setAccount] = useState(initialAccount);
  const [draft, setDraft] = useState(initialAccount.name);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  const [nameError, setNameError] = useState("");
  const [success, setSuccess] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [sessionWarning, setSessionWarning] = useState(false);
  const submission = useRef(false);
  const logoutSubmission = useRef(false);
  const attempt = useRef<{ name: string; key: string } | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const { refetch } = authClient.useSession();
  const role = account.role === "ADMIN" ? "Quản trị viên" : "Du khách";
  const nameParts = account.name.trim().split(/\s+/).filter(Boolean);
  const initials = (nameParts.length > 1 ? [nameParts[0]!, nameParts.at(-1)!] : nameParts).map(word => word[0]).join("").toUpperCase();

  async function refreshSessionName() {
    try {
      await refetch({ query: { disableCookieCache: true } });
      setSessionWarning(Boolean(authClient.$store.atoms.session.get().error));
    } catch { setSessionWarning(true); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    if (!claimSubmission(submission)) return;
    const parsed = accountNameSchema.safeParse(draft);
    if (!parsed.success) { setNameError(parsed.error.issues[0]?.message ?? "Họ và tên không hợp lệ."); releaseSubmission(submission); nameInput.current?.focus(); return; }
    setSaving(true); setNameError(""); setError(""); setSuccess(false);
    try {
      // Do not start a new write after UNKNOWN until a server read succeeds.
      // Re-read is reconciliation only; it never announces an unconfirmed save.
      if (uncertain) { setAccount(await loadAccount()); setUncertain(false); }
      if (!attempt.current || attempt.current.name !== parsed.data) attempt.current = { name: parsed.data, key: createIdempotencyKey() };
      const outcome = await saveAccount(attempt.current.name, attempt.current.key);
      if (outcome.status === "SUCCESS") {
        setAccount(outcome.data); setDraft(outcome.data.name); setEditing(false); setSuccess(true); attempt.current = null;
        void refreshSessionName();
      } else {
        setError(outcome.status === "UNKNOWN" ? "Chưa thể xác định đã lưu hay chưa. Khi thử lại, hệ thống sẽ đọc lại tài khoản trước." : authorizationFeedback(outcome.httpStatus) ?? ACCOUNT_UPDATE_ERROR);
        setUncertain(outcome.status === "UNKNOWN");
        if (outcome.status === "FAILED") attempt.current = null;
      }
    } catch { setError(ACCOUNT_UPDATE_ERROR); }
    finally { releaseSubmission(submission); setSaving(false); }
  }
  async function cancel() {
    if (!claimSubmission(submission)) return;
    setSaving(true);
    try {
      const persisted = uncertain ? await loadAccount() : account;
      setAccount(persisted); setDraft(persisted.name); setEditing(false); setError(""); setNameError(""); setUncertain(false); attempt.current = null;
    } catch { setError("Chưa thể đọc lại tài khoản. Vui lòng thử lại."); }
    finally { releaseSubmission(submission); setSaving(false); }
  }
  async function logout() {
    if (!claimSubmission(logoutSubmission)) return;
    setSigningOut(true); setError("");
    try {
      if (await isSignOutConfirmed(() => fetchAuthWithTimeout("/api/session/logout", { method: "POST", credentials: "same-origin" }))) window.location.replace("/");
      else setError("Không thể xác nhận đăng xuất. Vui lòng thử lại.");
    } catch { setError("Không thể xác nhận đăng xuất. Vui lòng thử lại."); }
    finally { releaseSubmission(logoutSubmission); setSigningOut(false); }
  }
  return <main className="account-page">
    <div className="account-container">
      <nav className="account-breadcrumb" aria-label="Đường dẫn"><Link href="/" aria-label="Trang chủ"><Home size={17} /></Link><span>/</span><span>Tài khoản</span></nav>
      <h1>Thông tin tài khoản</h1><p className="account-subtitle">Xem và cập nhật thông tin cá nhân của bạn.</p>
      <div className="account-grid">
        <section className="account-card account-summary" aria-labelledby="account-summary-title">
          <h2 id="account-summary-title">Thông tin tài khoản</h2>
          <div className="account-avatar" aria-hidden="true">{initials}</div>
          <p className="account-name">{account.name}</p><p className="account-email">{account.email}</p>
          <span className="account-role"><UsersRound size={16} />{role}</span>
          <p className="account-date"><CalendarDays size={18} /><span>Ngày tạo tài khoản: {new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(account.createdAt))}</span></p>
        </section>
        <section className="account-card account-detail" aria-labelledby="account-detail-title">
          {success && <div className="account-banner account-success" role="status"><CheckCircle2 size={19} /><span>Cập nhật thông tin thành công.</span><button type="button" aria-label="Đóng thông báo thành công" onClick={() => setSuccess(false)}><X size={17} /></button></div>}
          <h2 id="account-detail-title">{editing ? "Chỉnh sửa thông tin" : "Chi tiết thông tin"}</h2>
          {error && <p className="account-banner account-error" role="alert">{error}</p>}
          {sessionWarning && <p role="alert">Đã lưu tài khoản, nhưng chưa đồng bộ tên trên menu. <button type="button" onClick={() => void refreshSessionName()}>Đồng bộ lại</button></p>}
          <form method="post" action="/account" onSubmit={submit}>
            <div className="account-field"><label htmlFor="account-name">Họ và tên</label><div className="account-input-wrap"><UserRound size={18} /><input ref={nameInput} id="account-name" name="name" value={editing ? draft : account.name} readOnly={!editing} disabled={saving} autoFocus={editing} autoComplete="name" aria-invalid={Boolean(nameError)} aria-describedby={nameError ? "account-name-error" : undefined} onChange={event => { setDraft(event.target.value); setNameError(""); }} /></div>{nameError && <p id="account-name-error" className="account-field-error" role="alert">{nameError}</p>}</div>
            <div className="account-field"><label htmlFor="account-email">Email</label><div className="account-input-wrap"><Mail size={18} /><input id="account-email" value={account.email} readOnly /></div>{editing && <p className="account-helper"><Info size={15} />Email hiện chưa thể chỉnh sửa trong phiên bản này.</p>}</div>
            <div className="account-field"><label htmlFor="account-role">Vai trò</label><div className="account-input-wrap"><UsersRound size={18} /><input id="account-role" value={role} readOnly /></div></div>
            <div className="account-actions">{editing ? <>
              <button key="save" className="account-button account-primary" type="submit" disabled={saving} aria-busy={saving}>{saving ? <LoaderCircle className="account-spinner" size={18} /> : <Save size={18} />}{saving ? "Đang lưu..." : "Lưu thay đổi"}</button>
              <button className="account-button" type="button" disabled={saving} onClick={() => void cancel()}><X size={18} />Hủy</button>
            </> : <>
              <button key="edit" className="account-button account-edit" type="button" onClick={event => { event.preventDefault(); setDraft(account.name); setEditing(true); setSuccess(false); setError(""); setNameError(""); requestAnimationFrame(() => nameInput.current?.focus()); }}><Pencil size={18} />Chỉnh sửa</button>
              <button className="account-button" type="button" disabled={signingOut} aria-busy={signingOut} onClick={() => void logout()}><LogOut size={18} />{signingOut ? "Đang đăng xuất…" : "Đăng xuất"}</button>
            </>}</div>
          </form>
        </section>
      </div>
    </div>
  </main>;
}
