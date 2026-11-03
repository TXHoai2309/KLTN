import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../../../packages/db/prisma/generated/client";
import type { Database } from "@KLTN/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { listMyCompanionPublications, listPublicCompanions } from "./companion-discovery-service";
import type { CompanionDependencies } from "./companion-service";

const raw = process.env.TC01_TEST_DATABASE_URL;
describe.skipIf(!raw)("TC-02 actual disposable PostgreSQL discovery", () => {
  let db: PrismaClient;
  const prefix = `tc02-${randomUUID()}`, owner = `${prefix}-owner`, other = `${prefix}-other`, admin = `${prefix}-admin`;
  const visible = `${prefix}-visible`, hidden = `${prefix}-hidden`, deleted = `${prefix}-deleted`, media = `${prefix}-image`;
  const now = new Date("2030-11-14T16:59:59Z");
  const deps = (actor: string | null = owner): CompanionDependencies => ({
    database: db, resolveSession: async () => actor ? { user: { id: actor, role: "ADMIN" } } : null, now: () => now,
  });
  const publication = async (suffix: string, options: {
    userId?: string; date?: string; transport?: "CAR" | "MOTORCYCLE";
    title?: string; destinations?: string[]; completed?: boolean; image?: boolean;
  } = {}) => {
    const date = new Date(options.date ?? "2030-11-15");
    return db.tripCompanionPublication.create({ data: {
      id: `${prefix}-${suffix}`, title: options.title ?? `Synthetic ${suffix}`, introduction: "PUBLIC_INTRODUCTION_NOT_SEARCHED",
      additionalCapacity: 2, ...(options.image ? { imageMedia: { connect: { id: media } } } : {}),
      trip: { create: {
        userId: options.userId ?? owner, startDate: date, durationDays: 1, transport: options.transport ?? "MOTORCYCLE",
        manuallyCompletedAt: options.completed ? now : null,
        days: { create: { dayIndex: 1, localDate: date, visits: { create: (options.destinations ?? [visible]).map((destinationId, index) => ({
          destinationId, order: index + 1, startMinute: 480 + index * 120, plannedDurationMinutes: 60,
        })) } } },
      } },
    }, select: { id: true, tripId: true } });
  };
  beforeAll(async () => {
    const target = new URL(raw!);
    if (target.hostname !== "127.0.0.1" || target.pathname !== "/tc01_test" || target.username !== "tc01_test" || target.searchParams.get("sslmode") !== "disable" || process.env.TC01_TEST_DISPOSABLE !== "OWNED_LOOPBACK_CONTAINER") throw new Error("Refusing non-disposable discovery target");
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: raw! }) });
    expect((await db.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`)[0]?.name).toBe("tc01_test");
    await db.user.createMany({ data: [owner, other, admin].map(id => ({
      id, name: "Same display name", email: `${id}@example.invalid`, role: id === admin ? "ADMIN" : "TRAVELER",
    })) });
    for (const id of [visible, hidden, deleted]) await db.destination.create({ data: {
      id, name: id === visible ? "Đồng Văn" : `PRIVATE_ROUTE_${id}`, description: "PRIVATE_DESCRIPTION", area: "test", category: "test", latitude: 23, longitude: 105,
      visibility: id === hidden ? "HIDDEN" : "VISIBLE", deletedAt: id === deleted ? now : null,
      minimumDurationMinutes: 30,
      ...(id === visible ? { media: { create: { id: media, url: "https://example.invalid/discovery.jpg", alt: "Public image", websiteRights: "APPROVED", rightsEvidence: "Synthetic evidence", reviewedBy: admin, reviewedAt: now } } } : {}),
    } });
  }, 30_000);
  beforeEach(async () => {
    await db.trip.deleteMany({ where: { userId: { in: [owner, other, admin] } } });
    await db.destination.update({ where: { id: visible }, data: { visibility: "VISIBLE" } });
    await db.contentMedia.update({ where: { id: media }, data: { websiteRights: "APPROVED" } });
    await db.user.update({ where: { id: owner }, data: { status: "ACTIVE" } });
  });
  afterAll(async () => {
    try { if (db) await db.trip.deleteMany({ where: { userId: { in: [owner, other, admin] } } }); }
    finally { await db?.$disconnect(); }
  });

  it("combines literal public-route/title search, inclusive departure range, transport and remaining places", async () => {
    const match = await publication("match", { image: true });
    await publication("later", { date: "2030-11-16" });
    await publication("car", { transport: "CAR" });
    await publication("hidden-route", { destinations: [hidden, deleted] });
    await publication("complete", { completed: true });
    await publication("departing", { date: "2030-11-14" });
    const query = { q: "  ĐỒNG VĂN  ", departureFrom: "2030-11-15", departureTo: "2030-11-15", transport: "MOTORCYCLE", availableOnly: "true" };
    const result = await listPublicCompanions(query, deps(null));
    expect(result.total).toBe(1);
    expect(result.items.map(item => item.publicationId)).toEqual([match.id]);
    expect(result.items[0]?.introduction).toMatchObject({ availablePlaces: 2, additionalCapacity: 2, image: { alt: "Public image" } });
    expect((await listPublicCompanions({ departureFrom: "2030-11-15", departureTo: "2030-11-16" }, deps())).total).toBe(4);
    expect((await listPublicCompanions({ departureFrom: "2030-11-16" }, deps())).total).toBe(1);
    expect((await listPublicCompanions({ departureTo: "2030-11-14" }, deps())).total).toBe(0);
  });

  it("searches title case-insensitively and treats %, underscore and backslash as literal input", async () => {
    const special = await publication("special", { title: "100%_\\ Hà Giang" });
    await publication("ordinary", { title: "100ordinary Hà Giang" });
    for (const q of ["%", "_", "\\", "%_\\", "100%_\\"]) {
      const result = await listPublicCompanions({ q }, deps(null));
      expect(result.items.map(item => item.publicationId)).toEqual([special.id]);
    }
    expect((await listPublicCompanions({ q: "hà giang" }, deps())).total).toBe(2);
    expect((await listPublicCompanions({ q: "PUBLIC_INTRODUCTION_NOT_SEARCHED" }, deps())).total).toBe(0);
  });

  it("never reveals hidden/deleted route names by projection, search or total; revoked media disappears", async () => {
    await publication("privacy", { image: true, destinations: [visible, hidden, deleted] });
    let result = await listPublicCompanions({}, deps(null));
    expect(JSON.stringify(result)).not.toContain("PRIVATE_");
    expect(JSON.stringify(result)).not.toContain("tripId");
    expect(result.items[0]?.introduction.routeSummary).toEqual([{ destinationId: visible, name: "Đồng Văn" }]);
    expect((await listPublicCompanions({ q: "PRIVATE_ROUTE" }, deps(null))).total).toBe(0);
    await db.contentMedia.update({ where: { id: media }, data: { websiteRights: "REJECTED" } });
    result = await listPublicCompanions({}, deps(null));
    expect(result.items[0]?.introduction.image).toBeNull();
    await db.destination.update({ where: { id: visible }, data: { visibility: "HIDDEN" } });
    expect((await listPublicCompanions({ q: "Đồng Văn" }, deps(null))).total).toBe(0);
    expect((await listPublicCompanions({}, deps(null))).items[0]?.introduction.routeSummary).toEqual([]);
  });

  it("pages every tied departure exactly once in nearest-date / publication-ID order", async () => {
    const ids = [];
    for (const suffix of ["e", "a", "d", "c", "b"]) ids.push((await publication(suffix)).id);
    for (const suffix of ["g", "f"]) ids.push((await publication(suffix, { date: "2030-11-16" })).id);
    let cursor: string | undefined, pages = 0;
    const found: string[] = [];
    do {
      const result = await listPublicCompanions({ limit: "2", ...(cursor ? { cursor } : {}) }, deps(null));
      expect(result.total).toBe(7);
      found.push(...result.items.map(item => item.publicationId));
      cursor = result.nextCursor ?? undefined;
      if (++pages > 4) throw new Error("Pagination did not terminate");
    } while (cursor);
    expect(found).toEqual(ids.sort());
    expect(new Set(found).size).toBe(7);
  });

  it("continues by values after the cursor's anchor is deleted", async () => {
    const a = await publication("a"), b = await publication("b"), c = await publication("c");
    const first = await listPublicCompanions({ limit: "1" }, deps(null));
    expect(first.items[0]?.publicationId).toBe(a.id);
    await db.trip.delete({ where: { id: a.tripId } });
    const second = await listPublicCompanions({ limit: "1", cursor: first.nextCursor! }, deps(null));
    expect(second.total).toBe(2);
    expect(second.items[0]?.publicationId).toBe(b.id);
    const third = await listPublicCompanions({ limit: "1", cursor: second.nextCursor! }, deps(null));
    expect(third.items[0]?.publicationId).toBe(c.id);
    expect(third.nextCursor).toBeNull();
  });

  it("binds cursors to filters, scope and actor without granting access through a cursor", async () => {
    await publication("a"); await publication("b");
    const first = await listPublicCompanions({ limit: "1" }, deps(null));
    for (const query of [{ limit: "2" }, { limit: "1", transport: "CAR" }, { limit: "1", q: "a" }, { limit: "1", availableOnly: "true" }]) {
      await expect(listPublicCompanions({ ...query, cursor: first.nextCursor }, deps(null))).rejects.toMatchObject({ code: "INVALID_COMPANION_QUERY" });
    }
    await expect(listMyCompanionPublications(new Headers(), { limit: "1", cursor: first.nextCursor }, deps())).rejects.toMatchObject({ status: 400 });
    const mine = await listMyCompanionPublications(new Headers(), { limit: "1" }, deps());
    await expect(listMyCompanionPublications(new Headers(), { limit: "1", cursor: mine.nextCursor }, deps(other))).rejects.toMatchObject({ status: 400 });
    await expect(listMyCompanionPublications(new Headers(), { limit: "1", cursor: mine.nextCursor }, deps(null))).rejects.toMatchObject({ status: 401 });
  });

  it("isolates hosted collections by trusted current account, including non-owner Admin and locked accounts", async () => {
    const a = await publication("owner"), b = await publication("other", { userId: other }), c = await publication("admin", { userId: admin });
    expect((await listPublicCompanions({}, deps(null))).total).toBe(3);
    for (const [actor, expected] of [[owner, a.id], [other, b.id], [admin, c.id]]) {
      const result = await listMyCompanionPublications(new Headers(), {}, deps(actor));
      expect(result.items.map(item => item.publicationId)).toEqual([expected]);
      expect(JSON.stringify(result)).not.toContain("tripId");
    }
    await db.user.update({ where: { id: owner }, data: { status: "LOCKED" } });
    await expect(listMyCompanionPublications(new Headers(), {}, deps())).rejects.toMatchObject({ code: "ACCOUNT_LOCKED" });
  });

  it("excludes departure-day rows at Vietnam midnight and manually completed Trips", async () => {
    await publication("tomorrow"); await publication("complete", { completed: true });
    expect((await listPublicCompanions({}, deps())).total).toBe(1);
    const afterMidnight = { ...deps(), now: () => new Date("2030-11-14T17:00:00Z") };
    expect(await listPublicCompanions({}, afterMidnight)).toEqual({ items: [], total: 0, nextCursor: null });
    // TC-05 hosted management keeps own posts across dates/completion.
    expect((await listMyCompanionPublications(new Headers(), {}, afterMidnight)).total).toBe(2);
  });

  it("keeps count, filter and related public projection in one repeatable snapshot during concurrent content revocation", async () => {
    await publication("snapshot", { image: true });
    let changed = false;
    const database = new Proxy(db, { get(target, property, receiver) {
      if (property !== "$transaction") return Reflect.get(target, property, receiver);
      return (run: any, options: any) => target.$transaction(async tx => run(new Proxy(tx, { get(transaction, key, txReceiver) {
        if (key !== "tripCompanionPublication") return Reflect.get(transaction, key, txReceiver);
        return new Proxy(transaction.tripCompanionPublication, { get(delegate, method, delegateReceiver) {
          if (method !== "count") return Reflect.get(delegate, method, delegateReceiver);
          return async (args: any) => {
            const count = await delegate.count(args);
            if (!changed) {
              changed = true;
              await db.destination.update({ where: { id: visible }, data: { visibility: "HIDDEN" } });
            }
            return count;
          };
        } });
      } })), options);
    } }) as Database;
    const result = await listPublicCompanions({ q: "Đồng Văn" }, { ...deps(null), database });
    expect(changed).toBe(true);
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.introduction.routeSummary).toEqual([{ destinationId: visible, name: "Đồng Văn" }]);
    // The next request must observe the revocation; no cached public projection.
    expect((await listPublicCompanions({ q: "Đồng Văn" }, deps(null))).total).toBe(0);
  });
});
