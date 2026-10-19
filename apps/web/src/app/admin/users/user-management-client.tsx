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
  Info,
  UserX,
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
    let current = true; setStatsError(false); setStats(null);
    defaultAdminUserDataSource.getStatistics().then(res => { if (current) setStats(res); }).catch(() => { if (current) setStatsError(true); });
    return () => { current = false; };
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
    <main className="admin-users-page">
      <div className="admin-users-container">
        {/* Breadcrumb */}
        <nav className="admin-breadcrumb" aria-label="Đường dẫn liên kết">
          <Link href="/" className="admin-breadcrumb-link">
            Trang chủ
          </Link>
          <span aria-hidden="true">/</span>
          <span className="admin-breadcrumb-link">Quản trị</span>
          <span aria-hidden="true">/</span>
          <span className="admin-breadcrumb-current" aria-current="page">
            Người dùng
          </span>
        </nav>

        {/* Page Header */}
        <header className="admin-header">
          <div className="admin-title-group">
            <h1>Quản lý người dùng</h1>
            <p className="admin-subtitle">
              Quản lý tài khoản, vai trò và trạng thái truy cập của người dùng trong hệ thống Hà Giang Travel Assistant.
            </p>
          </div>
          <div className="admin-header-actions">
            <button
              type="button"
              className="admin-btn admin-btn-outline"
              onClick={handleRefresh}
              title="Làm mới dữ liệu người dùng"
            >
              <RotateCw className="size-4" />
              <span>Làm mới</span>
            </button>
          </div>
        </header>

        {/* Dashboard Statistics */}
        {statsError ? <p role="alert">Không thể tải thống kê. <button type="button" className="admin-btn admin-btn-outline" onClick={handleRefresh}>Thử lại</button></p> : <UserStatsCards stats={stats} />}

        {/* User CMS Card */}
        <div className="admin-card">
          {/* Search & Filter Toolbar */}
          <div className="admin-toolbar">
            <div className="admin-search-wrapper">
              <Search className="admin-search-icon size-4" />
              <input
                type="text"
                className="admin-search-input"
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
                  className="admin-search-clear"
                  onClick={() => { setSearchInput(""); setDebouncedSearch(""); setPage(1); }}
                  aria-label="Xóa từ khóa tìm kiếm"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>

            <div className="admin-filters-group">
              {/* Role filter */}
              <select
                className="admin-select"
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
                className="admin-select"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as AdminUserStatus | "ALL");
                  setPage(1);
                }}
                aria-label="Lọc theo trạng thái"
              >
                <option value="ALL">Tất cả trạng thái</option>
                <option value="ACTIVE">Đang hoạt động</option>
                <option value="LOCKED">Đã khóa</option>
              </select>

              {/* Sort By */}
              <select
                className="admin-select"
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
            <div className="admin-state-container">
              <RotateCw className="size-8 animate-spin text-emerald-600 mb-3" />
              <p className="admin-state-desc">Đang tải danh sách người dùng…</p>
            </div>
          ) : loadError ? <div className="admin-state-container" role="alert"><p>{loadError}</p><button type="button" className="admin-btn admin-btn-outline" onClick={handleRefresh}>Thử lại</button></div> : !userPage || userPage.items.length === 0 ? (
            <div className="admin-state-container">
              <div className="admin-state-icon">
                <UserX className="size-7" />
              </div>
              <h3 className="admin-state-title">
                {debouncedSearch || roleFilter !== "ALL" || statusFilter !== "ALL"
                  ? "Không tìm thấy người dùng phù hợp"
                  : "Chưa có tài khoản nào"}
              </h3>
              <p className="admin-state-desc">
                {debouncedSearch || roleFilter !== "ALL" || statusFilter !== "ALL"
                  ? "Hãy thử điều chỉnh lại từ khóa tìm kiếm hoặc bỏ bớt các bộ lọc đang chọn."
                  : "Các tài khoản người dùng đăng ký sẽ hiển thị tại danh sách này."}
              </p>
              {(debouncedSearch || roleFilter !== "ALL" || statusFilter !== "ALL") && (
                <button
                  type="button"
                  className="admin-btn admin-btn-outline"
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
              {/* Desktop / Tablet Table */}
              <div className="admin-table-container">
                <table className="admin-table">
                  <caption className="sr-only">Danh sách tài khoản người dùng quản trị</caption>
                  <thead>
                    <tr>
                      <th scope="col">Người dùng</th>
                      <th scope="col">Vai trò</th>
                      <th scope="col">Trạng thái</th>
                      <th scope="col">Ngày tạo</th>
                      <th scope="col">Đăng nhập gần nhất</th>
                      <th scope="col" className="text-right">
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
                                className="admin-user-name"
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
                        <td className="text-xs text-muted-foreground">
                          {formatDate(user.createdAt)}
                        </td>
                        <td className="text-xs text-muted-foreground">
                          {formatDate(user.lastLoginAt)}
                        </td>
                        <td className="text-right">
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
                              <MoreVertical className="size-4" />
                            </button>

                            {/* Dropdown Menu */}
                            {activeMenuId === user.id && (
                              <div
                                className="absolute right-0 top-full mt-1 w-48 rounded-xl border border-border bg-card p-1.5 shadow-xl z-20"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Link
                                  href={`/admin/users/${user.id}` as Route}
                                  className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                                  onClick={() => setActiveMenuId(null)}
                                >
                                  <Eye className="size-3.5 text-muted-foreground" />
                                  <span>Xem chi tiết</span>
                                </Link>

                                <button
                                  type="button"
                                  className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors text-left"
                                  onClick={() => {
                                    setActiveMenuId(null);
                                    setSelectedUserForRole(user);
                                    setIsRoleModalOpen(true);
                                  }}
                                >
                                  <Shield className="size-3.5 text-muted-foreground" />
                                  <span>Đổi vai trò</span>
                                </button>

                                <button
                                  type="button"
                                  className={`w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-left transition-colors ${
                                    user.status === "LOCKED"
                                      ? "text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                                      : "text-destructive hover:bg-destructive/10"
                                  }`}
                                  onClick={() => {
                                    setActiveMenuId(null);
                                    setSelectedUserForLock(user);
                                    setIsLockModalOpen(true);
                                  }}
                                >
                                  {user.status === "LOCKED" ? (
                                    <>
                                      <Unlock className="size-3.5" />
                                      <span>Mở khóa tài khoản</span>
                                    </>
                                  ) : (
                                    <>
                                      <Lock className="size-3.5" />
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

              {/* Mobile Cards (for small screens < 768px) */}
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
                        <span className="text-xs font-medium text-foreground">
                          {formatDate(user.createdAt)}
                        </span>
                      </div>
                    </div>

                    <div className="admin-user-card-actions">
                      <Link
                        href={`/admin/users/${user.id}` as Route}
                        className="admin-btn admin-btn-outline flex-1 text-xs h-9"
                      >
                        <Eye className="size-3.5" />
                        <span>Chi tiết</span>
                      </Link>
                      <button
                        type="button"
                        className="admin-btn admin-btn-outline flex-1 text-xs h-9"
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
                        className={`admin-btn h-9 px-3 ${
                          user.status === "LOCKED" ? "admin-btn-primary" : "admin-btn-destructive"
                        }`}
                        onClick={() => {
                          setSelectedUserForLock(user);
                          setIsLockModalOpen(true);
                        }}
                        aria-label={user.status === "LOCKED" ? "Mở khóa" : "Khóa"}
                      >
                        {user.status === "LOCKED" ? <Unlock className="size-4" /> : <Lock className="size-4" />}
                      </button>
                    </div>
                  </article>
                ))}
              </div>

              {/* Pagination Footer */}
              <footer className="admin-pagination-footer">
                <span className="admin-pagination-info">
                  Hiển thị {(userPage.page - 1) * pageSize + 1}–
                  {Math.min(userPage.page * pageSize, userPage.total)} trên tổng số {userPage.total} tài khoản
                </span>

                <nav className="admin-pagination-controls" aria-label="Phân trang danh sách người dùng">
                  <button
                    type="button"
                    className="admin-pagination-btn"
                    disabled={userPage.page <= 1}
                    onClick={() => setPage(Math.max(1, userPage.page - 1))}
                  >
                    <ChevronLeft className="size-4" />
                    <span>Trang trước</span>
                  </button>

                  <span className="admin-pagination-page" aria-current="page">
                    Trang {userPage.page} / {userPage.totalPages}
                  </span>

                  <button
                    type="button"
                    className="admin-pagination-btn"
                    disabled={!userPage.hasMore}
                    onClick={() => setPage(userPage.page + 1)}
                  >
                    <span>Trang sau</span>
                    <ChevronRight className="size-4" />
                  </button>
                </nav>
              </footer>
            </>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <LockAccountDialog
        user={selectedUserForLock}
        isOpen={isLockModalOpen}
        onClose={() => {
          setIsLockModalOpen(false);
          setSelectedUserForLock(null);
        }}
        onActionComplete={(msg) => { toast.success(msg); setRefreshKey(value => value + 1); }}
      />

      <ChangeRoleDialog
        user={selectedUserForRole}
        isOpen={isRoleModalOpen}
        onClose={() => {
          setIsRoleModalOpen(false);
          setSelectedUserForRole(null);
        }}
        onActionComplete={(msg) => { toast.success(msg); setRefreshKey(value => value + 1); }}
      />
    </main>
  );
}
