"use client";

import React, { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  Search,
  X,
  RotateCw,
  MoreVertical,
  Eye,
  Shield,
  Lock,
  Unlock,
  ChevronLeft,
  ChevronRight,
  UserX,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import type {
  AdminUserSummary,
  AdminUserRole,
  AdminUserStatus,
  AdminUserSortField,
  AdminUserSortOrder,
  AdminUserStatistics,
  AdminUserPage,
} from "@/modules/admin-users/admin-user-contract";
import { defaultAdminUserDataSource } from "@/modules/admin-users/admin-user-data-source";
import { UserRoleBadge, UserStatusBadge } from "./user-badges";
import { UserStatsCards } from "./user-stats";
import { LockAccountDialog, ChangeRoleDialog } from "./user-modals";
import "../destinations/destinations.css";
import "./users.css";

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "Chưa ghi nhận";
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "Asia/Ho_Chi_Minh",
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
};

export default function UserManagementClient() {
  const [, startTransition] = useTransition();

  // Search & Filter state
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<AdminUserRole | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<AdminUserStatus | "ALL">("ALL");
  const [sortBy, setSortBy] = useState<AdminUserSortField>("createdAt");
  const [sortOrder, setSortOrder] = useState<AdminUserSortOrder>("desc");
  const [page, setPage] = useState(1);
  const pageSize = 6;

  // Data state
  const [stats, setStats] = useState<AdminUserStatistics | null>(null);
  const [isComposing, setIsComposing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statsError, setStatsError] = useState(false);
  const [userPage, setUserPage] = useState<AdminUserPage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Modal & Action states
  const [selectedUserForLock, setSelectedUserForLock] = useState<AdminUserSummary | null>(null);
  const [isLockModalOpen, setIsLockModalOpen] = useState(false);
  const [selectedUserForRole, setSelectedUserForRole] = useState<AdminUserSummary | null>(null);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Debounce search input
  useEffect(() => {
    if (isComposing) return;
    const handler = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchInput, isComposing]);

  // Load stats once or upon refresh
  useEffect(() => {
    let current = true;
    setStatsError(false);
    setStats(null);
    defaultAdminUserDataSource
      .getStatistics()
      .then((res) => {
        if (current) setStats(res);
      })
      .catch(() => {
        if (current) setStatsError(true);
      });
    return () => {
      current = false;
    };
  }, [refreshKey]);

  // Load users when filters change
  useEffect(() => {
    let isCurrent = true;
    setIsLoading(true);
    setLoadError(null);

    defaultAdminUserDataSource
      .getUsers({
        search: debouncedSearch,
        role: roleFilter,
        status: statusFilter,
        sortBy,
        sortOrder,
        page,
        pageSize,
      })
      .then((res) => {
        if (isCurrent) {
          setUserPage(res);
          if (res.page !== page) setPage(res.page);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (isCurrent) {
          setIsLoading(false);
          setLoadError("Không thể tải danh sách người dùng. Vui lòng thử lại.");
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [debouncedSearch, roleFilter, statusFilter, sortBy, sortOrder, page, refreshKey]);

  // Close open dropdown menu when clicking outside
  useEffect(() => {
    function handleClickOutside() {
      setActiveMenuId(null);
    }
    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, []);

  function handleRefresh() {
    startTransition(() => {
      setRefreshKey((prev) => prev + 1);
    });
  }

  return (
    <main className="destination-page">
      <div className="destination-container">
        {/* Page Header (Destination style) */}
        <div className="destination-page-header">
          <header className="destination-heading">
            <div>
              <h1>Quản lý người dùng</h1>
              <p>
                Quản lý tài khoản, vai trò và trạng thái truy cập của người dùng trong hệ thống Hà Giang Travel Assistant.
              </p>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button
                type="button"
                className="destination-button"
                onClick={handleRefresh}
                title="Làm mới dữ liệu người dùng"
              >
                <RotateCw size={16} aria-hidden="true" />
                <span>Làm mới</span>
              </button>
            </div>
          </header>
        </div>

        {/* Dashboard Statistics */}
        {statsError ? (
          <p role="alert" style={{ color: "var(--destination-error)", marginBottom: 16 }}>
            Không thể tải thống kê.{" "}
            <button type="button" className="destination-button" onClick={handleRefresh}>
              Thử lại
            </button>
          </p>
        ) : (
          <UserStatsCards stats={stats} />
        )}

        {/* User CMS Main Card (Destination Card style) */}
        <section className="destination-card destination-list-card" aria-label="Danh sách tài khoản">
          <div className="destination-section-heading">
            <span className="destination-section-icon" aria-hidden="true">
              <Users size={21} />
            </span>
            <div>
              <h2>Danh sách tài khoản</h2>
              <p>Thông tin và trạng thái hiện tại của các tài khoản người dùng.</p>
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="destination-toolbar">
            <div className="destination-search-box">
              <Search className="search-icon size-4" />
              <input
                type="text"
                className="destination-search-input"
                placeholder="Tìm theo tên hoặc email..."
                value={searchInput}
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={() => setIsComposing(false)}
                onChange={(e) => setSearchInput(e.target.value)}
                aria-label="Tìm kiếm người dùng"
              />
              {searchInput && (
                <button
                  type="button"
                  className="destination-search-clear"
                  onClick={() => {
                    setSearchInput("");
                    setDebouncedSearch("");
                    setPage(1);
                  }}
                  aria-label="Xóa từ khóa tìm kiếm"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>

            <div className="destination-filters">
              {/* Role filter */}
              <select
                className="destination-filter-select"
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value as AdminUserRole | "ALL");
                  setPage(1);
                }}
                aria-label="Lọc theo vai trò"
              >
                <option value="ALL">Tất cả vai trò</option>
                <option value="ADMIN">Quản trị viên (ADMIN)</option>
                <option value="TRAVELER">Du khách (TRAVELER)</option>
              </select>

              {/* Status filter */}
              <select
                className="destination-filter-select"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as AdminUserStatus | "ALL");
                  setPage(1);
                }}
                aria-label="Lọc theo trạng thái"
              >
                <option value="ALL">Tất cả trạng thái</option>
                <option value="ACTIVE">Đang hoạt động</option>
                <option value="LOCKED">Đang bị khóa</option>
              </select>

              {/* Sort By */}
              <select
                className="destination-filter-select"
                value={`${sortBy}-${sortOrder}`}
                onChange={(e) => {
                  const [field, order] = e.target.value.split("-") as [
                    AdminUserSortField,
                    AdminUserSortOrder,
                  ];
                  setSortBy(field);
                  setSortOrder(order);
                  setPage(1);
                }}
                aria-label="Sắp xếp danh sách"
              >
                <option value="createdAt-desc">Mới tạo gần nhất</option>
                <option value="createdAt-asc">Tạo cũ nhất</option>
                <option value="name-asc">Tên (A–Z)</option>
                <option value="name-desc">Tên (Z–A)</option>
              </select>
            </div>
          </div>

          {/* Table Area */}
          {isLoading ? (
            <div className="destination-state" role="status">
              <RotateCw className="size-8 animate-spin text-[#35765c] mb-3" />
              <p>Đang tải danh sách người dùng…</p>
            </div>
          ) : loadError ? (
            <div className="destination-state" role="alert">
              <p style={{ color: "var(--destination-error)" }}>{loadError}</p>
              <button type="button" className="destination-button" onClick={handleRefresh}>
                Thử lại
              </button>
            </div>
          ) : !userPage || userPage.items.length === 0 ? (
            <div className="destination-state destination-empty">
              <span className="destination-empty-icon" aria-hidden="true">
                <UserX size={32} />
              </span>
              <h3>
                {debouncedSearch || roleFilter !== "ALL" || statusFilter !== "ALL"
                  ? "Không tìm thấy người dùng phù hợp"
                  : "Chưa có tài khoản nào"}
              </h3>
              <p>
                {debouncedSearch || roleFilter !== "ALL" || statusFilter !== "ALL"
                  ? "Hãy thử điều chỉnh lại từ khóa tìm kiếm hoặc bỏ bớt các bộ lọc đang chọn."
                  : "Các tài khoản người dùng đăng ký sẽ hiển thị tại danh sách này."}
              </p>
              {(debouncedSearch || roleFilter !== "ALL" || statusFilter !== "ALL") && (
                <button
                  type="button"
                  className="destination-button"
                  onClick={() => {
                    setSearchInput("");
                    setDebouncedSearch("");
                    setRoleFilter("ALL");
                    setStatusFilter("ALL");
                    setPage(1);
                  }}
                >
                  Đặt lại bộ lọc
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Desktop / Tablet Table (Destination Table standard) */}
              <div className="destination-table">
                <table>
                  <caption className="sr-only">Danh sách tài khoản người dùng quản trị</caption>
                  <thead>
                    <tr>
                      <th scope="col">Người dùng</th>
                      <th scope="col">Vai trò</th>
                      <th scope="col">Trạng thái</th>
                      <th scope="col">Ngày tạo</th>
                      <th scope="col">Đăng nhập gần nhất</th>
                      <th scope="col" style={{ textAlign: "right" }}>
                        Thao tác
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {userPage.items.map((user) => (
                      <tr key={user.id}>
                        <td>
                          <div className="admin-user-cell">
                            <div className="admin-avatar">
                              {user.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="admin-user-info">
                              <Link
                                href={`/admin/users/${user.id}` as Route}
                                className="destination-row-name"
                                style={{ textDecoration: "none", color: "var(--destination-ink)" }}
                              >
                                {user.name}
                              </Link>
                              <span className="admin-user-email">{user.email}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <UserRoleBadge role={user.role} />
                        </td>
                        <td>
                          <UserStatusBadge status={user.status} />
                        </td>
                        <td className="destination-date">
                          {formatDate(user.createdAt)}
                        </td>
                        <td className="destination-date">
                          {formatDate(user.lastLoginAt)}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div className="relative inline-block text-left">
                            <button
                              type="button"
                              className="admin-action-btn"
                              aria-label={`Thao tác với ${user.name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenuId(activeMenuId === user.id ? null : user.id);
                              }}
                            >
                              <MoreVertical size={16} />
                            </button>

                            {/* Dropdown Menu */}
                            {activeMenuId === user.id && (
                              <div
                                className="destination-dropdown-menu"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Link
                                  href={`/admin/users/${user.id}` as Route}
                                  className="destination-menu-item"
                                  onClick={() => setActiveMenuId(null)}
                                >
                                  <Eye size={15} className="text-[var(--destination-green)]" />
                                  <span>Xem chi tiết</span>
                                </Link>

                                <button
                                  type="button"
                                  className="destination-menu-item"
                                  onClick={() => {
                                    setActiveMenuId(null);
                                    setSelectedUserForRole(user);
                                    setIsRoleModalOpen(true);
                                  }}
                                >
                                  <Shield size={15} className="text-[var(--destination-green)]" />
                                  <span>Đổi vai trò</span>
                                </button>

                                <button
                                  type="button"
                                  className={`destination-menu-item ${
                                    user.status === "LOCKED" ? "is-active" : "is-destructive"
                                  }`}
                                  onClick={() => {
                                    setActiveMenuId(null);
                                    setSelectedUserForLock(user);
                                    setIsLockModalOpen(true);
                                  }}
                                >
                                  {user.status === "LOCKED" ? (
                                    <>
                                      <Unlock size={15} />
                                      <span>Mở khóa tài khoản</span>
                                    </>
                                  ) : (
                                    <>
                                      <Lock size={15} />
                                      <span>Khóa tài khoản</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards (for small screens < 820px) */}
              <div className="admin-mobile-cards">
                {userPage.items.map((user) => (
                  <article key={user.id} className="admin-user-card">
                    <div className="admin-user-card-header">
                      <div className="admin-user-cell">
                        <div className="admin-avatar size-9 text-xs">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="admin-user-info">
                          <Link
                            href={`/admin/users/${user.id}` as Route}
                            className="admin-user-name"
                          >
                            {user.name}
                          </Link>
                          <span className="admin-user-email">{user.email}</span>
                        </div>
                      </div>
                      <UserRoleBadge role={user.role} />
                    </div>

                    <div className="admin-user-card-body">
                      <div className="admin-user-card-item">
                        <span className="admin-user-card-label">Trạng thái</span>
                        <div>
                          <UserStatusBadge status={user.status} />
                        </div>
                      </div>
                      <div className="admin-user-card-item">
                        <span className="admin-user-card-label">Ngày tạo</span>
                        <span className="text-xs font-medium text-[var(--destination-ink)]">
                          {formatDate(user.createdAt)}
                        </span>
                      </div>
                    </div>

                    <div className="admin-user-card-actions">
                      <Link
                        href={`/admin/users/${user.id}` as Route}
                        className="destination-button flex-1 text-xs"
                        style={{ minHeight: 36, padding: "6px 12px" }}
                      >
                        <Eye className="size-3.5" />
                        <span>Chi tiết</span>
                      </Link>
                      <button
                        type="button"
                        className="destination-button flex-1 text-xs"
                        style={{ minHeight: 36, padding: "6px 12px" }}
                        onClick={() => {
                          setSelectedUserForRole(user);
                          setIsRoleModalOpen(true);
                        }}
                      >
                        <Shield className="size-3.5" />
                        <span>Đổi vai trò</span>
                      </button>
                      <button
                        type="button"
                        className={`destination-button ${
                          user.status === "LOCKED" ? "destination-primary" : "destination-destructive"
                        }`}
                        style={{ minHeight: 36, padding: "6px 12px" }}
                        onClick={() => {
                          setSelectedUserForLock(user);
                          setIsLockModalOpen(true);
                        }}
                        aria-label={user.status === "LOCKED" ? "Mở khóa" : "Khóa"}
                      >
                        {user.status === "LOCKED" ? <Unlock size={16} /> : <Lock size={16} />}
                      </button>
                    </div>
                  </article>
                ))}
              </div>

              {/* Pagination Footer (Destination Standard) */}
              <footer className="destination-list-footer">
                <p>
                  Đang hiển thị {userPage.items.length} tài khoản trên trang này (tổng số {userPage.total} tài khoản).
                </p>

                <nav className="destination-pagination" aria-label="Phân trang danh sách người dùng">
                  <button
                    type="button"
                    disabled={userPage.page <= 1}
                    onClick={() => setPage(Math.max(1, userPage.page - 1))}
                  >
                    <ChevronLeft size={16} aria-hidden="true" />
                    <span>Trang trước</span>
                  </button>

                  <span className="destination-current-page" aria-current="page">
                    Trang {userPage.page} / {userPage.totalPages}
                  </span>

                  <button
                    type="button"
                    disabled={!userPage.hasMore}
                    onClick={() => setPage(userPage.page + 1)}
                  >
                    <span>Trang sau</span>
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                </nav>
              </footer>
            </>
          )}
        </section>
      </div>

      {/* Dialogs */}
      <LockAccountDialog
        user={selectedUserForLock}
        isOpen={isLockModalOpen}
        onClose={() => {
          setIsLockModalOpen(false);
          setSelectedUserForLock(null);
        }}
        onActionComplete={(msg) => {
          toast.success(msg);
          setRefreshKey((value) => value + 1);
        }}
      />

      <ChangeRoleDialog
        user={selectedUserForRole}
        isOpen={isRoleModalOpen}
        onClose={() => {
          setIsRoleModalOpen(false);
          setSelectedUserForRole(null);
        }}
        onActionComplete={(msg) => {
          toast.success(msg);
          setRefreshKey((value) => value + 1);
        }}
      />
    </main>
  );
}
