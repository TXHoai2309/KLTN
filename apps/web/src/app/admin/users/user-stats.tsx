import React from "react";
import { Users, Compass, ShieldCheck, UserX } from "lucide-react";
import type { AdminUserStatistics } from "@/modules/admin-users/admin-user-contract";

export function UserStatsCards({ stats }: { stats: AdminUserStatistics }) {
  return (
    <div className="admin-stats-grid" role="region" aria-label="Thống kê người dùng">
      <div className="admin-stat-card">
        <div className="admin-stat-icon-wrapper emerald" aria-hidden="true">
          <Users className="size-6" />
        </div>
        <div className="admin-stat-info">
          <span className="admin-stat-label">Tổng số tài khoản</span>
          <span className="admin-stat-value">{stats.totalUsers}</span>
        </div>
      </div>

      <div className="admin-stat-card">
        <div className="admin-stat-icon-wrapper sky" aria-hidden="true">
          <Compass className="size-6" />
        </div>
        <div className="admin-stat-info">
          <span className="admin-stat-label">Tài khoản Traveler</span>
          <span className="admin-stat-value">{stats.travelerCount}</span>
        </div>
      </div>

      <div className="admin-stat-card">
        <div className="admin-stat-icon-wrapper violet" aria-hidden="true">
          <ShieldCheck className="size-6" />
        </div>
        <div className="admin-stat-info">
          <span className="admin-stat-label">Tài khoản Admin</span>
          <span className="admin-stat-value">{stats.adminCount}</span>
        </div>
      </div>

      <div className="admin-stat-card">
        <div className="admin-stat-icon-wrapper rose" aria-hidden="true">
          <UserX className="size-6" />
        </div>
        <div className="admin-stat-info">
          <span className="admin-stat-label">Đang bị khóa</span>
          <span className="admin-stat-value">{stats.lockedCount}</span>
        </div>
      </div>
    </div>
  );
}
