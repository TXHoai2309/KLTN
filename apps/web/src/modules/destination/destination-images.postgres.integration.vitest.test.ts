import { randomUUID, createHash } from "node:crypto";
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../../../packages/db/prisma/generated/client";
import type { Database } from "@KLTN/db";
import { createImageIntent, uploadDestinationImage, reviewDestinationImage } from "./destination-image-service";
import { writeDestination, type DestinationDependencies } from "./destination-service";
import { unknownSchedule } from "./destination-contract";
import type { DestinationImageProvider, ImageAsset } from "./cloudinary-provider";
import { getPublicDestination } from "./public-destination-service";
import { listPublicLocations } from "./public-destination-list";
import { retrievePlannerCandidates } from "../trip-planner/planner-candidates";
import { readEditorialContext, readPublicEditorial, writeEditorial } from "../destination-editorial/editorial-service";
import { autoLayout } from "../destination-editorial/editorial-engine";
import { withoutWebsiteUse } from "./destination-media-eligibility";
const url = process.env.US19_TASK184_TEST_DATABASE_URL;
(url ? describe : describe.skip)("Destination Cloudinary with real disposable PostgreSQL, mocked provider", () => {
  let db: PrismaClient, deps: DestinationDependencies, id: string, actor: string;
  let provider: DestinationImageProvider;
  const headers = new Headers();
  const bytes = Buffer.from("synthetic provider bytes; byte decoder tested separately");
  const input = { name: "Synthetic.png", size: bytes.length, mime: "image/png", sha256: createHash("sha256").update(bytes).digest("hex") };
  beforeAll(async () => {
    const target = new URL(url!);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) || target.username !== "task184_test" || target.pathname !== "/task184_test" || process.env.US19_TASK184_TEST_DISPOSABLE !== "I_UNDERSTAND_THIS_IS_A_DISPOSABLE_TEST_DATABASE") throw Error("Disposable loopback required");
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    actor = randomUUID(); await db.user.create({ data: { id: actor, name: "TEST Admin", email: `${actor}@example.invalid`, role: "ADMIN" } });
    deps = { database: db as Database, resolveSession: async () => ({ user: { id: actor } }) };
  });
  beforeEach(async () => {
    const created = await writeDestination(headers, { name: "TEST Image destination", description: "Synthetic", category: "chợ phiên", area: "đồng văn", latitude: 23, longitude: 105,
      suggestedDurationMinutes: null, minimumDurationMinutes: null, openingDays: unknownSchedule() }, randomUUID(), null, deps);
    if (created.status !== "SUCCESS") throw Error("fixture"); id = created.data.id;
    const assets = new Map<string, ImageAsset>();
    provider = { cloud: "offline-test", folderMode: async () => "dynamic", inspect: async () => "png",
      find: async intent => assets.get(intent.publicId) ?? null,
      upload: async intent => { assets.set(intent.publicId, { asset_id: randomUUID(), public_id: intent.publicId,
        secure_url: `https://res.cloudinary.com/offline-test/image/upload/v1/${intent.publicId}.png`, resource_type: "image", type: "upload", format: "png", bytes: bytes.length, width: 2, height: 2, version: 1, asset_folder: intent.folder,
        context: { custom: { kltn_intent: intent.intentKey, kltn_sha256: intent.sha256 } } }); } };
  });
  afterAll(async () => { await db?.$disconnect(); });
  async function upload(key = randomUUID()) {
    const intent = await createImageIntent(headers, input, key, id, deps, provider); expect(intent.status).toBe("SUCCESS");
    const result = await uploadDestinationImage(headers, bytes, key, id, deps, provider); expect(result.status).toBe("SUCCESS"); return { key, result };
  }
  it("durable intent SQL works; same-key concurrent finalize creates exactly one media/revision", async () => {
    const key = randomUUID(); const intent = await createImageIntent(headers, input, key, id, deps, provider); expect(intent.status).toBe("SUCCESS");
    const before = await db.destination.findUniqueOrThrow({ where: { id } });
    const results = await Promise.all([uploadDestinationImage(headers, bytes, key, id, deps, provider), uploadDestinationImage(headers, bytes, key, id, deps, provider)]);
    expect(results.map(r => r.status)).toEqual(["SUCCESS", "SUCCESS"]);
    const after = await db.destination.findUniqueOrThrow({ where: { id }, include: { media: true } });
    expect(after.media).toHaveLength(1); expect(after.contentRevision).toBe(before.contentRevision + 1); expect(after.media[0]).toMatchObject({ websiteRights: "UNKNOWN", reviewedBy: null, isCover: true });
  });
  it("durable reservation includes other admins and serializes the twentieth slot", async () => {
    const otherId = randomUUID(); await db.user.create({ data: { id: otherId, name: "TEST Other Admin", email: `${otherId}@example.invalid`, role: "ADMIN" } });
    const other = { ...deps, resolveSession: async () => ({ user: { id: otherId } }) };
    for (let i = 0; i < 19; i++) expect((await createImageIntent(headers, input, randomUUID(), id, deps, provider)).status).toBe("SUCCESS");
    const results = await Promise.all([createImageIntent(headers, input, randomUUID(), id, deps, provider), createImageIntent(headers, input, randomUUID(), id, other, provider)]);
    expect(results.filter(r => r.status === "SUCCESS")).toHaveLength(1); expect(results.filter(r => r.status === "FAILED")).toHaveLength(1);
  });
  it("preserves IDs/reviews/no-change snapshots; explicit unlink commits a cleanup candidate", async () => {
    await upload();
    const row = await db.destination.findUniqueOrThrow({ where: { id }, include: { media: true } });
    const review = await reviewDestinationImage(headers, { id: row.media[0]!.id, decision: "APPROVED", evidence: "TEST owner grant", expectedUpdatedAt: row.updatedAt.toISOString() }, randomUUID(), id, deps); expect(review.status).toBe("SUCCESS");
    const before = await db.destination.findUniqueOrThrow({ where: { id }, include: { media: true } });
    await writeDestination(headers, { formVersion: "V3", expectedUpdatedAt: before.updatedAt.toISOString() }, randomUUID(), id, deps);
    expect(await db.destination.findUniqueOrThrow({ where: { id }, include: { media: true } })).toEqual(before);
    expect((await writeDestination(headers, { formVersion: "V3", media: [{ id: row.media[0]!.id, caption: "New caption" }], expectedUpdatedAt: before.updatedAt.toISOString() }, randomUUID(), id, deps)).status).toBe("SUCCESS");
    const retained = await db.contentMedia.findUniqueOrThrow({ where: { id: row.media[0]!.id } });
    expect(retained.reviewedBy).toBe(actor); expect(retained.reviewedAt).toEqual(before.media[0]!.reviewedAt);
    expect((await writeDestination(headers, { formVersion: "V3", removedMediaIds: [retained.id] }, randomUUID(), id, deps)).status).toBe("SUCCESS");
    expect(await db.contentMedia.count({ where: { destinationId: id } })).toBe(0);
    const journal = await db.idempotencyRecord.findMany({ where: { scope: JSON.stringify([actor, `destination:media-unlinked:${id}`]) } });
    expect(journal).toHaveLength(1); expect(JSON.parse(journal[0]!.responseJson)).toMatchObject({ physicalDeletion: "NOT_AUTHORIZED" });
  });
  it("rejects foreign intent and forged review; verified upload is public without legal approval", async () => {
    const { key } = await upload();
    const otherId = randomUUID(); await db.user.create({ data: { id: otherId, name: "TEST Other", email: `${otherId}@example.invalid`, role: "ADMIN" } });
    await expect(uploadDestinationImage(headers, bytes, key, id, { ...deps, resolveSession: async () => ({ user: { id: otherId } }) }, provider)).rejects.toMatchObject({ code: "INVALID_IMAGE_INTENT" });
    await db.destination.update({ where: { id }, data: { visibility: "VISIBLE" } });
    expect((await getPublicDestination(id, db as Database)).profile?.media).toHaveLength(1);
    const row = await db.destination.findUniqueOrThrow({ where: { id }, include: { media: true } });
    await expect(reviewDestinationImage(headers, { id: row.media[0]!.id, expectedUpdatedAt: row.updatedAt.toISOString(), decision: "APPROVED", evidence: "TEST grant", reviewedBy: "forged" }, randomUUID(), id, deps)).rejects.toMatchObject({ code: "INVALID_IMAGE_REVIEW" });
    await reviewDestinationImage(headers, { id: row.media[0]!.id, expectedUpdatedAt: row.updatedAt.toISOString(), decision: "APPROVED", evidence: "TEST grant" }, randomUUID(), id, deps);
    expect((await getPublicDestination(id, db as Database)).profile?.media).toHaveLength(1);
    expect((await listPublicLocations({}, db as Database)).items.find(d => d.id === id)?.image?.url).toContain("offline-test");
  });
  it("uses multiple uploads without caption/alt/evidence across Detail, Explore, Planner and published Editorial only", async () => {
    await upload(); await upload();
    const initial = await db.contentMedia.findMany({where:{destinationId:id},orderBy:{position:"asc"}});
    expect(initial).toHaveLength(2);
    expect(initial[0]).toMatchObject({alt:"Hình ảnh TEST Image destination",caption:null,websiteRights:"UNKNOWN",rightsEvidence:null,reviewedBy:null});
    await expect(getPublicDestination(id, db as Database)).rejects.toMatchObject({status:410});
    expect(await readPublicEditorial(id, db as Database)).toBeNull();
    const context = await readEditorialContext(id, db as Database);
    const layout = autoLayout(context);
    expect(layout.blocks.flatMap(b=>b.mediaIds).sort()).toEqual(initial.map(m=>m.id).sort());
    expect((await writeEditorial(headers,{action:"SAVE",expectedRevision:0,layout},randomUUID(),id,deps)).status).toBe("SUCCESS");
    await db.destination.update({where:{id},data:{visibility:"VISIBLE"}});
    expect(await readPublicEditorial(id, db as Database)).toBeNull(); // Draft remains private.
    expect((await writeEditorial(headers,{action:"PUBLISH",expectedRevision:1,reviewed:true},randomUUID(),id,deps)).status).toBe("SUCCESS");
    expect((await readPublicEditorial(id, db as Database))?.media).toHaveLength(2);
    expect((await getPublicDestination(id, db as Database)).profile?.media).toHaveLength(2);
    expect((await listPublicLocations({},db as Database)).items.find(r=>r.id===id)?.image?.url).toBe(initial[0]!.url);
    expect((await retrievePlannerCandidates(db as Database,[id]))[0]?.image?.url).toBe(initial[0]!.url);
    expect(JSON.stringify(await getPublicDestination(id,db as Database))).not.toContain("websiteUse");
    expect(JSON.stringify(await retrievePlannerCandidates(db as Database,[id]))).not.toContain("storageReference");
    const saved = await writeDestination(headers,{formVersion:"V3",media:[{id:initial[1]!.id,caption:""}],mediaOrder:[initial[1]!.id,initial[0]!.id],coverMediaId:initial[1]!.id},randomUUID(),id,deps);
    expect(saved.status).toBe("SUCCESS");
    expect((await listPublicLocations({},db as Database)).items.find(r=>r.id===id)?.image?.url).toBe(initial[1]!.url);
    const current = await db.destination.findUniqueOrThrow({where:{id}});
    await reviewDestinationImage(headers,{id:initial[1]!.id,expectedUpdatedAt:current.updatedAt.toISOString(),decision:"UNKNOWN",evidence:"TEST revoked"},randomUUID(),id,deps);
    await db.contentMedia.update({where:{id:initial[0]!.id},data:{websiteRights:"REJECTED"}});
    expect((await getPublicDestination(id,db as Database)).profile?.media).toHaveLength(0);
    expect((await readPublicEditorial(id,db as Database))?.media).toHaveLength(0);
    expect((await retrievePlannerCandidates(db as Database,[id]))[0]?.image).toBeNull();
    const legacy = await db.contentMedia.create({data:{destinationId:id,url:"https://example.org/legacy.jpg",alt:"Legacy",websiteRights:"UNKNOWN",storageReference:withoutWebsiteUse(initial[0]!.storageReference)}});
    const before = await db.contentMedia.findMany({where:{destinationId:id},orderBy:{id:"asc"}});
    await writeDestination(headers,{formVersion:"V3",description:"Updated prose"},randomUUID(),id,deps);
    expect(await db.contentMedia.findMany({where:{destinationId:id},orderBy:{id:"asc"}})).toEqual(before);
    expect((await getPublicDestination(id,db as Database)).profile?.media).toHaveLength(0);
    await writeDestination(headers,{formVersion:"V3",removedMediaIds:[legacy.id]},randomUUID(),id,deps);
    expect(await db.contentMedia.count({where:{id:legacy.id}})).toBe(0);
  });
});
