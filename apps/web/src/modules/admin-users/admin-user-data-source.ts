import type {
  AdminUserSummary,
  AdminUserDetail,
  AdminUserFilters,
  AdminUserPage,
  AdminUserStatistics,
  AdminUserAuditEvent,
  AdminUserActionResult,
  AdminUserRole,
  AdminUserStatus,
} from "./admin-user-contract";

/**
 * Fixture dataset used in development and automated testing.
 * Clearly demarcated as mock data. In production without Phase 2 API,
 * the data source returns empty data or unavailable states to maintain integrity.
 */
export const DEV_FIXTURE_USERS: AdminUserDetail[] = [
  {
    id: "usr_admin_01",
    name: "Trần Xuân Hoài",
    email: "xuanhoai.admin@hagiang.vn",
    image: null,
    role: "ADMIN",
    status: "ACTIVE",
    emailVerified: true,
    createdAt: "2025-01-10T08:30:00Z",
    updatedAt: "2025-10-15T14:20:00Z",
    lastLoginAt: "2025-10-17T09:12:00Z",
    sessionCount: 2,
    activeSessions: [
      {
        id: "sess_01a",
        createdAt: "2025-10-17T08:00:00Z",
        expiresAt: "2025-10-24T08:00:00Z",
        ipAddress: "118.70.188.42",
        userAgent: "Chrome 129.0 / Windows 11",
      },
      {
        id: "sess_01b",
        createdAt: "2025-10-16T15:20:00Z",
        expiresAt: "2025-10-23T15:20:00Z",
        ipAddress: "14.232.209.11",
        userAgent: "Safari / iOS 17.5",
      },
    ],
  },
  {
    id: "usr_admin_02",
    name: "Lê Minh Tuấn",
    email: "minhtuan.ops@hagiang.vn",
    image: null,
    role: "ADMIN",
    status: "ACTIVE",
    emailVerified: true,
    createdAt: "2025-02-01T10:00:00Z",
    updatedAt: "2025-10-12T11:45:00Z",
    lastLoginAt: "2025-10-16T18:30:00Z",
    sessionCount: 1,
    activeSessions: [
      {
        id: "sess_02a",
        createdAt: "2025-10-16T18:00:00Z",
        expiresAt: "2025-10-23T18:00:00Z",
        ipAddress: "171.244.18.90",
        userAgent: "Firefox 131.0 / macOS Sonoma",
      },
    ],
  },
  {
    id: "usr_traveler_03",
    name: "Nguyễn Hải Đăng",
    email: "haidang.traveler@gmail.com",
    image: null,
    role: "TRAVELER",
    status: "ACTIVE",
    emailVerified: true,
    createdAt: "2025-03-15T14:10:00Z",
    updatedAt: "2025-09-20T08:15:00Z",
    lastLoginAt: "2025-10-14T20:45:00Z",
    sessionCount: 1,
    activeSessions: [
      {
        id: "sess_03a",
        createdAt: "2025-10-14T20:00:00Z",
        expiresAt: "2025-10-21T20:00:00Z",
        ipAddress: "115.79.136.210",
        userAgent: "Edge 129.0 / Windows 10",
      },
    ],
  },
  {
    id: "usr_traveler_04",
    name: "Phạm Thúy Vi",
    email: "thuyvi.phm@outlook.com",
    image: null,
    role: "TRAVELER",
    status: "LOCKED",
    emailVerified: true,
    createdAt: "2025-04-02T09:25:00Z",
    updatedAt: "2025-10-05T16:00:00Z",
    lastLoginAt: "2025-10-05T15:50:00Z",
    lockReason: "Nghi vấn vi phạm điều khoản nội dung và đăng nhập bất thường",
    lockedAt: "2025-10-05T16:00:00Z",
    sessionCount: 0,
    activeSessions: [],
  },
  {
    id: "usr_traveler_05",
    name: "Vũ Bảo Long",
    email: "baolong.vu@gmail.com",
    image: null,
    role: "TRAVELER",
    status: "ACTIVE",
    emailVerified: false,
    createdAt: "2025-05-18T16:40:00Z",
    updatedAt: "2025-05-18T16:40:00Z",
    lastLoginAt: "2025-05-18T16:45:00Z",
    sessionCount: 1,
    activeSessions: [
      {
        id: "sess_05a",
        createdAt: "2025-05-18T16:40:00Z",
        expiresAt: "2025-05-25T16:40:00Z",
        ipAddress: "27.72.63.10",
        userAgent: "Chrome Mobile / Android 14",
      },
    ],
  },
  {
    id: "usr_traveler_06",
    name: "Hoàng Kim Yến",
    email: "kimyen.hoang@yahoo.com",
    image: null,
    role: "TRAVELER",
    status: "UNKNOWN",
    emailVerified: false,
    createdAt: "2025-06-11T11:20:00Z",
    updatedAt: "2025-06-11T11:20:00Z",
    lastLoginAt: null,
    sessionCount: 0,
    activeSessions: [],
  },
  {
    id: "usr_traveler_07",
    name: "Đặng Gia Huy",
    email: "giahuy.dang@gmail.com",
    image: null,
    role: "TRAVELER",
    status: "ACTIVE",
    emailVerified: true,
    createdAt: "2025-07-22T13:00:00Z",
    updatedAt: "2025-10-10T09:30:00Z",
    lastLoginAt: "2025-10-17T06:10:00Z",
    sessionCount: 1,
    activeSessions: [
      {
        id: "sess_07a",
        createdAt: "2025-10-17T06:00:00Z",
        expiresAt: "2025-10-24T06:00:00Z",
        ipAddress: "123.30.144.5",
        userAgent: "Chrome 129.0 / Windows 11",
      },
    ],
  },
  {
    id: "usr_traveler_08",
    name: "Bùi Phương Thảo",
    email: "phuongthao.bui@icloud.com",
    image: null,
    role: "TRAVELER",
    status: "LOCKED",
    emailVerified: true,
    createdAt: "2025-08-04T17:15:00Z",
    updatedAt: "2025-10-01T10:00:00Z",
    lastLoginAt: "2025-09-30T22:15:00Z",
    lockReason: "Yêu cầu tự tạm khóa tài khoản từ phía chủ sở hữu",
    lockedAt: "2025-10-01T10:00:00Z",
    sessionCount: 0,
    activeSessions: [],
  },
  {
    id: "usr_traveler_09",
    name: "Mai Quốc Bảo",
    email: "quocbao.mai@gmail.com",
    image: null,
    role: "TRAVELER",
    status: "ACTIVE",
    emailVerified: true,
    createdAt: "2025-09-01T07:50:00Z",
    updatedAt: "2025-10-16T12:00:00Z",
    lastLoginAt: "2025-10-16T11:50:00Z",
    sessionCount: 2,
    activeSessions: [
      {
        id: "sess_09a",
        createdAt: "2025-10-16T11:00:00Z",
        expiresAt: "2025-10-23T11:00:00Z",
        ipAddress: "14.161.42.11",
        userAgent: "Safari / iOS 18",
      },
    ],
  },
  {
    id: "usr_traveler_10",
    name: "Dương Ánh Tuyết",
    email: "anhtuyet.duong@gmail.com",
    image: null,
    role: "TRAVELER",
    status: "ACTIVE",
    emailVerified: true,
    createdAt: "2025-10-01T14:30:00Z",
    updatedAt: "2025-10-17T08:00:00Z",
    lastLoginAt: "2025-10-17T07:45:00Z",
    sessionCount: 1,
    activeSessions: [
      {
        id: "sess_10a",
        createdAt: "2025-10-17T07:00:00Z",
        expiresAt: "2025-10-24T07:00:00Z",
        ipAddress: "171.224.89.5",
        userAgent: "Chrome 129.0 / macOS Sonoma",
      },
    ],
  },
];

