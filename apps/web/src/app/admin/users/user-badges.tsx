import React from "react";
import { ShieldCheck, User, CheckCircle2, Lock, HelpCircle } from "lucide-react";
import type { AdminUserRole, AdminUserStatus } from "@/modules/admin-users/admin-user-contract";

export function UserRoleBadge({ role }: { role: AdminUserRole }) {
  if (role === "ADMIN") {
    return (
      <span className="admin-badge admin-badge-admin" title="Quản trị viên hệ thống">
        <ShieldCheck className="size-3.5" aria-hidden="true" />
        <span>ADMIN</span>
      </span>
    );
  }

  return (
    <span className="admin-badge admin-badge-traveler" title="Du khách">
      <User className="size-3.5" aria-hidden="true" />
      <span>TRAVELER</span>
    </span>
  );
}

export function UserStatusBadge({ status }: { status: AdminUserStatus }) {
  if (status === "ACTIVE") {
    return (
      <span className="admin-badge admin-badge-active" title="Tài khoản đang hoạt động bình thường">
        <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        <span>Hoạt động</span>
      </span>
    );
  }

  if (status === "LOCKED") {
    return (
      <span className="admin-badge admin-badge-locked" title="Tài khoản đã bị tạm khóa">
        <Lock className="size-3.5 text-red-600 dark:text-red-400" aria-hidden="true" />
        <span>Đã khóa</span>
      </span>
    );
  }

  return (
    <span className="admin-badge admin-badge-unknown" title="Trạng thái chưa được định danh trong hệ thống">
      <HelpCircle className="size-3.5 text-gray-500" aria-hidden="true" />
      <span>Chưa xác định</span>
    </span>
  );
}
