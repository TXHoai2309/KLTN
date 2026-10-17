import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../../../packages/db/prisma/generated/client";
import type { Database } from "@KLTN/db";
import { createAuth } from "@KLTN/auth";
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { adminUserReadResponse, adminUserMutationResponse } from "./admin-user-http";
import { readAdminUsers, mutateAdminUser, type AdminUserDependencies } from "./admin-user-service";
import { requireActor } from "@/server/authorization/guard";
import { requireTraveler } from "@/server/auth/require-traveler";

const enabled = Boolean(process.env.CMS_TEST_DATABASE_URL);
describe.skipIf(!enabled)("CMS real isolated PostgreSQL and Better Auth", { timeout: 40_000 }, () => {
  let db: PrismaClient, auth: ReturnType<typeof createAuth>;
  let a: string, b: string, c: string;
  let aCookie: string, bCookie: string, cCookie: string;
  const password = `Fixture-${randomUUID()}!`;
  const email = (id: string) => `${id}@example.invalid`;
  const headers = (cookie: string) => new Headers({ cookie, origin: "http://localhost:3010" });
  const deps = (): AdminUserDependencies => ({ database: db as unknown as Database, resolveSession: requestHeaders => auth.api.getSession({ headers: requestHeaders, query: { disableCookieCache: true, disableRefresh: true } }) });
  const fake = (id: string, role = "ADMIN"): AdminUserDependencies => ({ database: db as unknown as Database, resolveSession: async () => ({ user: { id, role } }) });
  const signup = async (name: string) => {
    const address = `${randomUUID()}@example.invalid`;
    const response = await auth.api.signUpEmail({ body: { name, email: address, password }, asResponse: true, headers: new Headers({ origin: "http://localhost:3010" }) });
    if (response.status !== 200) throw new Error(`Fixture signup failed: ${response.status}`);
    const id = (await response.json()).user.id as string;
    const cookie = response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    return { id, cookie, address };
  };
  const request = (method: string, payload: unknown = {}, key = randomUUID()) => new Request("http://localhost:3010/api/admin/users/x", { method, headers: { origin: "http://localhost:3010", "content-type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(payload) });
  beforeAll(async () => {
    const url = new URL(process.env.CMS_TEST_DATABASE_URL!);
    if (!/^\/cms_test_[a-f0-9]{24}$/.test(url.pathname) || url.hostname !== "ep-purple-pond-b3xujb8o-pooler.c-4.ap-southeast-1.aws.neon.tech") throw new Error("Owned isolated test database required");
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) });
    auth = createAuth({ BETTER_AUTH_URL: "http://localhost:3010", BETTER_AUTH_SECRET: randomUUID() + randomUUID() }, db as unknown as Database);
  });
  beforeEach(async () => {
    // All tables belong to the new isolated database; never run on neondb.
    await db.$executeRawUnsafe('TRUNCATE TABLE "user", idempotency_record CASCADE');
    const first = await signup("Nguyễn Hoài ADMIN"), second = await signup("Trần Người Dùng"), third = await signup("Admin thứ hai");
    a = first.id; aCookie = first.cookie; b = second.id; bCookie = second.cookie; c = third.id; cCookie = third.cookie;
    await db.user.updateMany({ where: { id: { in: [a, c] } }, data: { role: "ADMIN" } });
  }, 40_000);
  afterAll(async () => { await db?.$disconnect(); });

  it("authorizes all read APIs from persisted role; denies guests, forged claims, deleted and locked users", async () => {
    for (const kind of ["list", "statistics", "detail", "audit"] as const) {
      expect((await adminUserReadResponse(new Request("http://localhost:3010/api/admin/users"), { ...deps(), resolveSession: async () => null }, kind, b)).status).toBe(401);
      expect((await adminUserReadResponse(new Request("http://localhost:3010/api/admin/users", { headers: { "x-role": "ADMIN" } }), fake(b), kind, b)).status).toBe(403);
      expect((await adminUserReadResponse(new Request("http://localhost:3010/api/admin/users", { headers: { cookie: aCookie } }), deps(), kind, b)).status).toBe(200);
    }
    expect(await requireActor(headers(aCookie), deps(), "admin")).toHaveProperty("role", "ADMIN");
    await db.user.update({ where: { id: a }, data: { role: "TRAVELER" } });
    await expect(requireActor(headers(aCookie), deps(), "admin")).rejects.toMatchObject({ status: 403 });
    expect(await requireTraveler(headers(aCookie), deps())).toEqual({ userId: a });
    await db.user.update({ where: { id: a }, data: { status: "LOCKED" } });
    await expect(requireActor(headers(aCookie), deps(), "traveler")).rejects.toMatchObject({ status: 403 });
    await db.user.delete({ where: { id: b } });
    await expect(requireActor(new Headers(), fake(b), "admin")).rejects.toMatchObject({ status: 401 });
  });

  it("server search/filter/sort/page/count use real data, clamp invalidated pages, omit credentials and expired sessions", async () => {
    await db.session.create({ data: { id: randomUUID(), token: randomUUID(), userId: b, expiresAt: new Date(0) } });
    const page = await readAdminUsers(new Headers(), fake(a), "list", { search: "NGUYỄN HOÀI", pageSize: "1", page: "500", sortBy: "name", sortOrder: "asc" }) as any;
    expect(page).toMatchObject({ page: 1, total: 1, totalPages: 1, isMockData: false }); expect(page.items[0].id).toBe(a);
    const traveler = await readAdminUsers(new Headers(), fake(a), "list", { role: "TRAVELER", status: "ACTIVE" }) as any;
    expect(traveler.items.map((row: any) => row.id)).toEqual([b]); expect(traveler.items[0].sessionCount).toBe(1);
    const detail = await readAdminUsers(new Headers(), fake(a), "detail", {}, b) as any;
    expect(detail.lastLoginAt).toBeNull(); expect(detail.activeSessions).toHaveLength(1);
    expect(JSON.stringify(detail)).not.toMatch(/"token"|password|accessToken|refreshToken|ipAddress/);
    expect(await readAdminUsers(new Headers(), fake(a), "statistics", {})).toEqual({ totalUsers: 3, travelerCount: 1, adminCount: 2, lockedCount: 0 });
    for (const query of [{ role: "ROOT" }, { status: "SUSPENDED" }, { pageSize: "1000" }, { page: "0" }, { actorId: a }] as Record<string, string>[]) await expect(readAdminUsers(new Headers(), fake(a), "list", query)).rejects.toMatchObject({ status: 400 });
    await expect(readAdminUsers(new Headers(), fake(a), "detail", {}, "missing")).rejects.toMatchObject({ status: 404 });
  });

  it("promotes/demotes atomically with audit and idempotency; old Admin cookie loses admin but retains Traveler", async () => {
    const key = randomUUID();
    expect(await mutateAdminUser(headers(aCookie), deps(), b, "role", { role: "ADMIN" }, key)).toMatchObject({ status: "SUCCESS" });
    expect(await mutateAdminUser(headers(aCookie), deps(), b, "role", { role: "ADMIN" }, key)).toMatchObject({ status: "SUCCESS", replayed: true });
    expect(await db.adminAuditEvent.count({ where: { targetUserId: b } })).toBe(1);
    expect(await requireActor(headers(bCookie), deps(), "admin")).toHaveProperty("role", "ADMIN");
    expect(await mutateAdminUser(headers(aCookie), deps(), b, "role", { role: "TRAVELER" }, randomUUID())).toMatchObject({ status: "SUCCESS" });
    await expect(requireActor(headers(bCookie), deps(), "admin")).rejects.toMatchObject({ status: 403 });
    expect(await requireTraveler(headers(bCookie), deps())).toEqual({ userId: b });
    const logs = await readAdminUsers(new Headers(), fake(a), "audit", { pageSize: "1" }, b) as any;
    expect(logs.items).toHaveLength(1); expect(logs.hasMore).toBe(true); expect(logs.items[0].details).toMatchObject({ oldRole: "ADMIN", newRole: "TRAVELER" });
  });

  it("last active Admin survives concurrent mutual demotion; self actions are rejected", async () => {
    const outcomes = await Promise.all([
      mutateAdminUser(headers(aCookie), deps(), c, "role", { role: "TRAVELER" }, randomUUID()),
      mutateAdminUser(headers(cCookie), deps(), a, "role", { role: "TRAVELER" }, randomUUID()),
    ]);
    expect(outcomes.filter(result => result.status === "SUCCESS")).toHaveLength(1);
    expect(await db.user.count({ where: { role: "ADMIN", status: "ACTIVE" } })).toBe(1);
    const remaining = await db.user.findFirstOrThrow({ where: { role: "ADMIN" } });
    for (const [action, input] of [["role", { role: "TRAVELER" }], ["lock", {}], ["revoke-sessions", {}]] as const) expect(await mutateAdminUser(new Headers(), fake(remaining.id), remaining.id, action, input, randomUUID())).toMatchObject({ status: "FAILED", error: { code: "SELF_ADMIN_ACTION_DENIED" } });
  });

  it("lock revokes all devices, blocks real password login/new raw sessions; unlock requires fresh login", async () => {
    const user = await db.user.findUniqueOrThrow({ where: { id: b } });
    await auth.api.signInEmail({ body: { email: user.email, password } });
    const key = randomUUID();
    expect(await mutateAdminUser(headers(aCookie), deps(), b, "lock", { reason: "Kiểm thử" }, key)).toMatchObject({ status: "SUCCESS", data: { revokedSessionsCount: 2 } });
    expect(await mutateAdminUser(headers(aCookie), deps(), b, "lock", { reason: "Kiểm thử" }, key)).toMatchObject({ status: "SUCCESS", replayed: true });
    expect(await db.session.count({ where: { userId: b } })).toBe(0);
    expect(await auth.api.getSession({ headers: headers(bCookie) })).toBeNull();
    await expect(auth.api.signInEmail({ body: { email: user.email, password } })).rejects.toThrow();
    await expect(db.session.create({ data: { id: randomUUID(), token: randomUUID(), userId: b, expiresAt: new Date(Date.now() + 60_000) } })).rejects.toThrow();
    expect(await mutateAdminUser(headers(aCookie), deps(), b, "lock", {}, randomUUID())).toMatchObject({ status: "FAILED", error: { code: "USER_UNCHANGED" } });
    expect(await db.adminAuditEvent.count({ where: { targetUserId: b } })).toBe(1);
    expect(await mutateAdminUser(headers(aCookie), deps(), b, "unlock", {}, randomUUID())).toMatchObject({ status: "SUCCESS" });
    expect(await auth.api.getSession({ headers: headers(bCookie) })).toBeNull();
    await expect(auth.api.signInEmail({ body: { email: user.email, password } })).resolves.toHaveProperty("user.id", b);
  });

  it("revoke removes valid sessions, leaves account active and old cookies invalid; no duplicate audit on replay", async () => {
    const key = randomUUID();
    expect(await mutateAdminUser(headers(aCookie), deps(), b, "revoke-sessions", {}, key)).toMatchObject({ status: "SUCCESS", data: { revokedSessionsCount: 1 } });
    expect(await mutateAdminUser(headers(aCookie), deps(), b, "revoke-sessions", {}, key)).toMatchObject({ status: "SUCCESS", replayed: true });
    expect(await auth.api.getSession({ headers: headers(bCookie) })).toBeNull();
    expect(await db.user.findUnique({ where: { id: b } })).toHaveProperty("status", "ACTIVE");
    expect(await db.account.count({ where: { userId: b } })).toBe(1);
    expect(await db.adminAuditEvent.count({ where: { targetUserId: b } })).toBe(1);
  });

  it("lock versus session insertion is serialized by the database row lock", async () => {
    let ready!: () => void, release!: () => void;
    const acquired = new Promise<void>(resolve => { ready = resolve; }), continueLock = new Promise<void>(resolve => { release = resolve; });
    const lock = db.$transaction(async tx => {
      await tx.$queryRawUnsafe('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', b);
      await tx.user.update({ where: { id: b }, data: { status: "LOCKED", lockedAt: new Date() } });
      ready(); await continueLock;
      await tx.session.deleteMany({ where: { userId: b } });
    }, { timeout: 15_000 });
    await acquired;
    const insert = db.session.create({ data: { id: randomUUID(), userId: b, token: randomUUID(), expiresAt: new Date(Date.now() + 60_000) } });
    const rejected = expect(insert).rejects.toThrow();
    await new Promise(resolve => setTimeout(resolve, 150)); release();
    await lock; await rejected;
    expect(await db.session.count({ where: { userId: b } })).toBe(0);
  });

  it("write boundaries reject forged fields/origin/role before changing data; transaction failure rolls back audit and idempotency", async () => {
    for (const [action, payload] of [["role", { role: "ROOT" }], ["lock", { reason: "x".repeat(501) }], ["unlock", { actorId: a }]] as const) await expect(mutateAdminUser(new Headers(), fake(a), b, action, payload, randomUUID())).rejects.toMatchObject({ status: 400 });
    const response = await adminUserMutationResponse(request("POST"), fake(b), a, "lock"); expect(response.status).toBe(403);
    const forged = request("POST"); forged.headers.set("origin", "https://evil.example"); expect((await adminUserMutationResponse(forged, fake(a), b, "lock")).status).toBe(403);
    const failing = new Proxy(db, { get(target, property) {
      if (property === "$transaction") return (callback: any) => target.$transaction(async tx => callback(new Proxy(tx, { get(inner, name) { if (name === "adminAuditEvent") return { create: async () => { throw new Error("Injected audit failure"); } }; const value = Reflect.get(inner, name); return typeof value === "function" ? value.bind(inner) : value; } })));
      const value = Reflect.get(target, property); return typeof value === "function" ? value.bind(target) : value;
    } });
    const key = randomUUID();
    expect(await mutateAdminUser(new Headers(), { ...fake(a), database: failing as unknown as Database }, b, "role", { role: "ADMIN" }, key)).toMatchObject({ status: "UNKNOWN" });
    expect(await db.user.findUnique({ where: { id: b } })).toHaveProperty("role", "TRAVELER");
    expect(await db.adminAuditEvent.count()).toBe(0); expect(await db.idempotencyRecord.count({ where: { key } })).toBe(0);
  });
});
