import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { companionTestFixture, companionTestUrl, companionTestHeaders as headers, confirmCompanion as input, type CompanionTestFixture } from "./companion-test-fixture";
import { getCompanionGroup, joinCompanion, leaveCompanion } from "./companion-group-service";
import { getCompanionMembers, banCompanionMember } from "./companion-members-service";
import { getPublicCompanion } from "./companion-service";

describe.skipIf(!companionTestUrl)("TC-06 PostgreSQL remove and persistent ban", () => {
  let f: CompanionTestFixture;
  beforeAll(async () => { f = await companionTestFixture("tc06"); });
  beforeEach(async () => { await f.clean(); });
  afterAll(async () => { await f?.close(); });
  it("host bans once, returns a place, revokes reads and rejects new/old-key joins without disturbing another member", async () => {
    const { id } = await f.create(2), joinKey = randomUUID(), key = randomUUID();
    await joinCompanion(headers, id, input, joinKey, f.deps(f.a)); await joinCompanion(headers, id, input, randomUUID(), f.deps(f.b));
    const members = await getCompanionMembers(headers, id, f.deps(f.a));
    expect(members.members).toHaveLength(2); expect(JSON.stringify(members)).not.toContain("email");
    expect(await banCompanionMember(headers, id, f.a, input, key, f.deps())).toMatchObject({ status: "SUCCESS" });
    expect(await banCompanionMember(headers, id, f.a, input, key, f.deps())).toMatchObject({ status: "SUCCESS", replayed: true });
    expect((await getPublicCompanion(id, f.db)).introduction.availablePlaces).toBe(1);
    await expect(getCompanionGroup(headers, id, f.deps(f.a))).rejects.toMatchObject({ status: 403 });
    await expect(getCompanionMembers(headers, id, f.deps(f.a))).rejects.toMatchObject({ status: 403 });
    for (const join of [joinKey, randomUUID()]) await expect(joinCompanion(headers, id, input, join, f.deps(f.a))).rejects.toMatchObject({ code: "COMPANION_BANNED" });
    expect((await getCompanionGroup(headers, id, f.deps(f.b))).relationship).toBe("MEMBER");
    expect(await leaveCompanion(headers, id, input, randomUUID(), f.deps(f.a))).toMatchObject({ status: "FAILED", httpStatus: 403 });
  });
  it("rejects member/foreign Admin management and host targeting; cannot recreate a barred relation", async () => {
    const { id } = await f.create(); await joinCompanion(headers, id, input, randomUUID(), f.deps(f.a));
    for (const actor of [f.a, f.admin]) await expect(banCompanionMember(headers, id, f.a, input, randomUUID(), f.deps(actor))).rejects.toMatchObject({ status: 403 });
    expect(await banCompanionMember(headers, id, f.owner, input, randomUUID(), f.deps())).toMatchObject({ status: "FAILED", httpStatus: 409 });
    await banCompanionMember(headers, id, f.a, input, randomUUID(), f.deps());
    await expect(f.db.tripCompanionMembership.create({ data: { publicationId: id, userId: f.a } })).rejects.toThrow();
    expect((await f.db.tripCompanionMembership.findUniqueOrThrow({ where: { publicationId_userId: { publicationId: id, userId: f.a } } })).state).toBe("BANNED");
  });
  it("ban/rejoin race ends barred and never silently unbans", async () => {
    const { id } = await f.create(); await joinCompanion(headers, id, input, randomUUID(), f.deps(f.a));
    await leaveCompanion(headers, id, input, randomUUID(), f.deps(f.a));
    await Promise.allSettled([joinCompanion(headers, id, input, randomUUID(), f.deps(f.a)), banCompanionMember(headers, id, f.a, input, randomUUID(), f.deps())]);
    expect((await f.db.tripCompanionMembership.findUniqueOrThrow({ where: { publicationId_userId: { publicationId: id, userId: f.a } } })).state).toBe("BANNED");
    expect((await getPublicCompanion(id, f.db)).introduction.availablePlaces).toBe(1);
  });
});
