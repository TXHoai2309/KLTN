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
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import type {
  AdminUserDetail,
  AdminUserAuditEvent,
} from "@/modules/admin-users/admin-user-contract";
import { defaultAdminUserDataSource } from "@/modules/admin-users/admin-user-data-source";
import { UserRoleBadge, UserStatusBadge } from "../user-badges";
import { LockAccountDialog, ChangeRoleDialog, RevokeSessionsDialog } from "../user-modals";
import {
  AdminField,
  AdminLabel,
  AdminCollapsibleSection,
  AdminPageHeader,
  AdminStickyActions,
  AdminAlert,
  AdminLoadingState,
} from "@/components/admin/admin-form-shell";
import "@/components/admin/admin-form-shell.css";
import "../../destinations/destination-v3.css";
import "../../destinations/destinations.css";
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
          setAuditLogs(logs);
          setAuditPage(1);
          setAuditMore(logs.length === 20);
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

  function handleRevokeSessions() {
    setIsRevokeModalOpen(true);
  }

  async function loadMoreAudit() {
    if (auditBusy) return;
    setAuditBusy(true);
    try {
      const rows = await defaultAdminUserDataSource.getUserAuditEvents(userId, auditPage + 1);
      setAuditLogs((old) => [
        ...old,
        ...rows.filter((row) => !old.some((item) => item.id === row.id)),
      ]);
      setAuditPage((p) => p + 1);
      setAuditMore(rows.length === 20);
    } catch {
      toast.error("Không thể tải thêm nhật ký. Hãy thử lại.");
    } finally {
      setAuditBusy(false);
    }
  }

  function completed(message: string) {
    toast.success(message);
    setRefreshKey((value) => value + 1);
  }

  if (loadError && !isLoading) {
    return (
      <div className="af-root dv3-page">
        <main className="dv3-main">
          <AdminAlert variant="error" icon={<AlertTriangle size={18} />}>
            <div>
              <p style={{ margin: "0 0 8px", fontWeight: 600 }}>Chưa tải được hồ sơ người dùng</p>
              <p style={{ margin: "0 0 12px", fontSize: 13 }}>{loadError}</p>
              <button
                className="af-btn af-btn-primary"
                type="button"
                onClick={() => setRefreshKey((value) => value + 1)}
              >
                Thử tải lại
              </button>
            </div>
          </AdminAlert>
        </main>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="af-root dv3-page">
        <AdminLoadingState>Đang tải thông tin người dùng…</AdminLoadingState>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="af-root dv3-page">
        <main className="dv3-main">
          <div className="destination-state" role="alert">
            <span className="destination-empty-icon" aria-hidden="true">
              <AlertCircle size={32} />
            </span>
            <h3>Không tìm thấy tài khoản người dùng</h3>
            <p>
              Tài khoản có mã định danh [{userId}] không tồn tại trong hệ thống hoặc đã bị xóa.
            </p>
            <Link href={"/admin/users" as Route} className="destination-primary">
              <ArrowLeft size={16} aria-hidden="true" />
              <span>Quay lại danh sách người dùng</span>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="af-root dv3-page">
      {/* Top Header - Destination Form Shell Standard */}
      <AdminPageHeader
        breadcrumb={
          <Link
            href={"/admin/users" as Route}
            className="destination-back"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              textDecoration: "none",
              fontWeight: 650,
              fontSize: 13,
            }}
          >
            <ArrowLeft size={15} aria-hidden="true" />
            <span>Quay lại danh sách</span>
          </Link>
        }
        title={`Hồ sơ người dùng: ${user.name}`}
        subtitle="Quản lý chi tiết định danh, phân quyền vai trò và trạng thái bảo mật của tài khoản."
        meta={
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <UserRoleBadge role={user.role} />
            <UserStatusBadge status={user.status} />
            {user.emailVerified ? (
              <span className="destination-badge is-visible">
                <UserCheck size={13} aria-hidden="true" />
                <span>Email đã xác thực</span>
              </span>
            ) : (
              <span className="destination-badge is-hidden">
                <span>Email chưa xác thực</span>
              </span>
            )}
          </div>
        }
      />

      {/* Main Document Content Area */}
      <main className="dv3-main">
        {/* Section 1: Thao tác quản trị & An toàn */}
        <AdminCollapsibleSection
          id="dv3-user-actions"
          icon={Shield}
          title="Thao tác quản trị & An toàn tài khoản"
          description="Kiểm soát phân quyền, thu hồi phiên làm việc hoặc khóa tài khoản khi có vi phạm."
          defaultOpen={true}
        >
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              className="af-btn"
              onClick={() => setIsRoleModalOpen(true)}
            >
              <Shield size={16} aria-hidden="true" />
              <span>Thay đổi vai trò ({user.role})</span>
            </button>

            {user.status === "LOCKED" ? (
              <button
                type="button"
                className="af-btn af-btn-primary"
                onClick={() => setIsLockModalOpen(true)}
              >
                <Unlock size={16} aria-hidden="true" />
                <span>Mở khóa tài khoản</span>
              </button>
            ) : (
              <button
                type="button"
                className="af-btn"
                style={{
                  color: "var(--af-error)",
                  borderColor: "color-mix(in srgb, var(--af-error) 40%, var(--af-line))",
                }}
                onClick={() => setIsLockModalOpen(true)}
              >
                <Lock size={16} aria-hidden="true" />
                <span>Khóa tài khoản này</span>
              </button>
            )}

            <button
              type="button"
              className="af-btn"
              onClick={handleRevokeSessions}
            >
              <KeyRound size={16} aria-hidden="true" />
              <span>Thu hồi tất cả phiên</span>
            </button>
          </div>

          <div style={{ marginTop: 20 }}>
            <AdminAlert variant="warning">
              <div>
                <strong>An toàn quản trị:</strong> Máy chủ luôn kiểm tra quyền hiện hành, bảo vệ Admin cuối cùng và tự động lưu vết nhật ký cho mọi thay đổi đã xác nhận.
              </div>
            </AdminAlert>
          </div>
        </AdminCollapsibleSection>

        {/* Section 2: Thông tin tài khoản */}
        <AdminCollapsibleSection
          id="dv3-user-basic"
          icon={UserCheck}
          title="Thông tin cơ bản & Định danh"
          description="Mã định danh hệ thống, thông tin cá nhân và thời gian hoạt động của tài khoản."
          badge="required"
          defaultOpen={true}
        >
          <div className="af-grid-2">
            <AdminField>
              <AdminLabel htmlFor="user-id" required>
                Mã người dùng (User ID)
              </AdminLabel>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  id="user-id"
                  className="af-input font-mono text-xs"
                  readOnly
                  value={user.id}
                  style={{ background: "var(--af-tint)", cursor: "default" }}
                />
                <button
                  type="button"
                  className="af-btn"
                  onClick={handleCopyId}
                  style={{ flexShrink: 0, minWidth: 96 }}
                  title="Sao chép User ID"
                >
                  {copiedId ? (
                    <Check size={14} className="text-emerald-600" aria-hidden="true" />
                  ) : (
                    <Copy size={14} aria-hidden="true" />
                  )}
                  <span>{copiedId ? "Đã chép" : "Sao chép"}</span>
                </button>
              </div>
            </AdminField>

            <AdminField>
              <AdminLabel htmlFor="user-name" required>
                Họ và tên
              </AdminLabel>
              <input
                id="user-name"
                className="af-input font-medium"
                readOnly
                value={user.name}
              />
            </AdminField>

            <AdminField>
              <AdminLabel htmlFor="user-email" required>
                Địa chỉ email
              </AdminLabel>
              <input
                id="user-email"
                className="af-input"
                readOnly
                value={user.email}
              />
            </AdminField>

            <AdminField>
              <AdminLabel htmlFor="user-role" required>
                Vai trò trong hệ thống
              </AdminLabel>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  id="user-role"
                  className="af-input font-semibold"
                  readOnly
                  value={user.role}
                  style={{ fontWeight: 700 }}
                />
                <button
                  type="button"
                  className="af-btn"
                  onClick={() => setIsRoleModalOpen(true)}
                  style={{ flexShrink: 0 }}
                  title="Đổi vai trò"
                >
                  <Shield size={14} aria-hidden="true" />
                  <span>Đổi vai trò</span>
                </button>
              </div>
            </AdminField>

            <AdminField>
              <AdminLabel htmlFor="user-created">
                Ngày tạo tài khoản
              </AdminLabel>
              <input
                id="user-created"
                className="af-input"
                readOnly
                value={formatDateTime(user.createdAt)}
              />
            </AdminField>

            <AdminField>
              <AdminLabel htmlFor="user-updated">
                Cập nhật gần nhất
              </AdminLabel>
              <input
                id="user-updated"
                className="af-input"
                readOnly
                value={formatDateTime(user.updatedAt)}
              />
            </AdminField>

            <AdminField>
              <AdminLabel htmlFor="user-last-login">
                Đăng nhập gần nhất
              </AdminLabel>
              <input
                id="user-last-login"
                className="af-input"
                readOnly
                value={formatDateTime(user.lastLoginAt)}
              />
            </AdminField>

            <AdminField>
              <AdminLabel htmlFor="user-status">
                Trạng thái khóa tài khoản
              </AdminLabel>
              <input
                id="user-status"
                className="af-input"
                readOnly
                value={user.status === "LOCKED" ? "Đang bị khóa" : "Bình thường (Hoạt động)"}
                style={{
                  color: user.status === "LOCKED" ? "var(--af-error)" : "inherit",
                  fontWeight: user.status === "LOCKED" ? 650 : 500,
                }}
              />
            </AdminField>
          </div>

          {user.lockReason && (
            <div style={{ marginTop: 16 }}>
              <AdminAlert variant="error" icon={<Lock size={16} aria-hidden="true" />}>
                <div>
                  <strong>Lý do khóa tài khoản:</strong> {user.lockReason}
                  {user.lockedAt && (
                    <div style={{ marginTop: 4, fontSize: 12, opacity: 0.85 }}>
                      Thời điểm khóa: {formatDateTime(user.lockedAt)}
                    </div>
                  )}
                </div>
              </AdminAlert>
            </div>
          )}
        </AdminCollapsibleSection>

        {/* Section 2: Phiên đăng nhập & Thiết bị */}
        <AdminCollapsibleSection
          id="dv3-user-sessions"
          icon={Laptop}
          title="Phiên đăng nhập & Thiết bị"
          description="Các thiết bị và phiên làm việc đang duy trì quyền truy cập vào hệ thống."
          summary={<span>{user.sessionCount ?? user.activeSessions?.length ?? 0} phiên hoạt động</span>}
          defaultOpen={true}
        >
          {(user.sessionCount ?? 0) > (user.activeSessions?.length ?? 0) && (
            <p className="af-helper" style={{ marginBottom: 12 }}>
              Hiển thị tối đa 20 phiên đang hoạt động gần nhất.
            </p>
          )}

          {user.activeSessions && user.activeSessions.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {user.activeSessions.map((sess) => (
                <div
                  key={sess.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "14px 18px",
                    border: "1px solid var(--af-line)",
                    borderRadius: "var(--af-radius-input)",
                    background: "var(--af-tint)",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        background: "var(--af-surface)",
                        border: "1px solid var(--af-line)",
                        display: "grid",
                        placeItems: "center",
                        color: "var(--af-green)",
                        flexShrink: 0,
                      }}
                    >
                      <Laptop size={18} aria-hidden="true" />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 650, fontSize: 13.5, color: "var(--af-ink)" }}>
                        {sess.userAgent || "Thiết bị không xác định"}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--af-muted)", marginTop: 2 }}>
                        Tạo lúc: {formatDateTime(sess.createdAt)} • Hết hạn: {formatDateTime(sess.expiresAt)}
                      </div>
                    </div>
                  </div>
                  <span className="destination-badge is-visible">
                    Đang hoạt động
                  </span>
                </div>
              ))}

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                <button
                  type="button"
                  className="af-btn"
                  onClick={handleRevokeSessions}
                >
                  <KeyRound size={15} aria-hidden="true" />
                  <span>Thu hồi toàn bộ phiên đăng nhập</span>
                </button>
              </div>
            </div>
          ) : (
            <p className="af-helper" style={{ margin: "6px 0" }}>
              Hiện không có phiên đăng nhập nào đang hoạt động cho tài khoản này.
            </p>
          )}
        </AdminCollapsibleSection>

        {/* Section 3: Nhật ký thao tác quản trị */}
        <AdminCollapsibleSection
          id="dv3-user-audit"
          icon={FileText}
          title="Nhật ký thao tác quản trị (Audit Log)"
          description="Lịch sử ghi nhận can thiệp quản trị: phân quyền, khóa tài khoản, thu hồi phiên."
          summary={<span>{auditLogs.length} sự kiện ghi nhận</span>}
          defaultOpen={true}
        >
          {auditMore && (
            <div style={{ marginBottom: 14 }}>
              <button
                type="button"
                className="af-btn"
                disabled={auditBusy}
                onClick={() => void loadMoreAudit()}
              >
                Tải thêm nhật ký
              </button>
            </div>
          )}

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
                        <Clock size={12} style={{ display: "inline", marginRight: 4 }} aria-hidden="true" />
                        {formatDateTime(log.timestamp)}
                      </span>
                    </div>
                    <p className="admin-timeline-desc">
                      Thực hiện bởi: <strong>{log.actorName}</strong> ({log.actorEmail})
                    </p>
                    {log.reason && (
                      <p className="admin-timeline-desc" style={{ fontStyle: "italic" }}>
                        Lý do: &ldquo;{log.reason}&rdquo;
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--af-muted)" }}>
              <span className="destination-empty-icon" style={{ margin: "0 auto 12px" }} aria-hidden="true">
                <FileText size={28} />
              </span>
              <p style={{ fontSize: 13, margin: 0 }}>
                Chưa có nhật ký thao tác quản trị nào cho tài khoản này.
              </p>
            </div>
          )}
        </AdminCollapsibleSection>

        {/* Sticky Actions Bar */}
        <AdminStickyActions
          message="Các thao tác phân quyền hoặc khóa tài khoản sẽ có hiệu lực ngay sau khi máy chủ xác nhận."
        >
          <Link href={"/admin/users" as Route} className="af-btn">
            <ArrowLeft size={16} aria-hidden="true" />
            <span>Quay lại danh sách</span>
          </Link>
          <button
            type="button"
            className="af-btn af-btn-primary"
            onClick={() => setIsRoleModalOpen(true)}
          >
            <Shield size={16} aria-hidden="true" />
            <span>Phân quyền vai trò</span>
          </button>
        </AdminStickyActions>
      </main>

      {/* Dialogs */}
      <RevokeSessionsDialog
        user={user}
        isOpen={isRevokeModalOpen}
        onClose={() => setIsRevokeModalOpen(false)}
        onActionComplete={completed}
      />

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
    </div>
  );
}
