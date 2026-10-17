import { Prisma, type Database } from "@KLTN/db";
import { requireActor, type AuthorizationDependencies } from "@/server/authorization/guard";
import { AppError } from "@/server/http/app-error";
import { executeIdempotentWrite } from "@/server/http/idempotency";
import { auditQuerySchema, emptyInputSchema, lockInputSchema, roleInputSchema, userFiltersSchema, userIdSchema } from "./admin-user-schema";

export type AdminUserDependencies = AuthorizationDependencies & { database: Database };
export type UserAction = "role" | "lock" | "unlock" | "revoke-sessions";
const userSelect = { id: true, name: true, email: true, image: true, role: true, status: true, emailVerified: true, createdAt: true, updatedAt: true } satisfies Prisma.UserSelect;
type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;
const summary = (user: UserRow, sessionCount: number) => ({ ...user, createdAt: user.createdAt.toISOString(), updatedAt: user.updatedAt.toISOString(), lastLoginAt: null, sessionCount });
function invalid(): never { throw new AppError("INVALID_USER_REQUEST", "Yêu cầu quản lý người dùng không hợp lệ.", 400); }
function idOf(id: string) { if (!userIdSchema.safeParse(id).success) throw new AppError("USER_NOT_FOUND", "Không tìm thấy tài khoản.", 404); return id; }
async function exists(db: Pick<Database, "user">, id: string) {
  const user = await db.user.findUnique({ where: { id: idOf(id) }, select: { id: true } });
  if (!user) throw new AppError("USER_NOT_FOUND", "Không tìm thấy tài khoản.", 404);
}

