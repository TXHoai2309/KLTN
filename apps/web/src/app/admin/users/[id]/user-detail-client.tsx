"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  ArrowLeft,
  Copy,
  Check,
  Shield,
  Lock,
  Unlock,
  KeyRound,
  RotateCcw,
  Clock,
  Laptop,
  AlertCircle,
  FileText,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import type {
  AdminUserDetail,
  AdminUserAuditEvent,
} from "@/modules/admin-users/admin-user-contract";
import { defaultAdminUserDataSource } from "@/modules/admin-users/admin-user-data-source";
import { UserRoleBadge, UserStatusBadge } from "../user-badges";
import { LockAccountDialog, ChangeRoleDialog, RevokeSessionsDialog } from "../user-modals";
import "../users.css";

const formatDateTime = (dateStr: string | null | undefined) => {
  if (!dateStr) return "Chưa ghi nhận";
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Ho_Chi_Minh",
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
};

export default function UserDetailClient({ userId }: { userId: string }) {
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [auditLogs, setAuditLogs] = useState<AdminUserAuditEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [auditPage, setAuditPage] = useState(1);
  const [auditMore, setAuditMore] = useState(false);
  const [auditBusy, setAuditBusy] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  // Modal states
  const [isLockModalOpen, setIsLockModalOpen] = useState(false);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [isRevokeModalOpen, setIsRevokeModalOpen] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    setIsLoading(true);
    setLoadError(null);

    Promise.all([
      defaultAdminUserDataSource.getUserById(userId),
      defaultAdminUserDataSource.getUserAuditEvents(userId),
    ])
      .then(([userData, logs]) => {
        if (isCurrent) {
          setUser(userData);
          setAuditLogs(logs); setAuditPage(1); setAuditMore(logs.length === 20);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (isCurrent) {
          setIsLoading(false);
          setLoadError("Không thể tải hồ sơ hoặc nhật ký. Vui lòng thử lại.");
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [userId, refreshKey]);

  function handleCopyId() {
    if (user?.id) {
      navigator.clipboard.writeText(user.id);
      setCopiedId(true);
      toast.success("Đã sao chép User ID vào clipboard!");
      setTimeout(() => setCopiedId(false), 2000);
    }
  }

  function handleRevokeSessions() { setIsRevokeModalOpen(true); }
  async function loadMoreAudit() {
    if (auditBusy) return; setAuditBusy(true);
    try { const rows = await defaultAdminUserDataSource.getUserAuditEvents(userId, auditPage + 1); setAuditLogs(old => [...old, ...rows.filter(row => !old.some(item => item.id === row.id))]); setAuditPage(p => p + 1); setAuditMore(rows.length === 20); }
    catch { toast.error("Không thể tải thêm nhật ký. Hãy thử lại."); }
    finally { setAuditBusy(false); }
  }
  function completed(message: string) { toast.success(message); setRefreshKey(value => value + 1); }
  if (loadError && !isLoading) return <main className="admin-users-page"><div className="admin-state-container" role="alert"><p>{loadError}</p><button className="admin-btn admin-btn-outline" type="button" onClick={() => setRefreshKey(value => value + 1)}>Thử lại</button></div></main>;

  if (isLoading) {
    return (
      <main className="admin-users-page">
        <div className="admin-users-container">
          <div className="admin-state-container">
            <RotateCcw className="size-8 animate-spin text-emerald-600 mb-3" />
            <p className="admin-state-desc">Đang tải hồ sơ người dùng…</p>
          </div>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="admin-users-page">
        <div className="admin-users-container">
          <div className="admin-state-container">
            <AlertCircle className="size-10 text-amber-600 mb-3" />
            <h2 className="admin-state-title">Không tìm thấy tài khoản người dùng</h2>
            <p className="admin-state-desc">
              Tài khoản có mã định danh [{userId}] không tồn tại trong hệ thống hoặc đã bị xóa.
            </p>
            <Link href={"/admin/users" as Route} className="admin-btn admin-btn-primary">
              <ArrowLeft className="size-4" />
              <span>Quay lại danh sách người dùng</span>
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="admin-users-page">
      <div className="admin-users-container">
        {/* Breadcrumb */}
        <nav className="admin-breadcrumb" aria-label="Đường dẫn liên kết">
          <Link href="/" className="admin-breadcrumb-link">
            Trang chủ
          </Link>
          <span aria-hidden="true">/</span>
          <Link href={"/admin/users" as Route} className="admin-breadcrumb-link">
            Quản lý người dùng
          </Link>
          <span aria-hidden="true">/</span>
          <span className="admin-breadcrumb-current" aria-current="page">
            {user.name}
          </span>
        </nav>

        {/* Header Profile Card */}
        <section className="admin-detail-header-card" aria-label="Hồ sơ người dùng">
          <div className="admin-detail-profile">
            <div className="admin-detail-avatar">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="admin-detail-names">
              <h2>{user.name}</h2>
              <p className="admin-detail-email">{user.email}</p>
              <div className="admin-detail-badges">
                <UserRoleBadge role={user.role} />
                <UserStatusBadge status={user.status} />
                {user.emailVerified ? (
                  <span className="admin-badge admin-badge-active text-[11px]">
                    <UserCheck className="size-3" />
                    <span>Email đã xác thực</span>
                  </span>
                ) : (
                  <span className="admin-badge admin-badge-unknown text-[11px]">
                    <span>Email chưa xác thực</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="admin-header-actions">
            <Link href={"/admin/users" as Route} className="admin-btn admin-btn-outline">
              <ArrowLeft className="size-4" />
              <span>Quay lại danh sách</span>
            </Link>
          </div>
        </section>

        {/* Detail Content Grid */}
        <div className="admin-detail-grid">
          {/* Main Info Column */}
          <div className="flex flex-col gap-6">
            {/* Account Details Card */}
            <article className="admin-card p-6" aria-labelledby="account-info-title">
              <h3 id="account-info-title" className="text-base font-bold text-foreground mb-4 pb-2 border-b border-border">
                Thông tin tài khoản
              </h3>

              <div className="admin-field-list">
                <div className="admin-field-item">
                  <span className="admin-field-label">Mã người dùng (User ID)</span>
                  <div className="flex items-center gap-2">
                    <span className="admin-field-value font-mono text-xs">{user.id}</span>
                    <button
                      type="button"
                      onClick={handleCopyId}
                      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                      title="Sao chép User ID"
                    >
                      {copiedId ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="admin-field-item">
                  <span className="admin-field-label">Họ và tên</span>
                  <span className="admin-field-value">{user.name}</span>
                </div>

                <div className="admin-field-item">
                  <span className="admin-field-label">Địa chỉ email</span>
                  <span className="admin-field-value">{user.email}</span>
                </div>

                <div className="admin-field-item">
                  <span className="admin-field-label">Vai trò trong hệ thống</span>
                  <span className="admin-field-value">{user.role}</span>
                </div>

                <div className="admin-field-item">
                  <span className="admin-field-label">Ngày tạo tài khoản</span>
                  <span className="admin-field-value">{formatDateTime(user.createdAt)}</span>
                </div>

                <div className="admin-field-item">
                  <span className="admin-field-label">Cập nhật gần nhất</span>
                  <span className="admin-field-value">{formatDateTime(user.updatedAt)}</span>
                </div>

                <div className="admin-field-item">
                  <span className="admin-field-label">Đăng nhập gần nhất</span>
                  <span className="admin-field-value">{formatDateTime(user.lastLoginAt)}</span>
                </div>

                <div className="admin-field-item">
                  <span className="admin-field-label">Trạng thái khóa tài khoản</span>
                  <span className="admin-field-value">
                    {user.status === "LOCKED" ? "Đang bị khóa" : "Bình thường"}
                  </span>
                </div>
              </div>

              {user.lockReason && (
                <div className="admin-lock-banner">
                  <span className="font-semibold">Lý do khóa:</span> {user.lockReason}
                  {user.lockedAt && (
                    <span className="admin-lock-meta">
                      Thời điểm khóa: {formatDateTime(user.lockedAt)}
                    </span>
                  )}
                </div>
              )}
            </article>

            {/* Session & Authentication Card */}
            <article className="admin-card p-6" aria-labelledby="session-info-title">
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-border">
                <h3 id="session-info-title" className="text-base font-bold text-foreground">
                  Phiên đăng nhập & Xác thực
                </h3>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                  {user.sessionCount ?? user.activeSessions?.length ?? 0} phiên hoạt động
                </span>
              </div>

              {(user.sessionCount ?? 0) > (user.activeSessions?.length ?? 0) && <p className="text-xs text-muted-foreground">Hiển thị tối đa 20 phiên đang hoạt động gần nhất.</p>}
              {user.activeSessions && user.activeSessions.length > 0 ? (
                <div>
                  {user.activeSessions.map((sess) => (
                    <div key={sess.id} className="admin-session-item">
                      <div className="admin-session-left">
                        <div className="admin-session-icon">
                          <Laptop className="size-4" />
                        </div>
                        <div className="admin-session-info">
                          <span className="admin-session-title">
                            {sess.userAgent || "Thiết bị không xác định"}
                          </span>
                          <span className="admin-session-meta">
                            Tạo lúc: {formatDateTime(sess.createdAt)}
                          </span>
                          <span className="admin-session-meta">
                            Hết hạn: {formatDateTime(sess.expiresAt)}
                          </span>
                        </div>
                      </div>
                      <span className="admin-badge admin-badge-active text-[11px]">
                        Đang hoạt động
                      </span>
                    </div>
                  ))}

                  <div className="pt-2 flex justify-end">
                    <button
                      type="button"
                      className="admin-btn admin-btn-outline text-xs h-9"
                      onClick={handleRevokeSessions}
                      disabled={false}
                    >
                      <KeyRound className="size-3.5" />
                      <span>Thu hồi toàn bộ phiên đăng nhập</span>
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground py-2">
                  Hiện không có phiên đăng nhập nào đang hoạt động cho tài khoản này.
                </p>
              )}
            </article>

            {/* Audit Log Timeline */}
            <article className="admin-card p-6" aria-labelledby="audit-log-title">
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-border">
                <h3 id="audit-log-title" className="text-base font-bold text-foreground">
                  Nhật ký thao tác quản trị (Audit Log)
                </h3>
                <span className="text-[11px] text-muted-foreground">
                  {auditLogs.length} sự kiện ghi nhận
                </span>
              </div>

              {auditMore && <button type="button" className="admin-btn admin-btn-outline" disabled={auditBusy} onClick={() => void loadMoreAudit()}>Tải thêm nhật ký</button>}
              {auditLogs.length > 0 ? (
                <div className="admin-timeline">
                  {auditLogs.map((log) => (
                    <div key={log.id} className="admin-timeline-item">
                      <div className="admin-timeline-dot" />
                      <div className="admin-timeline-content">
                        <div className="admin-timeline-header">
                          <span className="admin-timeline-title">
                            {log.eventType === "ROLE_CHANGED" && "Thay đổi vai trò"}
                            {log.eventType === "USER_LOCKED" && "Khóa tài khoản"}
                            {log.eventType === "USER_UNLOCKED" && "Mở khóa tài khoản"}
                            {log.eventType === "SESSION_REVOKED" && "Thu hồi phiên đăng nhập"}
                          </span>
                          <span className="admin-timeline-time">
                            <Clock className="size-3 inline mr-1" />
                            {formatDateTime(log.timestamp)}
                          </span>
                        </div>
                        <p className="admin-timeline-desc">
                          Thực hiện bởi: <strong>{log.actorName}</strong> ({log.actorEmail})
                        </p>
                        {log.reason && (
                          <p className="admin-timeline-desc italic">
                            Lý do: &ldquo;{log.reason}&rdquo;
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6">
                  <FileText className="size-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-xs text-muted-foreground">
                    Chưa có nhật ký thao tác quản trị nào cho tài khoản này.
                  </p>
                </div>
              )}
            </article>
          </div>

          {/* Sidebar Action Column */}
          <div className="flex flex-col gap-6">
            <article className="admin-card p-6" aria-labelledby="actions-title">
              <h3 id="actions-title" className="text-base font-bold text-foreground mb-4 pb-2 border-b border-border">
                Thao tác quản trị
              </h3>

              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  className="admin-btn admin-btn-outline w-full justify-start text-xs h-10"
                  onClick={() => setIsRoleModalOpen(true)}
                >
                  <Shield className="size-4 mr-1 text-emerald-700 dark:text-emerald-400" />
                  <span>Thay đổi vai trò ({user.role})</span>
                </button>

                {user.status === "LOCKED" ? (
                  <button
                    type="button"
                    className="admin-btn admin-btn-primary w-full justify-start text-xs h-10"
                    onClick={() => setIsLockModalOpen(true)}
                  >
                    <Unlock className="size-4 mr-1" />
                    <span>Mở khóa tài khoản</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="admin-btn admin-btn-destructive w-full justify-start text-xs h-10"
                    onClick={() => setIsLockModalOpen(true)}
                  >
                    <Lock className="size-4 mr-1" />
                    <span>Khóa tài khoản này</span>
                  </button>
                )}

                <button
                  type="button"
                  className="admin-btn admin-btn-outline w-full justify-start text-xs h-10"
                  onClick={handleRevokeSessions}
                  disabled={false}
                >
                  <KeyRound className="size-4 mr-1 text-amber-600" />
                  <span>Thu hồi tất cả phiên</span>
                </button>
              </div>

              <div className="mt-5 p-3 rounded-lg bg-muted/40 border border-border text-[11.5px] text-muted-foreground leading-relaxed">
                <strong>An toàn quản trị:</strong> Máy chủ kiểm tra quyền hiện hành, bảo vệ Admin cuối cùng và lưu nhật ký cho các thay đổi đã xác nhận.
              </div>
            </article>
          </div>
        </div>
      </div>

      <RevokeSessionsDialog user={user} isOpen={isRevokeModalOpen} onClose={() => setIsRevokeModalOpen(false)} onActionComplete={completed} />
      {/* Dialogs */}
      <LockAccountDialog
        user={user}
        isOpen={isLockModalOpen}
        onClose={() => setIsLockModalOpen(false)}
        onActionComplete={completed}
      />

      <ChangeRoleDialog
        user={user}
        isOpen={isRoleModalOpen}
        onClose={() => setIsRoleModalOpen(false)}
        onActionComplete={completed}
      />
    </main>
  );
}
