import { z } from "zod";
import type { AdminUserActionResult, AdminUserDetail, AdminUserFilters, AdminUserPage, AdminUserRole, AdminUserStatistics, AdminUserAuditEvent } from "./admin-user-contract";
import { actionDataSchema, auditPageSchema, detailSchema, statisticsSchema, userPageSchema } from "./admin-user-schema";
import { buildAuthLoginHref } from "@/lib/auth-return-to";

export interface AdminUserDataSource {
  getUsers(filters: AdminUserFilters): Promise<AdminUserPage>;
  getStatistics(): Promise<AdminUserStatistics>;
  getUserById(id: string): Promise<AdminUserDetail | null>;
  getUserAuditEvents(userId?: string, page?: number): Promise<AdminUserAuditEvent[]>;
  requestChangeRole(userId: string, newRole: AdminUserRole): Promise<AdminUserActionResult>;
  requestLockUser(userId: string, reason?: string): Promise<AdminUserActionResult>;
  requestUnlockUser(userId: string): Promise<AdminUserActionResult>;
  requestRevokeSessions(userId: string): Promise<AdminUserActionResult>;
}
export class AdminUserApiError extends Error { constructor(message: string, public status: number) { super(message); } }
function lostAccess(status: number) {
  if (typeof window !== "undefined" && (status === 401 || status === 403)) {
    window.location.assign(status === 401 ? buildAuthLoginHref(window.location.pathname) : "/dashboard");
  }
}
export class HttpAdminUserDataSource implements AdminUserDataSource {
  private attempts = new Map<string, { key: string; body: string; unknown: boolean }>();
  private pending = new Set<string>();
  constructor(private fetcher: typeof fetch = (...args) => fetch(...args)) {}
  private async read<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    const response = await this.fetcher(path, { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(15_000) });
    const body = await response.json();
    if (!response.ok) { lostAccess(response.status); throw new AdminUserApiError(body?.error?.message ?? "Không thể tải dữ liệu người dùng.", response.status); }
    const parsed = z.object({ success: z.literal(true), data: schema }).strict().safeParse(body);
    if (!parsed.success) throw new AdminUserApiError("Phản hồi máy chủ không hợp lệ.", 502);
    return parsed.data.data;
  }
  getUsers(filters: AdminUserFilters) {
    const query = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value !== undefined) query.set(key, String(value)); });
    return this.read(`/api/admin/users?${query}`, userPageSchema);
  }
  getStatistics() { return this.read("/api/admin/users/statistics", statisticsSchema); }
  async getUserById(id: string) {
    try { return await this.read(`/api/admin/users/${encodeURIComponent(id)}`, detailSchema); }
    catch (error) { if (error instanceof AdminUserApiError && error.status === 404) return null; throw error; }
  }
  async getUserAuditEvents(id?: string, page = 1) {
    if (!id) throw new AdminUserApiError("Cần chọn tài khoản để xem nhật ký.", 400);
    return (await this.read(`/api/admin/users/${encodeURIComponent(id)}/audit-logs?page=${page}&pageSize=20`, auditPageSchema)).items;
  }
  private async mutate(id: string, action: string, input: unknown): Promise<AdminUserActionResult> {
    const scope = `${id}:${action}`;
    if (this.pending.has(scope)) return { success: false, operationStatus: "FAILED", message: "Thao tác đang được xử lý." };
    this.pending.add(scope);
    let attempt = this.attempts.get(scope);
    if (!attempt) { attempt = { key: crypto.randomUUID(), body: JSON.stringify(input), unknown: false }; this.attempts.set(scope, attempt); }
    try {
      // UNKNOWN never infers success from status. Re-read, then reconcile by the
      // identical payload/key; only the committed idempotency record confirms it.
      if (attempt.unknown) await this.getUserById(id);
      const response = await this.fetcher(`/api/admin/users/${encodeURIComponent(id)}/${action}`, { method: action === "role" ? "PATCH" : "POST", credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(20_000), headers: { "Content-Type": "application/json", "Idempotency-Key": attempt.key }, body: attempt.body });
      const body = await response.json();
      if (response.ok && body.operationStatus === "SUCCESS" && body.success === true && actionDataSchema.safeParse(body.data).success && body.data.userId === id && body.data.action === action) {
        this.attempts.delete(scope);
        return { success: true, operationStatus: "SUCCESS", message: "Đã xác nhận thao tác quản trị." };
      }
      if (body.operationStatus === "FAILED" && body.success === false && typeof body.error?.message === "string") {
        this.attempts.delete(scope); lostAccess(response.status);
        return { success: false, operationStatus: "FAILED", code: body.error.code, message: body.error.message };
      }
    } catch { /* ambiguous transport: keep immutable attempt */ }
    finally { this.pending.delete(scope); }
    attempt.unknown = true;
    return { success: false, operationStatus: "UNKNOWN", message: "Chưa xác nhận được kết quả. Giữ cửa sổ này mở và kiểm tra lại cùng yêu cầu; không thực hiện thao tác mới." };
  }
  requestChangeRole(id: string, role: AdminUserRole) { return this.mutate(id, "role", { role }); }
  requestLockUser(id: string, reason?: string) { return this.mutate(id, "lock", { reason: reason ?? "" }); }
  requestUnlockUser(id: string) { return this.mutate(id, "unlock", {}); }
  requestRevokeSessions(id: string) { return this.mutate(id, "revoke-sessions", {}); }
}