export const DEV_FIXTURE_AUDIT_LOGS: AdminUserAuditEvent[] = [
  {
    id: "audit_01",
    eventType: "USER_LOCKED",
    actorId: "usr_admin_01",
    actorName: "Trần Xuân Hoài",
    actorEmail: "xuanhoai.admin@hagiang.vn",
    targetUserId: "usr_traveler_04",
    targetUserName: "Phạm Thúy Vi",
    timestamp: "2025-10-05T16:00:00Z",
    reason: "Nghi vấn vi phạm điều khoản nội dung và đăng nhập bất thường",
    isMock: true,
  },
  {
    id: "audit_02",
    eventType: "USER_LOCKED",
    actorId: "usr_admin_01",
    actorName: "Trần Xuân Hoài",
    actorEmail: "xuanhoai.admin@hagiang.vn",
    targetUserId: "usr_traveler_08",
    targetUserName: "Bùi Phương Thảo",
    timestamp: "2025-10-01T10:00:00Z",
    reason: "Yêu cầu tự tạm khóa tài khoản từ phía chủ sở hữu",
    isMock: true,
  },
  {
    id: "audit_03",
    eventType: "ROLE_CHANGED",
    actorId: "usr_admin_01",
    actorName: "Trần Xuân Hoài",
    actorEmail: "xuanhoai.admin@hagiang.vn",
    targetUserId: "usr_admin_02",
    targetUserName: "Lê Minh Tuấn",
    timestamp: "2025-02-01T10:05:00Z",
    details: { oldRole: "TRAVELER", newRole: "ADMIN" },
    isMock: true,
  },
  {
    id: "audit_04",
    eventType: "SESSION_REVOKED",
    actorId: "usr_admin_02",
    actorName: "Lê Minh Tuấn",
    actorEmail: "minhtuan.ops@hagiang.vn",
    targetUserId: "usr_traveler_04",
    targetUserName: "Phạm Thúy Vi",
    timestamp: "2025-10-05T16:01:00Z",
    reason: "Thu hồi tất cả phiên đăng nhập sau khi khóa tài khoản",
    isMock: true,
  },
];

