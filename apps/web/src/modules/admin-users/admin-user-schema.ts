import { z } from "zod";

export const userIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
export const userRoleSchema = z.enum(["ADMIN", "TRAVELER"]);
export const userStatusSchema = z.enum(["ACTIVE", "LOCKED"]);
export const userFiltersSchema = z.object({
  search: z.string().trim().normalize().max(200).default(""),
  role: z.enum(["ADMIN", "TRAVELER", "ALL"]).default("ALL"),
  status: z.enum(["ACTIVE", "LOCKED", "ALL"]).default("ALL"),
  sortBy: z.enum(["createdAt", "name"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(6),
}).strict();
export const auditQuerySchema = userFiltersSchema.pick({ page: true, pageSize: true }).extend({ pageSize: z.coerce.number().int().min(1).max(50).default(20) });
export const roleInputSchema = z.object({ role: userRoleSchema }).strict();
export const lockInputSchema = z.object({ reason: z.string().trim().normalize().max(500).optional() }).strict();
export const emptyInputSchema = z.object({}).strict();

export const summarySchema = z.object({
  id: z.string(), name: z.string(), email: z.string(), image: z.string().nullable(), role: userRoleSchema,
  status: userStatusSchema, emailVerified: z.boolean(), createdAt: z.string(), updatedAt: z.string(),
  lastLoginAt: z.null(), sessionCount: z.number().int().nonnegative(),
}).strict();
export const detailSchema = summarySchema.extend({
  lockReason: z.string().nullable(), lockedAt: z.string().nullable(),
  activeSessions: z.array(z.object({ id: z.string(), createdAt: z.string(), expiresAt: z.string(), userAgent: z.string().nullable() }).strict()),
});
export const userPageSchema = z.object({ items: z.array(summarySchema), total: z.number(), page: z.number(), pageSize: z.number(), totalPages: z.number(), hasMore: z.boolean(), isMockData: z.literal(false) }).strict();
export const statisticsSchema = z.object({ totalUsers: z.number(), travelerCount: z.number(), adminCount: z.number(), lockedCount: z.number() }).strict();
export const auditEventSchema = z.object({
  id: z.string(), eventType: z.enum(["ROLE_CHANGED", "USER_LOCKED", "USER_UNLOCKED", "SESSION_REVOKED"]),
  actorId: z.string(), actorName: z.string(), actorEmail: z.string(), targetUserId: z.string(), targetUserName: z.string(),
  timestamp: z.string(), reason: z.string().optional(), details: z.record(z.string(), z.unknown()).optional(),
}).strict();
export const auditPageSchema = z.object({ items: z.array(auditEventSchema), page: z.number(), pageSize: z.number(), hasMore: z.boolean() }).strict();
export const actionDataSchema = z.object({ userId: z.string(), action: z.enum(["role", "lock", "unlock", "revoke-sessions"]), revokedSessionsCount: z.number().int().nonnegative() }).strict();
