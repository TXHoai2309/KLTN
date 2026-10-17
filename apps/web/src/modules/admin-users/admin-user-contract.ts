/**
 * Admin User Management CMS Contract
 * Defines domain types, filters, pagination, and data-source interfaces for user management.
 */

export type AdminUserRole = "ADMIN" | "TRAVELER";

export type AdminUserStatus = "ACTIVE" | "LOCKED" | "UNKNOWN";

export interface AdminUserSummary {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: AdminUserRole;
  status: AdminUserStatus;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  sessionCount?: number;
}

export interface AdminUserDetail extends AdminUserSummary {
  lockReason?: string | null;
  lockedAt?: string | null;
  activeSessions?: {
    id: string;
    createdAt: string;
    expiresAt: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  }[];
}

export type AdminUserSortField = "createdAt" | "name";
export type AdminUserSortOrder = "asc" | "desc";

export interface AdminUserFilters {
  search?: string;
  role?: AdminUserRole | "ALL";
  status?: AdminUserStatus | "ALL";
  sortBy?: AdminUserSortField;
  sortOrder?: AdminUserSortOrder;
  page?: number;
  pageSize?: number;
}

export interface AdminUserStatistics {
  totalUsers: number;
  travelerCount: number;
  adminCount: number;
  lockedCount: number;
  isPlaceholder?: boolean;
}

export interface AdminUserPage {
  items: AdminUserSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
  isMockData?: boolean;
}

export type AdminAuditEventType =
  | "ROLE_CHANGED"
  | "USER_LOCKED"
  | "USER_UNLOCKED"
  | "SESSION_REVOKED";

export interface AdminUserAuditEvent {
  id: string;
  eventType: AdminAuditEventType;
  actorId: string;
  actorName: string;
  actorEmail: string;
  targetUserId: string;
  targetUserName: string;
  timestamp: string;
  reason?: string;
  details?: Record<string, unknown>;
  isMock?: boolean;
}

export interface AdminUserActionResult {
  success: boolean;
  message: string;
  requiresPhase2Backend?: boolean;
}
