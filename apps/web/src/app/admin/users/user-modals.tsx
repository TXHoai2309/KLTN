"use client";

import React, { useEffect, useState } from "react";
import { X, AlertTriangle, ShieldAlert, Lock, Unlock } from "lucide-react";
import type {
  AdminUserSummary,
  AdminUserRole,
} from "@/modules/admin-users/admin-user-contract";
import { defaultAdminUserDataSource } from "@/modules/admin-users/admin-user-data-source";

interface LockAccountDialogProps {
  user: AdminUserSummary | null;
  isOpen: boolean;
  onClose: () => void;
  onActionComplete?: (message: string) => void;
}

export function LockAccountDialog({
  user,
  isOpen,
  onClose,
  onActionComplete,
}: LockAccountDialogProps) {
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const isLocking = user?.status !== "LOCKED";

  useEffect(() => {
    if (isOpen) {
      setReason("");
      setFeedback(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !user) return null;

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);

    if (!user) return;
    try {
      const res = isLocking
        ? await defaultAdminUserDataSource.requestLockUser(user.id, reason)
        : await defaultAdminUserDataSource.requestUnlockUser(user.id);

      setFeedback(res.message);
      if (onActionComplete) {
        onActionComplete(res.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="admin-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lock-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="admin-modal-content">
        <div className="admin-modal-header">
          <div>
            <h3 id="lock-modal-title" className="admin-modal-title">
              {isLocking ? "Khóa tài khoản người dùng" : "Mở khóa tài khoản người dùng"}
            </h3>
            <p className="admin-modal-desc">
              Xác nhận hành động quản trị đối với tài khoản được chọn.
            </p>
          </div>
          <button
            type="button"
            className="admin-modal-close"
            onClick={onClose}
            aria-label="Đóng cửa sổ"
          >
            <X className="size-5" />
          </button>
        </div>

        <form onSubmit={handleConfirm}>
          <div className="admin-modal-body">
            {/* Identity info */}
            <div className="admin-modal-user-box">
              <div className="admin-avatar size-10 text-xs">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-semibold text-sm truncate">{user.name}</span>
                <span className="text-xs text-muted-foreground truncate">{user.email}</span>
                <span className="text-[11px] text-muted-foreground mt-0.5">ID: {user.id}</span>
              </div>
            </div>

            {/* Phase 1 Notice */}
            <div className="admin-modal-notice">
              <AlertTriangle className="size-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <div>
                <span className="font-semibold">Lưu ý Phase 1 (Frontend Only):</span>{" "}
                Chức năng đang chờ Backend API Phase 2. Khi bấm xác nhận, hệ thống sẽ hiển thị thông báo mô phỏng chính xác và không thay đổi dữ liệu trong cơ sở dữ liệu Neon.
              </div>
            </div>

            {isLocking ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Khi tài khoản bị khóa, người dùng sẽ không thể đăng nhập hoặc thực hiện các tác vụ tạo chuyến đi và lưu yêu thích trên hệ thống.
                </p>
                <label htmlFor="lock-reason" className="text-xs font-semibold text-foreground">
                  Lý do khóa tài khoản (Tùy chọn cho Phase 2):
                </label>
                <textarea
                  id="lock-reason"
                  rows={3}
                  className="admin-modal-textarea"
                  placeholder="Nhập lý do vi phạm hoặc yêu cầu khóa tài khoản..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground leading-relaxed">
                Khi mở khóa tài khoản, người dùng sẽ được khôi phục quyền đăng nhập và sử dụng hệ thống Hà Giang Travel Assistant bình thường.
              </p>
            )}

            {feedback && (
              <div
                className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-200"
                role="status"
              >
                {feedback}
              </div>
            )}
          </div>

          <div className="admin-modal-footer">
            <button
              type="button"
              className="admin-btn admin-btn-outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              className={`admin-btn ${isLocking ? "admin-btn-destructive" : "admin-btn-primary"}`}
              disabled={isSubmitting}
            >
              {isLocking ? (
                <>
                  <Lock className="size-4" />
                  <span>Xác nhận khóa</span>
                </>
              ) : (
                <>
                  <Unlock className="size-4" />
                  <span>Xác nhận mở khóa</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface ChangeRoleDialogProps {
  user: AdminUserSummary | null;
  isOpen: boolean;
  onClose: () => void;
  onActionComplete?: (message: string) => void;
}

export function ChangeRoleDialog({
  user,
  isOpen,
  onClose,
  onActionComplete,
}: ChangeRoleDialogProps) {
  const [selectedRole, setSelectedRole] = useState<AdminUserRole>("TRAVELER");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setSelectedRole(user.role === "ADMIN" ? "TRAVELER" : "ADMIN");
      setFeedback(null);
      setIsSubmitting(false);
    }
  }, [user, isOpen]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !user) return null;

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);

    if (!user) return;
    try {
      const res = await defaultAdminUserDataSource.requestChangeRole(user.id, selectedRole);
      setFeedback(res.message);
      if (onActionComplete) {
        onActionComplete(res.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="admin-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="role-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="admin-modal-content">
        <div className="admin-modal-header">
          <div>
            <h3 id="role-modal-title" className="admin-modal-title">
              Thay đổi vai trò người dùng
            </h3>
            <p className="admin-modal-desc">
              Chuyển đổi giữa vai trò Quản trị viên (ADMIN) và Du khách (TRAVELER).
            </p>
          </div>
          <button
            type="button"
            className="admin-modal-close"
            onClick={onClose}
            aria-label="Đóng cửa sổ"
          >
            <X className="size-5" />
          </button>
        </div>

        <form onSubmit={handleConfirm}>
          <div className="admin-modal-body">
            {/* Identity info */}
            <div className="admin-modal-user-box">
              <div className="admin-avatar size-10 text-xs">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-semibold text-sm truncate">{user.name}</span>
                <span className="text-xs text-muted-foreground truncate">{user.email}</span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[11px] text-muted-foreground">Vai trò hiện tại:</span>
                  <span className="text-[11px] font-bold text-foreground">{user.role}</span>
                </div>
              </div>
            </div>

            {/* Warning if demoting ADMIN */}
            {user.role === "ADMIN" && (
              <div className="admin-modal-notice">
                <ShieldAlert className="size-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                <div>
                  <span className="font-semibold">Cảnh báo an toàn hệ thống:</span>{" "}
                  Hạ vai trò của quản trị viên sẽ tước bỏ quyền truy cập vào các phân hệ CMS Quản trị, Quản lý RAG và Quản lý người dùng. Backend tương lai sẽ kiểm tra bảo vệ Admin cuối cùng trong transaction.
                </div>
              </div>
            )}

            {/* Role Options */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-foreground">Chọn vai trò mới:</label>
              <div className="admin-modal-role-grid">
                <label
                  className={`admin-modal-role-card ${
                    selectedRole === "TRAVELER" ? "selected" : ""
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-xs text-foreground">TRAVELER</span>
                    <input
                      type="radio"
                      name="role"
                      value="TRAVELER"
                      checked={selectedRole === "TRAVELER"}
                      onChange={() => setSelectedRole("TRAVELER")}
                      className="accent-emerald-600"
                    />
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    Du khách thông thường, tạo lịch trình và xem địa điểm.
                  </span>
                </label>

                <label
                  className={`admin-modal-role-card ${
                    selectedRole === "ADMIN" ? "selected" : ""
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-xs text-foreground">ADMIN</span>
                    <input
                      type="radio"
                      name="role"
                      value="ADMIN"
                      checked={selectedRole === "ADMIN"}
                      onChange={() => setSelectedRole("ADMIN")}
                      className="accent-emerald-600"
                    />
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    Toàn quyền quản trị, quản lý điểm đến, RAG và người dùng.
                  </span>
                </label>
              </div>
            </div>

            {feedback && (
              <div
                className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-200"
                role="status"
              >
                {feedback}
              </div>
            )}
          </div>

          <div className="admin-modal-footer">
            <button
              type="button"
              className="admin-btn admin-btn-outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              className="admin-btn admin-btn-primary"
              disabled={isSubmitting || selectedRole === user.role}
            >
              Lưu vai trò mới
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
