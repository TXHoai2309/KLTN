import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { companionTestFixture, companionTestUrl, companionTestHeaders as headers, confirmCompanion as input, type CompanionTestFixture } from "./companion-test-fixture";
import { getCompanionGroup, joinCompanion } from "./companion-group-service";
import { getCompanionManagement, updateCompanionManagement } from "./companion-management-service";
import { listMyCompanionPublications, listPublicCompanions } from "./companion-discovery-service";
import { getPublicCompanion } from "./companion-service";

describe.skipIf(!companionTestUrl)("TC-05 PostgreSQL recruitment/capacity management", () => {
  let f: CompanionTestFixture;
  beforeAll(async () => { f = await companionTestFixture("tc05"); });
  beforeEach(async () => { await f.clean(); });
  afterAll(async () => { await f?.close(); });
  const update = async (id: string, changes: Record<string, unknown>, key = randomUUID()) => {
    const current = await getCompanionManagement(headers, id, f.deps());
    return updateCompanionManagement(headers, id, { ...current.draft, visibility: current.visibility, recruitmentOpen: current.recruitmentOpen, baseRevision: current.managementRevision, confirm: true, ...changes }, key, f.deps());
  };
  it("closes/withdraws/reopens the same group, keeps members and hosted management while hiding public reads", async () => {
    const { id } = await f.create(2);
    await joinCompanion(headers, id, input, randomUUID(), f.deps(f.a));
    expect(await update(id, { recruitmentOpen: false })).toMatchObject({ status: "SUCCESS" });
    expect((await getPublicCompanion(id, f.db)).recruitmentStatus).toBe("CLOSED");
    expect(await joinCompanion(headers, id, input, randomUUID(), f.deps(f.b))).toMatchObject({ status: "FAILED", error: { code: "COMPANION_RECRUITMENT_CLOSED" } });
    expect(await update(id, { visibility: "WITHDRAWN" })).toMatchObject({ status: "SUCCESS" });
    await expect(getPublicCompanion(id, f.db)).rejects.toMatchObject({ status: 404 });
    expect((await listPublicCompanions({}, f.deps(null))).total).toBe(0);
    expect((await listMyCompanionPublications(headers, {}, f.deps())).items[0]?.recruitmentStatus).toBe("WITHDRAWN");
    expect((await getCompanionGroup(headers, id, f.deps(f.a))).memberCount).toBe(2);
    expect(await update(id, { visibility: "PUBLIC", recruitmentOpen: true })).toMatchObject({ status: "SUCCESS" });
    expect(await joinCompanion(headers, id, input, randomUUID(), f.deps(f.b))).toMatchObject({ status: "SUCCESS" });
    expect(await f.db.tripCompanionPublication.count()).toBe(1);
    expect((await getCompanionManagement(headers, id, f.deps())).recruitmentOpen).toBe(true);
    expect((await getPublicCompanion(id, f.db)).recruitmentStatus).toBe("FULL");
  });
  it("serializes capacity decrease against join and rejects below the current count", async () => {
    const { id } = await f.create(2);
    await joinCompanion(headers, id, input, randomUUID(), f.deps(f.a));
    const results = await Promise.all([update(id, { additionalCapacity: 1 }), joinCompanion(headers, id, input, randomUUID(), f.deps(f.b))]);
    expect(results.filter(r => r.status === "FAILED")).toHaveLength(1);
    const manage = await getCompanionManagement(headers, id, f.deps());
    expect(manage.activeMemberCount).toBeLessThanOrEqual(manage.draft.additionalCapacity);
    if (manage.activeMemberCount === 2) expect(await update(id, { additionalCapacity: 1 })).toMatchObject({ status: "FAILED", error: { code: "COMPANION_CAPACITY_TOO_SMALL" } });
  });
  it("uses revision and immutable replay; rejects missing/foreign host and cannot reopen after departure", async () => {
    const { id } = await f.create();
    const current = await getCompanionManagement(headers, id, f.deps());
    const payload = { ...current.draft, visibility: "WITHDRAWN", recruitmentOpen: false, baseRevision: 0, confirm: true };
    const key = randomUUID();
    expect(await updateCompanionManagement(headers, id, payload, key, f.deps())).toMatchObject({ status: "SUCCESS" });
    expect(await updateCompanionManagement(headers, id, payload, key, f.deps())).toMatchObject({ status: "SUCCESS", replayed: true });
    expect(await updateCompanionManagement(headers, id, { ...payload, title: "changed" }, key, f.deps())).toMatchObject({ status: "FAILED", error: { code: "IDEMPOTENCY_KEY_REUSED" } });
    expect(await updateCompanionManagement(headers, id, payload, randomUUID(), f.deps())).toMatchObject({ status: "FAILED", error: { code: "COMPANION_REVISION_CONFLICT" } });
    for (const actor of [f.a, f.admin]) await expect(getCompanionManagement(headers, id, f.deps(actor))).rejects.toMatchObject({ status: 403 });
    f.clock.value = new Date("2030-11-14T17:00:00Z");
    expect(await update(id, { visibility: "PUBLIC", recruitmentOpen: true })).toMatchObject({ status: "FAILED", error: { code: "COMPANION_RECRUITMENT_CLOSED" } });
    expect((await getCompanionManagement(headers, id, f.deps())).canReopen).toBe(false);
  });
  it("revoked existing image falls back to null and cannot prevent closing recruitment", async () => {
    const { id } = await f.create(), media = randomUUID();
    await f.db.destination.update({ where: { id: f.destination }, data: { media: { create: { id: media, url: "https://example.invalid/test.jpg", alt: "Synthetic", websiteRights: "APPROVED", rightsEvidence: "Synthetic", reviewedBy: f.admin, reviewedAt: f.clock.value } } } });
    expect(await update(id, { imageMediaId: media })).toMatchObject({ status: "SUCCESS" });
    await f.db.contentMedia.update({ where: { id: media }, data: { websiteRights: "REJECTED" } });
    expect(await update(id, { recruitmentOpen: false })).toMatchObject({ status: "SUCCESS" });
    expect((await getPublicCompanion(id, f.db)).introduction.image).toBeNull();
  });
});
