# KLTN — Admin User Management Phase 2 API Contract & Backend Specification

Tài liệu này xác định giao ước API (API Contract) và yêu cầu backend cho Phase 2 của hệ thống **CMS Quản lý người dùng (Admin User Management)** thuộc dự án Hà Giang Travel Assistant.

---

## 1. Tổng quan & Phạm vi

Phase 1 đã triển khai toàn bộ giao diện Frontend Admin User Management tại `/admin/users` và `/admin/users/[id]`, bao gồm:
- Thống kê tài khoản (Total, Traveler, Admin, Locked).
- Bảng danh sách tài khoản kèm bộ lọc vai trò, trạng thái, tìm kiếm debounced và phân trang.
- Trang chi tiết hồ sơ tài khoản (User Profile & Session Overview).
- Dialog khóa/mở khóa tài khoản (Lock/Unlock Account Dialog).
- Dialog thay đổi vai trò (Change Role Dialog).
- Dòng thời gian lịch sử thao tác quản trị (Audit Log Timeline).
- Chặn gọi mutation giả và phân biệt rõ ràng trạng thái chưa kết nối backend.

Trong Phase 2, backend cần hiện thực các Route Handlers, schema updates và audit persistence để kết nối với Frontend đã chuẩn bị sẵn.

---

## 2. Đề xuất Schema Database Updates (Prisma)

Hiện tại model `User` trong Better Auth (`packages/db/prisma/schema/auth.prisma`) gồm:
- `id`: String (cuid/uuid)
- `name`: String
- `email`: String (unique)
- `emailVerified`: Boolean
- `image`: String?
- `role`: UserRole (`TRAVELER` | `ADMIN`)
- `createdAt`: DateTime
- `updatedAt`: DateTime
- `sessions`: Session[]
- `accounts`: Account[]

### Các trường đề xuất bổ sung cho Phase 2:
```prisma
model User {
  // ... existing fields ...
  status        UserStatus   @default(ACTIVE)
  lockedAt      DateTime?
  lockReason    String?
  lastLoginAt   DateTime?

  auditEvents   AdminAuditEvent[] @relation("TargetUser")
  actionsDone   AdminAuditEvent[] @relation("ActorAdmin")
}

enum UserStatus {
  ACTIVE
  LOCKED
  SUSPENDED
}

model AdminAuditEvent {
  id           String             @id @default(cuid())
  eventType    AdminAuditEventType
  actorId      String
  targetUserId String
  timestamp    DateTime           @default(now())
  reason       String?
  details      Json?

  actor        User               @relation("ActorAdmin", fields: [actorId], references: [id])
  targetUser   User               @relation("TargetUser", fields: [targetUserId], references: [id])

  @@index([targetUserId, timestamp])
  @@index([actorId, timestamp])
}

enum AdminAuditEventType {
  ROLE_CHANGED
  USER_LOCKED
  USER_UNLOCKED
  SESSION_REVOKED
}
```

---

## 3. Danh sách Endpoints RESTful cho Phase 2

Tất cả các endpoints này đều yêu cầu bảo mật:
- Session hợp lệ.
- Vai trò `ADMIN` được xác thực bởi `requireActor(headers, authorizationDependencies, "admin")`.
- Trả về mã lỗi chuẩn: `401 Unauthorized`, `403 Forbidden`, `400 Bad Request`, `404 Not Found`, `500 Internal Error`.

### 3.1. `GET /api/admin/users`
Lấy danh sách người dùng có phân trang và bộ lọc.

**Query Parameters:**
- `search` (string, optional): Từ khóa tìm kiếm theo tên hoặc email.
- `role` (`ADMIN` | `TRAVELER` | `ALL`, optional, default `ALL`).
- `status` (`ACTIVE` | `LOCKED` | `ALL`, optional, default `ALL`).
- `sortBy` (`createdAt` | `name`, default `createdAt`).
- `sortOrder` (`asc` | `desc`, default `desc`).
- `page` (number, default 1).
- `pageSize` (number, default 10).

**Response (200 OK):**
```json
{
  "items": [
    {
      "id": "usr_123",
      "name": "Nguyễn Văn A",
      "email": "vana@gmail.com",
      "image": null,
      "role": "TRAVELER",
      "status": "ACTIVE",
      "emailVerified": true,
      "createdAt": "2025-05-10T08:00:00Z",
      "updatedAt": "2025-10-15T12:00:00Z",
      "lastLoginAt": "2025-10-17T09:00:00Z",
      "sessionCount": 1
    }
  ],
  "total": 45,
  "page": 1,
  "pageSize": 10,
  "totalPages": 5,
  "hasMore": true
}
```

