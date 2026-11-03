import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { companionTestFixture, companionTestUrl, companionTestHeaders as headers, confirmCompanion as input, type CompanionTestFixture } from "./companion-test-fixture";
import { getCompanionGroup, joinCompanion, leaveCompanion } from "./companion-group-service";
import { getPublicCompanion } from "./companion-service";
import { listJoinedCompanions } from "./companion-discovery-service";
import { deleteMyTrip } from "../trip-read/trip-management-service";

describe.skipIf(!companionTestUrl)("TC-04 PostgreSQL leave and rejoin", () => {
  let f: CompanionTestFixture;
  beforeAll(async () => { f = await companionTestFixture("tc04"); });
  beforeEach(async () => { await f.clean(); });
  afterAll(async () => { await f?.close(); });
  it("returns one place once, revokes current readers/list and rejoins the same persistent relation", async () => {
    const { id, tripId } = await f.create(), joinKey = randomUUID(), leaveKey = randomUUID();
    await joinCompanion(headers, id, input, joinKey, f.deps(f.a));
    const firstJoined = (await f.db.tripCompanionMembership.findUniqueOrThrow({ where: { publicationId_userId: { publicationId: id, userId: f.a } } })).joinedAt;
    const outcomes = await Promise.all(Array.from({ length: 4 }, () => leaveCompanion(headers, id, input, leaveKey, f.deps(f.a))));
    expect(outcomes.every(r => r.status === "SUCCESS")).toBe(true);
    expect((await getPublicCompanion(id, f.db)).introduction.availablePlaces).toBe(1);
    await expect(getCompanionGroup(headers, id, f.deps(f.a))).rejects.toMatchObject({ status: 403 });
    expect((await listJoinedCompanions(headers, {}, f.deps(f.a))).total).toBe(0);
    expect(await joinCompanion(headers, id, input, joinKey, f.deps(f.a))).toMatchObject({ status: "SUCCESS", replayed: true });
    await expect(getCompanionGroup(headers, id, f.deps(f.a))).rejects.toMatchObject({ status: 403 });
    expect(await deleteMyTrip(headers, tripId, randomUUID(), f.deps())).toMatchObject({ status: "FAILED", error: { code: "TRIP_HAS_COMPANION_HISTORY" } });
    expect(await joinCompanion(headers, id, input, randomUUID(), f.deps(f.a))).toMatchObject({ status: "SUCCESS" });
    expect(await f.db.tripCompanionMembership.count({ where: { publicationId: id } })).toBe(1);
    expect((await f.db.tripCompanionMembership.findUniqueOrThrow({ where: { publicationId_userId: { publicationId: id, userId: f.a } } })).joinedAt).toEqual(firstJoined);
  });
  it("host cannot leave; outsider cannot write; leaving after departure cannot reopen joining", async () => {
    const { id } = await f.create();
    expect(await leaveCompanion(headers, id, input, randomUUID(), f.deps())).toMatchObject({ status: "FAILED", error: { code: "COMPANION_HOST_CANNOT_LEAVE" } });
    expect(await leaveCompanion(headers, id, input, randomUUID(), f.deps(f.admin))).toMatchObject({ status: "FAILED", httpStatus: 403 });
    await joinCompanion(headers, id, input, randomUUID(), f.deps(f.a));
    f.clock.value = new Date("2030-11-14T17:00:00Z");
    expect(await leaveCompanion(headers, id, input, randomUUID(), f.deps(f.a))).toMatchObject({ status: "SUCCESS" });
    expect(await joinCompanion(headers, id, input, randomUUID(), f.deps(f.b))).toMatchObject({ status: "FAILED", error: { code: "COMPANION_RECRUITMENT_CLOSED" } });
  });
  it("join/leave race stays within capacity and replayed leave never mutates a later rejoin", async () => {
    const { id } = await f.create(), leaveKey = randomUUID();
    await joinCompanion(headers, id, input, randomUUID(), f.deps(f.a));
    await Promise.all([leaveCompanion(headers, id, input, leaveKey, f.deps(f.a)), joinCompanion(headers, id, input, randomUUID(), f.deps(f.b))]);
    expect(await f.db.tripCompanionMembership.count({ where: { publicationId: id, state: "ACTIVE" } })).toBeLessThanOrEqual(1);
    const b = await f.db.tripCompanionMembership.findUnique({ where: { publicationId_userId: { publicationId: id, userId: f.b } } });
    if (b?.state === "ACTIVE") await leaveCompanion(headers, id, input, randomUUID(), f.deps(f.b));
    await joinCompanion(headers, id, input, randomUUID(), f.deps(f.a));
    expect(await leaveCompanion(headers, id, input, leaveKey, f.deps(f.a))).toMatchObject({ status: "SUCCESS", replayed: true });
    expect((await getCompanionGroup(headers, id, f.deps(f.a))).relationship).toBe("MEMBER");
  });
});