/**
 * Filter, sort, and paginate a collection of users in memory
 */
export function filterAndPaginateUsers(
  users: AdminUserSummary[],
  filters: AdminUserFilters = {}
): AdminUserPage {
  const {
    search = "",
    role = "ALL",
    status = "ALL",
    sortBy = "createdAt",
    sortOrder = "desc",
    page = 1,
    pageSize = 6,
  } = filters;

  const query = search.trim().toLowerCase();

  let filtered = users.filter((u) => {
    // Search by name or email
    if (query) {
      const matchName = u.name.toLowerCase().includes(query);
      const matchEmail = u.email.toLowerCase().includes(query);
      if (!matchName && !matchEmail) return false;
    }
    // Filter by role
    if (role !== "ALL" && u.role !== role) {
      return false;
    }
    // Filter by status
    if (status !== "ALL" && u.status !== status) {
      return false;
    }
    return true;
  });

  // Sort
  filtered.sort((a, b) => {
    let comparison = 0;
    if (sortBy === "name") {
      comparison = a.name.localeCompare(b.name, "vi");
    } else {
      // Default to createdAt
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      comparison = dateA - dateB;
    }
    return sortOrder === "asc" ? comparison : -comparison;
  });

  const total = filtered.length;
  const safePageSize = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const startIndex = (currentPage - 1) * safePageSize;
  const items = filtered.slice(startIndex, startIndex + safePageSize);

  return {
    items,
    total,
    page: currentPage,
    pageSize: safePageSize,
    totalPages,
    hasMore: currentPage < totalPages,
    isMockData: true,
  };
}

/**
 * Calculate user dashboard statistics
 */
export function computeUserStatistics(users: AdminUserSummary[]): AdminUserStatistics {
  const travelerCount = users.filter((u) => u.role === "TRAVELER").length;
  const adminCount = users.filter((u) => u.role === "ADMIN").length;
  const lockedCount = users.filter((u) => u.status === "LOCKED").length;

  return {
    totalUsers: users.length,
    travelerCount,
    adminCount,
    lockedCount,
  };
}

/**
 * Interface for User Management Data Source
 */
