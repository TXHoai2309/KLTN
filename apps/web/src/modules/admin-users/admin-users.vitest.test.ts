import { describe, expect, it, vi } from "vitest";
import { createAuth } from "@KLTN/auth";
import type { Database } from "@KLTN/db";
import { HttpAdminUserDataSource } from "./admin-user-http-source";
import { defaultAdminUserDataSource } from "./admin-user-data-source";
import { roleInputSchema, lockInputSchema, userFiltersSchema } from "./admin-user-schema";
import { adminUserReadResponse, adminUserMutationResponse } from "./admin-user-http";
import { requireActor } from "@/server/authorization/guard";
import { readFile } from "node:fs/promises";

const detail = { id: "b", name: "Fixture", email: "b@example.invalid", image: null, role: "TRAVELER", status: "ACTIVE", emailVerified: false, createdAt: "2026-10-17T00:00:00Z", updatedAt: "2026-10-17T00:00:00Z", lastLoginAt: null, sessionCount: 1, lockedAt: null, lockReason: null, activeSessions: [] };
const success = (action = "lock") => Response.json({ success: true, operationStatus: "SUCCESS", data: { userId: "b", action, revokedSessionsCount: 1 } });
describe("CMS contracts and real HTTP source", () => {
  it("defaults to HTTP, with no fixture import in the runtime entry", async () => {
    expect(defaultAdminUserDataSource).toBeInstanceOf(HttpAdminUserDataSource);
    const source = await readFile(new URL("./admin-user-data-source.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/DEV_FIXTURE|new ClientAdminUserDataSource/);
  });
  it.each([{ role: "ROOT" }, { role: "ADMIN", actorId: "attacker" }, { role: "ADMIN", bypass: true }])("rejects role escalation payload %j", input => expect(roleInputSchema.safeParse(input).success).toBe(false));
  it("bounds query and reason; supports NFC Vietnamese search", () => {
    expect(userFiltersSchema.parse({ search: "  Nguyễn  " }).search).toBe("Nguyễn");
    for (const query of [{ page: 0 }, { pageSize: 51 }, { status: "SUSPENDED" }, { userId: "victim" }]) expect(userFiltersSchema.safeParse(query).success).toBe(false);
    expect(lockInputSchema.safeParse({ reason: "x".repeat(501) }).success).toBe(false);
  });
  it("UNKNOWN re-reads state and reconciles with identical immutable payload/key", async () => {
    const fetcher = vi.fn<typeof fetch>();
    fetcher.mockRejectedValueOnce(new Error("lost response"));
    fetcher.mockResolvedValueOnce(Response.json({ success: true, data: detail }));
    fetcher.mockResolvedValueOnce(success());
    const source = new HttpAdminUserDataSource(fetcher);
    expect(await source.requestLockUser("b", "Initial reason")).toHaveProperty("operationStatus", "UNKNOWN");
    expect(await source.requestLockUser("b", "Changed text must not change the retry")).toHaveProperty("operationStatus", "SUCCESS");
    expect(fetcher.mock.calls[1]?.[0]).toBe("/api/admin/users/b");
    const first = fetcher.mock.calls[0]?.[1], retry = fetcher.mock.calls[2]?.[1];
    expect(retry?.body).toBe(first?.body); expect(retry?.headers).toEqual(first?.headers);
  });
  it("never treats a failed or malformed response as confirmed success", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ success: false, operationStatus: "FAILED", error: { code: "LAST_ACTIVE_ADMIN", message: "Denied" } }, { status: 409 })).mockResolvedValueOnce(Response.json({ success: true, data: detail }));
    const source = new HttpAdminUserDataSource(fetcher);
    expect(await source.requestChangeRole("b", "ADMIN")).toMatchObject({ success: false, operationStatus: "FAILED" });
    expect(await source.requestChangeRole("b", "ADMIN")).toMatchObject({ success: false, operationStatus: "UNKNOWN" });
  });
  it("read errors stay errors and unsafe extra DTO fields are rejected", async () => {
    const source = new HttpAdminUserDataSource(vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ error: { message: "Unavailable" } }, { status: 503 })).mockResolvedValueOnce(Response.json({ success: true, data: { ...detail, token: "must-not-leak" } })));
    await expect(source.getUsers({})).rejects.toThrow("Unavailable");
    await expect(source.getUserById("b")).rejects.toThrow("Phản hồi máy chủ không hợp lệ");
  });
  it("an HTTP failure carrying a forged success envelope cannot confirm a mutation", async () => {
    const body = await success().json();
    const source = new HttpAdminUserDataSource(async () => Response.json(body, { status: 500 }));
    expect(await source.requestLockUser("b")).toMatchObject({ success: false, operationStatus: "UNKNOWN" });
  });
});

describe("CMS auth and provider boundary", () => {
  const deps = (role?: string, status = "ACTIVE") => ({ database: { user: { findUnique: async () => role ? { id: "a", role, status } : null } } as unknown as Database, resolveSession: async () => role ? { user: { id: "a", role: "ADMIN" } } : null });
  it.each([undefined, "TRAVELER", "ROOT"])("denies %s before protected persistence/body work", async role => {
    const d = deps(role), request = new Request("http://localhost/api/admin/users", { method: "POST", headers: { "x-role": "ADMIN" }, body: "malformed" });
    const text = vi.spyOn(request, "text");
    expect((await adminUserMutationResponse(request, d, "b", "lock")).status).toBe(role ? 403 : 401);
    expect(text).not.toHaveBeenCalled();
    for (const kind of ["list", "statistics", "detail", "audit"] as const) expect((await adminUserReadResponse(new Request("http://localhost/api/admin/users"), d, kind, "b")).status).toBe(role ? 403 : 401);
  });
  it("locked persisted actor cannot use either Admin or Traveler capability with a stale valid session", async () => {
    for (const permission of ["admin", "traveler", "account:self"] as const) await expect(requireActor(new Headers(), deps("ADMIN", "LOCKED"), permission)).rejects.toMatchObject({ code: "ACCOUNT_LOCKED", status: 403 });
  });
  it("Better Auth uses its installed supported session hook and disables cookie cache", async () => {
    const findUnique = vi.fn(async () => ({ status: "LOCKED" }));
    const auth = createAuth({ BETTER_AUTH_URL: "http://localhost:3010", BETTER_AUTH_SECRET: "test-only-configuration-secret-at-least-32-characters" }, { user: { findUnique } } as unknown as Database);
    expect(auth.options.session?.cookieCache?.enabled).toBe(false);
    const hook = auth.options.databaseHooks?.session?.create?.before;
    await expect(hook!({ userId: "locked" } as any)).rejects.toThrow();
    expect(findUnique).toHaveBeenCalledWith({ where: { id: "locked" }, select: { status: true } });
  });
});