export async function readAdminUsers(headers: Headers, deps: AdminUserDependencies, kind: "list" | "statistics" | "detail" | "audit", query: Record<string, string>, id = "") {
  await requireActor(headers, deps, "admin");
  const now = new Date();
  if (kind === "list") {
    const parsed = userFiltersSchema.safeParse(query); if (!parsed.success) invalid();
    const f = parsed.data;
    const where: Prisma.UserWhereInput = {
      ...(f.role !== "ALL" ? { role: f.role } : {}), ...(f.status !== "ALL" ? { status: f.status } : {}),
      ...(f.search ? { OR: [{ name: { contains: f.search, mode: "insensitive" } }, { email: { contains: f.search, mode: "insensitive" } }] } : {}),
    };
    return deps.database.$transaction(async tx => {
      const total = await tx.user.count({ where });
      const totalPages = Math.max(1, Math.ceil(total / f.pageSize)), page = Math.min(f.page, totalPages);
      const users = await tx.user.findMany({ where, orderBy: [{ [f.sortBy]: f.sortOrder }, { id: "asc" }], skip: (page - 1) * f.pageSize, take: f.pageSize,
        select: { ...userSelect, _count: { select: { sessions: { where: { expiresAt: { gt: now } } } } } } });
      return { items: users.map(({ _count, ...user }) => summary(user, _count.sessions)), total, totalPages, page, pageSize: f.pageSize, hasMore: page < totalPages, isMockData: false };
    }, { isolationLevel: "RepeatableRead" });
  }
  if (kind === "statistics") {
    if (Object.keys(query).length) invalid();
    const groups = await deps.database.user.groupBy({ by: ["role", "status"], _count: true });
    return groups.reduce((result, group) => ({ totalUsers: result.totalUsers + group._count, travelerCount: result.travelerCount + (group.role === "TRAVELER" ? group._count : 0), adminCount: result.adminCount + (group.role === "ADMIN" ? group._count : 0), lockedCount: result.lockedCount + (group.status === "LOCKED" ? group._count : 0) }), { totalUsers: 0, travelerCount: 0, adminCount: 0, lockedCount: 0 });
  }
  idOf(id);
  if (kind === "audit") {
    const parsed = auditQuerySchema.safeParse(query); if (!parsed.success) invalid();
    await exists(deps.database, id);
    const { page, pageSize } = parsed.data;
    const rows = await deps.database.adminAuditEvent.findMany({ where: { targetUserId: id }, orderBy: [{ timestamp: "desc" }, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize + 1,
      select: { id: true, eventType: true, actorId: true, targetUserId: true, timestamp: true, reason: true, details: true, actor: { select: { name: true, email: true } }, targetUser: { select: { name: true } } } });
    return { items: rows.slice(0, pageSize).map(({ actor, targetUser, timestamp, reason, details, ...row }) => ({ ...row, timestamp: timestamp.toISOString(), actorName: actor.name, actorEmail: actor.email, targetUserName: targetUser.name, ...(reason ? { reason } : {}), ...(details ? { details } : {}) })), page, pageSize, hasMore: rows.length > pageSize };
  }
  if (Object.keys(query).length) invalid();
  const user = await deps.database.$transaction(tx => tx.user.findUnique({ where: { id }, select: { ...userSelect, lockedAt: true, lockReason: true, _count: { select: { sessions: { where: { expiresAt: { gt: now } } } } },
    sessions: { where: { expiresAt: { gt: now } }, take: 20, orderBy: [{ createdAt: "desc" }, { id: "asc" }], select: { id: true, createdAt: true, expiresAt: true, userAgent: true } } } }), { isolationLevel: "RepeatableRead" });
  if (!user) throw new AppError("USER_NOT_FOUND", "Không tìm thấy tài khoản.", 404);
  const { sessions, _count, lockedAt, lockReason, ...row } = user;
  return { ...summary(row, _count.sessions), lockedAt: lockedAt?.toISOString() ?? null, lockReason, activeSessions: sessions.map(session => ({ ...session, createdAt: session.createdAt.toISOString(), expiresAt: session.expiresAt.toISOString(), userAgent: session.userAgent?.slice(0, 200) ?? null })) };
}

export async function mutateAdminUser(headers: Headers, deps: AdminUserDependencies, id: string, action: UserAction, raw: unknown, key: string) {
  const actor = await requireActor(headers, deps, "admin"); idOf(id);
  const schema = action === "role" ? roleInputSchema : action === "lock" ? lockInputSchema : emptyInputSchema;
  const parsed = schema.safeParse(raw); if (!parsed.success) invalid();
  const input = parsed.data as { role?: "ADMIN" | "TRAVELER"; reason?: string };
  return executeIdempotentWrite({ database: deps.database, actorId: actor.id, operation: `admin-user:${action}`, key, input: { userId: id, ...input }, execute: async tx => {
    // Serialize all CMS privilege/status changes BEFORE rechecking the actor.
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended('admin-user-management-v2',0))::text AS locked`);
    const current = await requireActor(headers, { ...deps, database: tx as unknown as Database }, "admin");
    if (current.id !== actor.id) throw new AppError("UNAUTHENTICATED", "Phiên đăng nhập đã thay đổi.", 401);
    const rows = await tx.$queryRaw<Array<{ id: string; role: "ADMIN" | "TRAVELER"; status: "ACTIVE" | "LOCKED" }>>(Prisma.sql`SELECT id,role,status FROM "user" WHERE id=${id} FOR UPDATE`);
    const target = rows[0]; if (!target) throw new AppError("USER_NOT_FOUND", "Không tìm thấy tài khoản.", 404);
    if (id === current.id) throw new AppError("SELF_ADMIN_ACTION_DENIED", "Không thể tự đổi quyền, khóa hoặc thu hồi phiên của mình trong CMS.", 409);
    const reducing = target.role === "ADMIN" && target.status === "ACTIVE" && (action === "lock" || action === "role" && input.role === "TRAVELER");
    if (reducing && await tx.user.count({ where: { role: "ADMIN", status: "ACTIVE" } }) <= 1) throw new AppError("LAST_ACTIVE_ADMIN", "Không thể vô hiệu hóa quản trị viên hoạt động cuối cùng.", 409);
    let revokedSessionsCount = 0;
    let details: Prisma.InputJsonObject;
    const now = new Date();
    if (action === "role") {
      if (target.role === input.role) throw new AppError("USER_UNCHANGED", "Tài khoản đã có vai trò này.", 409);
      await tx.user.update({ where: { id }, data: { role: input.role! } });
      details = { oldRole: target.role, newRole: input.role! };
    } else if (action === "lock" || action === "unlock") {
      const status = action === "lock" ? "LOCKED" : "ACTIVE";
      if (target.status === status) throw new AppError("USER_UNCHANGED", "Trạng thái tài khoản không thay đổi.", 409);
      await tx.user.update({ where: { id }, data: { status, lockedAt: action === "lock" ? now : null, lockReason: action === "lock" ? input.reason || null : null } });
      if (action === "lock") {
        // Delete all stored sessions; report only ones active at this operation.
        revokedSessionsCount = await tx.session.count({ where: { userId: id, expiresAt: { gt: now } } });
        await tx.session.deleteMany({ where: { userId: id } });
      }
      details = { oldStatus: target.status, newStatus: status, revokedSessionsCount };
    } else {
      revokedSessionsCount = (await tx.session.deleteMany({ where: { userId: id, expiresAt: { gt: now } } })).count;
      if (!revokedSessionsCount) throw new AppError("NO_ACTIVE_SESSIONS", "Không có phiên đang hoạt động để thu hồi.", 409);
      details = { revokedSessionsCount };
    }
    const eventType = { role: "ROLE_CHANGED", lock: "USER_LOCKED", unlock: "USER_UNLOCKED", "revoke-sessions": "SESSION_REVOKED" } as const;
    await tx.adminAuditEvent.create({ data: { actorId: current.id, targetUserId: id, eventType: eventType[action], reason: action === "lock" ? input.reason || null : null, details } });
    return { userId: id, action, revokedSessionsCount };
  } });
}
