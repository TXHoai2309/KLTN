import React from "react";
import { Users, Compass, ShieldCheck, UserX } from "lucide-react";
import type { AdminUserStatistics } from "@/modules/admin-users/admin-user-contract";

export function UserStatsCards({ stats }: { stats: AdminUserStatistics | null }) {
  return (
    <div
      className="admin-stats-grid"
      role="region"
      aria-label="Thống kê người dùng"
      aria-busy={!stats}
      style={{ marginBottom: 20 }}
    >
      <div
        className="destination-card"
        style={{
          padding: "18px 20px",
          margin: 0,
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <div className="destination-section-icon" aria-hidden="true">
          <Users size={20} />
        </div>
        <div className="destination-stat-info">
          <span
            className="destination-stat-label"
            style={{
              display: "block",
              fontSize: 12.5,
              color: "var(--destination-muted)",
              marginBottom: 3,
              fontWeight: 550,
            }}
          >
            Tổng số tài khoản
          </span>
          <span
            className="destination-stat-value"
            style={{
              fontSize: 24,
              fontWeight: 750,
              color: "var(--destination-ink)",
              lineHeight: 1,
            }}
          >
            {stats?.totalUsers ?? "—"}
          </span>
        </div>
      </div>

      <div
        className="destination-card"
        style={{
          padding: "18px 20px",
          margin: 0,
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <div className="destination-section-icon" aria-hidden="true">
          <Compass size={20} />
        </div>
        <div className="destination-stat-info">
          <span
            className="destination-stat-label"
            style={{
              display: "block",
              fontSize: 12.5,
              color: "var(--destination-muted)",
              marginBottom: 3,
              fontWeight: 550,
            }}
          >
            Tài khoản Traveler
          </span>
          <span
            className="destination-stat-value"
            style={{
              fontSize: 24,
              fontWeight: 750,
              color: "var(--destination-ink)",
              lineHeight: 1,
            }}
          >
            {stats?.travelerCount ?? "—"}
          </span>
        </div>
      </div>

      <div
        className="destination-card"
        style={{
          padding: "18px 20px",
          margin: 0,
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <div className="destination-section-icon" aria-hidden="true">
          <ShieldCheck size={20} />
        </div>
        <div className="destination-stat-info">
          <span
            className="destination-stat-label"
            style={{
              display: "block",
              fontSize: 12.5,
              color: "var(--destination-muted)",
              marginBottom: 3,
              fontWeight: 550,
            }}
          >
            Tài khoản Admin
          </span>
          <span
            className="destination-stat-value"
            style={{
              fontSize: 24,
              fontWeight: 750,
              color: "var(--destination-ink)",
              lineHeight: 1,
            }}
          >
            {stats?.adminCount ?? "—"}
          </span>
        </div>
      </div>

      <div
        className="destination-card"
        style={{
          padding: "18px 20px",
          margin: 0,
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <div
          className="destination-section-icon"
          style={{ background: "#fdf2f2", color: "#ad3131" }}
          aria-hidden="true"
        >
          <UserX size={20} />
        </div>
        <div className="destination-stat-info">
          <span
            className="destination-stat-label"
            style={{
              display: "block",
              fontSize: 12.5,
              color: "var(--destination-muted)",
              marginBottom: 3,
              fontWeight: 550,
            }}
          >
            Đang bị khóa
          </span>
          <span
            className="destination-stat-value"
            style={{
              fontSize: 24,
              fontWeight: 750,
              color: "var(--destination-ink)",
              lineHeight: 1,
            }}
          >
            {stats?.lockedCount ?? "—"}
          </span>
        </div>
      </div>
    </div>
  );
}