export interface AdminUserDataSource {
  getUsers(filters: AdminUserFilters): Promise<AdminUserPage>;
  getStatistics(): Promise<AdminUserStatistics>;
  getUserById(id: string): Promise<AdminUserDetail | null>;
  getUserAuditEvents(userId?: string): Promise<AdminUserAuditEvent[]>;
  requestChangeRole(
    userId: string,
    newRole: AdminUserRole
  ): Promise<AdminUserActionResult>;
  requestLockUser(
    userId: string,
    reason?: string
  ): Promise<AdminUserActionResult>;
  requestUnlockUser(userId: string): Promise<AdminUserActionResult>;
  requestRevokeSessions(userId: string): Promise<AdminUserActionResult>;
}

/**
 * Default Frontend Implementation of AdminUserDataSource.
 * Handles development mode with rich fixtures labeled as mock data,
 * and handles production mode safely by returning empty/placeholder states
 * without simulating fake database persistence or fake mutations.
 */
export class ClientAdminUserDataSource implements AdminUserDataSource {
  private users: AdminUserDetail[];
  private auditLogs: AdminUserAuditEvent[];
  private isDevelopment: boolean;

  constructor(customUsers?: AdminUserDetail[], isDevelopment = true) {
    this.isDevelopment = isDevelopment;
    this.users = customUsers ?? (isDevelopment ? DEV_FIXTURE_USERS : []);
    this.auditLogs = isDevelopment ? DEV_FIXTURE_AUDIT_LOGS : [];
  }

  async getUsers(filters: AdminUserFilters): Promise<AdminUserPage> {
    if (!this.isDevelopment && this.users.length === 0) {
      return {
        items: [],
        total: 0,
        page: 1,
        pageSize: filters.pageSize ?? 6,
        totalPages: 1,
        hasMore: false,
        isMockData: false,
      };
    }
    return filterAndPaginateUsers(this.users, filters);
  }

  async getStatistics(): Promise<AdminUserStatistics> {
    if (!this.isDevelopment && this.users.length === 0) {
      return {
        totalUsers: 0,
        travelerCount: 0,
        adminCount: 0,
        lockedCount: 0,
        isPlaceholder: true,
      };
    }
    return computeUserStatistics(this.users);
  }

  async getUserById(id: string): Promise<AdminUserDetail | null> {
    const user = this.users.find((u) => u.id === id);
    return user ?? null;
  }

  async getUserAuditEvents(userId?: string): Promise<AdminUserAuditEvent[]> {
    if (!this.isDevelopment) {
      return [];
    }
    if (userId) {
      return this.auditLogs.filter((log) => log.targetUserId === userId);
    }
    return this.auditLogs;
  }

  async requestChangeRole(
    userId: string,
    _newRole: AdminUserRole
  ): Promise<AdminUserActionResult> {
    return {
      success: false,
      requiresPhase2Backend: true,
      message: `Chức năng thay đổi vai trò tài khoản [${userId}] chưa được kết nối Backend Phase 2. Chưa có thay đổi nào được áp dụng vào cơ sở dữ liệu.`,
    };
  }

  async requestLockUser(
    userId: string,
    _reason?: string
  ): Promise<AdminUserActionResult> {
    return {
      success: false,
      requiresPhase2Backend: true,
      message: `Chức năng khóa tài khoản [${userId}] chưa được kết nối Backend Phase 2. Chưa có thay đổi nào được áp dụng vào cơ sở dữ liệu.`,
    };
  }

  async requestUnlockUser(userId: string): Promise<AdminUserActionResult> {
    return {
      success: false,
      requiresPhase2Backend: true,
      message: `Chức năng mở khóa tài khoản [${userId}] chưa được kết nối Backend Phase 2. Chưa có thay đổi nào được áp dụng vào cơ sở dữ liệu.`,
    };
  }

  async requestRevokeSessions(userId: string): Promise<AdminUserActionResult> {
    return {
      success: false,
      requiresPhase2Backend: true,
      message: `Chức năng thu hồi phiên đăng nhập [${userId}] chưa được kết nối Backend Phase 2. Chưa có thay đổi nào được áp dụng vào cơ sở dữ liệu.`,
    };
  }
}

/**
 * Singleton instance used across frontend components
 */
export const defaultAdminUserDataSource = new ClientAdminUserDataSource(
  DEV_FIXTURE_USERS,
  true // Enabled for development / review mode
);