---

### 3.2. `GET /api/admin/users/statistics`
Lấy số liệu tổng quan người dùng cho dashboard cards.

**Response (200 OK):**
```json
{
  "totalUsers": 128,
  "travelerCount": 122,
  "adminCount": 6,
  "lockedCount": 2
}
```

---

### 3.3. `GET /api/admin/users/[id]`
Lấy chi tiết hồ sơ tài khoản và trạng thái các phiên đăng nhập.

**Response (200 OK):**
```json
{
  "id": "usr_123",
  "name": "Nguyễn Văn A",
  "email": "vana@gmail.com",
  "image": null,
  "role": "TRAVELER",
  "status": "ACTIVE",
  "emailVerified": true,
  "createdAt": "2025-05-10T08:00:00Z",
  "updatedAt": "2025-10-15T12:00:00Z",
  "lastLoginAt": "2025-10-17T09:00:00Z",
  "lockReason": null,
  "lockedAt": null,
  "sessionCount": 2,
  "activeSessions": [
    {
      "id": "sess_abc",
      "createdAt": "2025-10-17T08:00:00Z",
      "expiresAt": "2025-10-24T08:00:00Z",
      "ipAddress": "14.232.209.11",
      "userAgent": "Chrome 129.0 / Windows 11"
    }
  ]
}
```

---

### 3.4. `PATCH /api/admin/users/[id]/role`
Thay đổi vai trò của người dùng (`ADMIN` <-> `TRAVELER`).

**Yêu cầu an toàn nghiệp vụ (Business Invariants):**
- Không cho phép admin tự hạ vai trò của chính mình thành Traveler nếu không còn ít nhất 1 admin khác trong hệ thống ("Last Admin Protection"). Phải thực hiện kiểm tra này trong transaction database có lock.
- Ghi 1 bản ghi vào `AdminAuditEvent` với `eventType: "ROLE_CHANGED"`.

**Request Body:**
```json
{
  "role": "ADMIN"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "user": {
    "id": "usr_123",
    "role": "ADMIN"
  }
}
```

---

### 3.5. `POST /api/admin/users/[id]/lock`
Khóa tài khoản người dùng và tự động thu hồi tất cả các phiên đăng nhập còn hiệu lực.

**Request Body:**
```json
{
  "reason": "Vi phạm điều khoản dịch vụ và đăng nhập đáng ngờ"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "status": "LOCKED",
  "lockedAt": "2025-10-17T15:20:00Z",
  "revokedSessionsCount": 2
}
```

---

### 3.6. `POST /api/admin/users/[id]/unlock`
Mở khóa tài khoản người dùng và chuyển trạng thái về `ACTIVE`.

**Response (200 OK):**
```json
{
  "success": true,
  "status": "ACTIVE"
}
```

---

### 3.7. `POST /api/admin/users/[id]/revoke-sessions`
Thu hồi toàn bộ phiên đăng nhập của người dùng mục tiêu mà không khóa tài khoản.

**Response (200 OK):**
```json
{
  "success": true,
  "revokedCount": 2
}
```

---

### 3.8. `GET /api/admin/users/[id]/audit-logs`
Lấy danh sách nhật ký kiểm toán quản trị liên quan đến người dùng này.

**Response (200 OK):**
```json
[
  {
    "id": "audit_1",
    "eventType": "USER_LOCKED",
    "actorId": "usr_admin_01",
    "actorName": "Trần Xuân Hoài",
    "actorEmail": "xuanhoai.admin@hagiang.vn",
    "targetUserId": "usr_123",
    "targetUserName": "Nguyễn Văn A",
    "timestamp": "2025-10-17T15:20:00Z",
    "reason": "Vi phạm điều khoản dịch vụ"
  }
]
```

---

## 4. Kiến trúc Frontend Adapter Sẵn Sàng (Frontend Readiness)

Trong Phase 1, `ClientAdminUserDataSource` trong file [admin-user-data-source.ts](file:///d:/KLTN/KLTN/apps/web/src/modules/admin-users/admin-user-data-source.ts) đã được thiết kế sẵn sàng để thay thế bằng `HttpAdminUserDataSource` gọi các API trên khi Phase 2 hoàn thành.
Không có thay đổi nào về giao diện hay contract cần phải sửa đổi khi kết nối backend thật.
