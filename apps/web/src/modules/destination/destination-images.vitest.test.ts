import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import sharp from "sharp";
import {v2 as cloudinary} from "cloudinary";
vi.mock("server-only", () => ({}));
vi.mock("../runtime-config/runtime-config-service", () => ({ effectiveConfig: async () => ({ cloudName: process.env.CLOUDINARY_CLOUD_NAME, apiKey: process.env.CLOUDINARY_API_KEY, apiSecret: process.env.CLOUDINARY_API_SECRET }) }));
afterAll(() => { vi.doUnmock("../runtime-config/runtime-config-service"); vi.resetModules(); });
const httpAuth = vi.hoisted(() => ({ role: null as string | null }));
vi.mock("./destination-server", () => ({ destinationDependencies: {
  resolveSession: async () => httpAuth.role ? { user: { id: "test-admin" } } : null,
  database: { user: { findUnique: async () => httpAuth.role ? { id: "test-admin", role: httpAuth.role } : null } },
} }));
import { cloudinaryConfiguration, destinationImageProvider, inspectImage, type DestinationImageProvider, type ImageAsset } from "./cloudinary-provider";
import { createImageIntent, uploadDestinationImage, reviewDestinationImage, verifyImageAsset } from "./destination-image-service";
import { destinationMediaWhere, isDestinationMediaUsable, withoutWebsiteUse } from "./destination-media-eligibility";
import { imageIntentInput, MAX_IMAGE_BYTES, type ImageIntent } from "./destination-media-contract";
import { mediaChanges } from "./destination-media-patch";
import { writeDestination } from "./destination-service";
import { unknownSchedule } from "./destination-contract";
import { v3TestStore } from "./__fixtures__/v3-store";
import { destinationThumbnail } from "./destination-image-url";
import { imageBytes } from "./destination-image-http";
import { listPublicLocations } from "./public-destination-list";
import { POST as intentPost } from "@/app/api/admin/destinations/[id]/images/intents/route";
import { POST as uploadPost } from "@/app/api/admin/destinations/[id]/images/upload/route";
import { POST as reviewPost } from "@/app/api/admin/destinations/[id]/images/review/route";
import { GET as configurationGet } from "@/app/api/admin/destination-images/configuration/route";
import { parseImageResult } from "@/lib/destination-image-client";

const headers = new Headers();
function fakeProvider(mode: "dynamic" | "fixed" = "dynamic") {
  const assets = new Map<string, ImageAsset>();
  const provider: DestinationImageProvider = {
    cloud: "test-cloud", folderMode: vi.fn(async () => mode), inspect: inspectImage,
    find: vi.fn(async intent => assets.get(intent.publicId) ?? null),
    upload: vi.fn(async (intent, bytes) => { assets.set(intent.publicId, assetFor(intent, bytes)); }),
  };
  return { provider, assets };
}
function assetFor(intent: ImageIntent, bytes: Buffer): ImageAsset {
  return { asset_id: `asset-${intent.intentKey}`, public_id: intent.publicId, secure_url: `https://res.cloudinary.com/${intent.cloud}/image/upload/v1/${intent.publicId}.png`,
    resource_type: "image", type: "upload", format: "png", bytes: bytes.length, width: 2, height: 2, version: 1,
    ...(intent.mode === "dynamic" ? { asset_folder: intent.folder } : { folder: intent.folder }),
    context: { custom: { kltn_intent: intent.intentKey, kltn_sha256: intent.sha256 } } };
}
async function fixture(role: string | null = "ADMIN") {
  const store = v3TestStore();
  const db = store.deps.database as any;
  let actor = "test-admin";
  let activeRole: string | null = "ADMIN";
  db.user.findUnique = async () => activeRole ? { id: actor, role: activeRole } : null;
  store.deps.resolveSession = async () => activeRole ? { user: { id: actor } } : null;
  const originalCreate = db.idempotencyRecord.create;
  db.idempotencyRecord.create = async ({ data }: any) => originalCreate({ data: { createdAt: new Date(), ...data } });
  db.idempotencyRecord.count = async ({ where }: any) => [...store.records().values()].filter(record => record.scope.startsWith(where.scope.startsWith) && record.createdAt >= where.createdAt.gte).length;
  db.$executeRaw = async () => 1;
  db.$queryRaw = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    if (strings.join("").includes("pg_advisory")) return [];
    const [intentOp, now, uploadOp] = values;
    const records = [...store.records().values()];
    const pending = records.filter(record => {
      const [admin, op] = JSON.parse(record.scope);
      const intent = JSON.parse(record.responseJson);
      return op === intentOp && intent && intent.expiresAt > Number(now) && !records.some(done => done.scope === JSON.stringify([admin, uploadOp]) && done.key === record.key);
    }).length;
    return [{ count: BigInt(pending) }];
  };
  const result = await writeDestination(headers, { name: "Synthetic", description: "Synthetic", category: "chợ phiên", area: "đồng văn", latitude: 23, longitude: 105,
    suggestedDurationMinutes: null, minimumDurationMinutes: null, openingDays: unknownSchedule() }, "create", null, { ...store.deps, resolveSession: async () => ({ user: { id: "test-admin" } }), database: { ...db, user: { findUnique: async () => ({ id: "test-admin", role: "ADMIN" }) } } });
  if (result.status !== "SUCCESS") throw Error("fixture");
  activeRole = role;
  const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).png().toBuffer();
  const input = { name: "synthetic.png", size: bytes.length, mime: "image/png", sha256: createHash("sha256").update(bytes).digest("hex") };
  return { store, db, id: result.data.id, bytes, input, actor: (value: string) => { actor = value; } };
}
describe("Destination image byte/config/HTTP boundaries (offline)", () => {
  beforeEach(() => { vi.unstubAllEnvs(); });
  it.each(["jpeg", "png", "webp", "avif"] as const)("decodes real %s images", async format => {
    const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: "blue" } }).toFormat(format).toBuffer();
    expect(await inspectImage(bytes)).toBe(format);
  });
  it("rejects disguised text, SVG and oversized bytes", async () => {
    await expect(inspectImage(Buffer.from("not an image"))).rejects.toMatchObject({ code: "INVALID_IMAGE" });
    await expect(inspectImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>'))).rejects.toMatchObject({ code: "INVALID_IMAGE" });
    await expect(inspectImage(Buffer.alloc(MAX_IMAGE_BYTES + 1))).rejects.toMatchObject({ code: "IMAGE_TOO_LARGE" });
    expect(imageIntentInput.safeParse({ name: "a", size: MAX_IMAGE_BYTES + 1, mime: "image/png", sha256: "a".repeat(64) }).success).toBe(false);
  });
  it("fails closed on missing config or any foreign folder", () => {
    for (const name of ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"]) vi.stubEnv(name, "");
    expect(cloudinaryConfiguration()).toBeNull();
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "test"); vi.stubEnv("CLOUDINARY_API_KEY", "fake"); vi.stubEnv("CLOUDINARY_API_SECRET", "fake");
    vi.stubEnv("CLOUDINARY_DESTINATION_FOLDER", "Vocab"); expect(cloudinaryConfiguration()).toBeNull();
    vi.stubEnv("CLOUDINARY_DESTINATION_FOLDER", "KLTN/destinations"); expect(cloudinaryConfiguration()?.folder).toBe("KLTN/destinations");
  });
  it("bounds actual streaming bytes without relying on Content-Length", async () => {
    const request = new Request("http://localhost/images", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/octet-stream" }, body: new Uint8Array(MAX_IMAGE_BYTES + 1) });
    await expect(imageBytes(request)).rejects.toMatchObject({ code: "IMAGE_TOO_LARGE" });
    const crossOrigin = new Request("http://localhost/images", { method: "POST", headers: { origin: "http://foreign", "content-type": "application/octet-stream" }, body: "a" });
    await expect(imageBytes(crossOrigin)).rejects.toMatchObject({ code: "INVALID_ORIGIN" });
  });
  it("optimizes only canonical Cloudinary URLs; preserves legacy/transformed URLs", () => {
    expect(destinationThumbnail("https://res.cloudinary.com/test/image/upload/v1/asset.png")).toContain("c_fill,w_640,h_400,q_auto,f_auto/v1");
    expect(destinationThumbnail("https://legacy.example/a.png")).toBe("https://legacy.example/a.png");
    const transformed = "https://res.cloudinary.com/test/image/upload/w_200/v1/a.png"; expect(destinationThumbnail(transformed)).toBe(transformed);
  });
});
describe("Intent/upload/review services with mock persistence/provider (not PostgreSQL)", () => {
  it("persists pre-create caption, cover and order despite reversed upload completion and replay", async () => {
    const f = await fixture(); const p = fakeProvider();
    const later = { ...f.input, initialSelection: { caption: null, position: 1, isCover: false } };
    const cover = { ...f.input, initialSelection: { caption: "  Núi Hà Giang  ", position: 0, isCover: true } };
    expect((await createImageIntent(headers, later, "later", f.id, f.store.deps, p.provider)).status).toBe("SUCCESS");
    expect((await createImageIntent(headers, cover, "cover", f.id, f.store.deps, p.provider)).status).toBe("SUCCESS");
    expect((await uploadDestinationImage(headers, f.bytes, "later", f.id, f.store.deps, p.provider)).status).toBe("SUCCESS");
    expect((await uploadDestinationImage(headers, f.bytes, "cover", f.id, f.store.deps, p.provider)).status).toBe("SUCCESS");
    const media = () => [...f.store.rows().get(f.id).media].sort((a,b) => a.position-b.position);
    expect(media()).toMatchObject([{ caption: "Núi Hà Giang", position: 0, isCover: true, websiteRights: "UNKNOWN" }, { caption: null, position: 1, isCover: false }]);
    const before = structuredClone(media());
    expect((await uploadDestinationImage(headers, f.bytes, "later", f.id, f.store.deps, p.provider)).status).toBe("SUCCESS");
    expect(media()).toEqual(before);
    // A failed selection can resume after the admin reorders already saved photos.
    expect((await createImageIntent(headers, { ...f.input, initialSelection: { caption: "Recovered", position: 0, isCover: false } }, "recovered", f.id, f.store.deps, p.provider)).status).toBe("SUCCESS");
    expect((await uploadDestinationImage(headers, f.bytes, "recovered", f.id, f.store.deps, p.provider)).status).toBe("SUCCESS");
    expect(media().map(item => item.position)).toEqual([0,1,2]);
    expect(media().filter(item => item.isCover)).toHaveLength(1);
    expect((await createImageIntent(headers, { ...cover, initialSelection: { ...cover.initialSelection, caption: "Changed" } }, "cover", f.id, f.store.deps, p.provider)).status).toBe("FAILED");
    for (const initialSelection of [{...cover.initialSelection,position:20},{...cover.initialSelection,caption:"x".repeat(1001)},{...cover.initialSelection,websiteRights:"APPROVED"}]) {
      expect(imageIntentInput.safeParse({...f.input,initialSelection}).success).toBe(false);
    }
  });
  it("uploads without alt/caption/evidence, uses Destination alt, and retains legal UNKNOWN", async () => {
    const f = await fixture(); const p = fakeProvider();
    await createImageIntent(headers, { ...f.input, name: "IMG_000999.png" }, "simple-upload", f.id, f.store.deps, p.provider);
    expect(await uploadDestinationImage(headers, f.bytes, "simple-upload", f.id, f.store.deps, p.provider)).toMatchObject({status:"SUCCESS"});
    const row = f.store.rows().get(f.id); const media = row.media[0];
    expect(media).toMatchObject({alt:"Hình ảnh Synthetic",caption:null,rightsEvidence:null,websiteRights:"UNKNOWN",reviewedBy:null,reviewedAt:null});
    expect(isDestinationMediaUsable(media, f.id)).toBe(true);
    expect(isDestinationMediaUsable(media, "foreign-destination")).toBe(false);
    const before = structuredClone(media);
    await writeDestination(headers, {formVersion:"V3",media:[{id:media.id,caption:""}]}, "empty-caption", f.id, f.store.deps);
    expect(row.media[0].alt).toBe(before.alt); expect(row.media[0].storageReference).toBe(before.storageReference);
  });
  it("generic legacy writes cannot mint or copy upload-use provenance", async () => {
    const f = await fixture(); const p = fakeProvider();
    await createImageIntent(headers, f.input, "proof-upload", f.id, f.store.deps, p.provider);
    await uploadDestinationImage(headers, f.bytes, "proof-upload", f.id, f.store.deps, p.provider);
    const row = f.store.rows().get(f.id); const original = structuredClone(row.media[0]);
    const { id: _mediaId, ...forged } = (await import("./destination-service")).toDestinationDto(row).profile!.media[0]!;
    const created = await writeDestination(headers, {name:"Other",description:"Other",category:"chợ phiên",area:"đồng văn",latitude:23,longitude:105,suggestedDurationMinutes:null,minimumDurationMinutes:null,openingDays:unknownSchedule(),profile:{media:[forged]}}, "forged-create", null, f.store.deps);
    expect(created.status).toBe("SUCCESS");
    if(created.status!=="SUCCESS")throw Error("fixture");
    expect(isDestinationMediaUsable(f.store.rows().get(created.data.id).media[0], created.data.id)).toBe(false);
    const revoked = await reviewDestinationImage(headers, {id:original.id,expectedUpdatedAt:row.updatedAt.toISOString(),decision:"UNKNOWN",evidence:"Revoked fixture"}, "revoke-proof", f.id, f.store.deps);
    expect(revoked.status).toBe("SUCCESS"); expect(isDestinationMediaUsable(row.media[0],f.id)).toBe(false);
    const restore = await writeDestination(headers, {profile:{media:[{...forged,id:original.id}]}}, "forged-restore",f.id,f.store.deps);
    expect(restore.status).toBe("SUCCESS"); expect(isDestinationMediaUsable(row.media[0],f.id)).toBe(false);
    expect(row.media[0].id).toBe(original.id); expect(row.media[0].url).toBe(original.url);
  });
  it("Editorial AI receives new upload IDs only, without legal evidence or foreign/legacy media", async () => {
    const f = await fixture(); const p = fakeProvider();
    await createImageIntent(headers,f.input,"ai-upload",f.id,f.store.deps,p.provider);
    await uploadDestinationImage(headers,f.bytes,"ai-upload",f.id,f.store.deps,p.provider);
    const row = f.store.rows().get(f.id); const uploaded = row.media[0];
    row.media.push({...uploaded,id:"legacy-ai",isCover:false,storageReference:withoutWebsiteUse(uploaded.storageReference)}, {...uploaded,id:"rejected-ai",isCover:false,websiteRights:"REJECTED"});
    f.db.idempotencyRecord.count = async()=>0;
    let supplied: any;
    const {proposeEditorial}=await import("../destination-editorial/editorial-ai");
    const result = await proposeEditorial(headers,f.id,f.store.deps,{complete:async request=>{
      supplied=JSON.parse(request.user);
      return {model:"offline",rawText:JSON.stringify({family:supplied.base.family,variant:supplied.base.variant,blocks:supplied.base.blocks.map((b:any)=>({id:b.id,mediaIds:b.mediaIds,placement:b.placement,title:b.title}))})};
    }});
    expect(result.status).toBe("PROPOSED"); expect(supplied.mediaIds).toEqual([uploaded.id]);
    expect(JSON.stringify(supplied)).not.toContain("storageReference"); expect(JSON.stringify(supplied)).not.toContain("rightsEvidence");
    expect(result.layout.blocks.flatMap(b=>b.mediaIds)).toEqual([uploaded.id]);
  });
  it("Detail/Explore/Planner/Editorial share eligibility, with no HIDDEN or draft leak and no private metadata", async () => {
    const f = await fixture(); const p = fakeProvider();
    await createImageIntent(headers,f.input,"shared-upload",f.id,f.store.deps,p.provider);
    await uploadDestinationImage(headers,f.bytes,"shared-upload",f.id,f.store.deps,p.provider);
    const row=f.store.rows().get(f.id); Object.assign(row.media[0],{sourceUrl:null});
    const {getPublicDestination}=await import("./public-destination-service");
    const {retrievePlannerCandidates}=await import("../trip-planner/planner-candidates");
    const {readPublicEditorial,readEditorialContext}=await import("../destination-editorial/editorial-service");
    const {autoLayout}=await import("../destination-editorial/editorial-engine");
    let published: unknown=null;
    f.db.destinationEditorial={findUnique:async()=>({published})};
    await expect(getPublicDestination(f.id,f.db)).rejects.toMatchObject({status:410});
    expect(await readPublicEditorial(f.id,f.db)).toBeNull();
    expect(await retrievePlannerCandidates(f.db,[f.id])).toEqual([]);
    row.visibility="VISIBLE";
    expect(await readPublicEditorial(f.id,f.db)).toBeNull();
    published=autoLayout(await readEditorialContext(f.id,f.db));
    expect((await readPublicEditorial(f.id,f.db))?.media.map(m=>m.id)).toEqual([row.media[0].id]);
    const detail=await getPublicDestination(f.id,f.db);
    expect(detail.profile?.media).toHaveLength(1);
    const planner=await retrievePlannerCandidates(f.db,[f.id]);
    expect(planner[0]?.image?.url).toBe(row.media[0].url);
    expect(JSON.stringify({detail,planner})).not.toContain("storageReference");
    expect(JSON.stringify({detail,planner})).not.toContain("websiteUse");
    row.media[0].websiteRights="REJECTED";
    expect((await getPublicDestination(f.id,f.db)).profile?.media).toHaveLength(0);
    expect((await readPublicEditorial(f.id,f.db))?.media).toHaveLength(0);
    expect((await retrievePlannerCandidates(f.db,[f.id]))[0]?.image).toBeNull();
    row.media[0].websiteRights="UNKNOWN"; row.media[0].storageReference=withoutWebsiteUse(row.media[0].storageReference);
    expect((await getPublicDestination(f.id,f.db)).profile?.media).toHaveLength(0);
    expect((await readPublicEditorial(f.id,f.db))?.media).toHaveLength(0);
    expect((await retrievePlannerCandidates(f.db,[f.id]))[0]?.image).toBeNull();
  });
  it("verifies returned upload metadata and skips the second provider lookup", async () => {
    const f = await fixture(); const p = fakeProvider();
    await createImageIntent(headers, f.input, "fast-upload", f.id, f.store.deps, p.provider);
    p.provider.upload = vi.fn(async (intent, bytes) => assetFor(intent, bytes));
    expect(await uploadDestinationImage(headers, f.bytes, "fast-upload", f.id, f.store.deps, p.provider)).toMatchObject({ status: "SUCCESS" });
    expect(p.provider.find).toHaveBeenCalledOnce(); expect(p.provider.upload).toHaveBeenCalledOnce();
    expect(f.store.rows().get(f.id).media).toHaveLength(1);
  });
  it("rejects mismatched upload metadata before attachment even on the faster path", async () => {
    const f = await fixture(); const p = fakeProvider();
    await createImageIntent(headers, f.input, "bad-upload", f.id, f.store.deps, p.provider);
    p.provider.upload = vi.fn(async (intent, bytes) => ({ ...assetFor(intent, bytes), public_id: "foreign" }));
    await expect(uploadDestinationImage(headers, f.bytes, "bad-upload", f.id, f.store.deps, p.provider)).rejects.toMatchObject({ code: "INVALID_IMAGE_INTENT" });
    expect(f.store.rows().get(f.id).media).toHaveLength(0);
  });
  it("nested SDK 404 proceeds to upload once, then attaches UNKNOWN and replays the same key",async()=>{
    const f=await fixture();const fake=fakeProvider();const created=await createImageIntent(headers,f.input,"nested-404",f.id,f.store.deps,fake.provider);if(created.status!=="SUCCESS")throw Error("fixture");
    vi.stubEnv("CLOUDINARY_CLOUD_NAME","test-cloud");vi.stubEnv("CLOUDINARY_API_KEY","fixture-key");vi.stubEnv("CLOUDINARY_API_SECRET","fixture-secret");vi.stubEnv("CLOUDINARY_DESTINATION_FOLDER","KLTN/destinations");
    const resource=vi.spyOn(cloudinary.api,"resource").mockRejectedValueOnce({error:{http_code:404,message:"Resource not found"}}).mockResolvedValueOnce(assetFor(created.data,f.bytes) as any);
    const provider=destinationImageProvider();const upload=vi.spyOn(provider,"upload").mockResolvedValue();
    try{
      expect(await uploadDestinationImage(headers,f.bytes,"nested-404",f.id,f.store.deps,provider)).toMatchObject({status:"SUCCESS",data:{profile:{media:[{websiteRights:"UNKNOWN"}]}}});
      expect(await uploadDestinationImage(headers,f.bytes,"nested-404",f.id,f.store.deps,provider)).toMatchObject({status:"SUCCESS",replayed:true});
      expect(upload).toHaveBeenCalledOnce();expect(resource).toHaveBeenCalledTimes(2);expect(f.store.rows().get(f.id).media).toHaveLength(1);
    }finally{resource.mockRestore();upload.mockRestore();vi.unstubAllEnvs();}
  });
  it.each([null, "TRAVELER"])("rejects %s before provider calls", async role => {
    const f = await fixture(role); const p = fakeProvider();
    await expect(createImageIntent(headers, f.input, "image-1", f.id, f.store.deps, p.provider)).rejects.toMatchObject({ status: role ? 403 : 401 });
    await expect(uploadDestinationImage(headers, f.bytes, "image-1", f.id, f.store.deps, p.provider)).rejects.toMatchObject({ status: role ? 403 : 401 });
    await expect(reviewDestinationImage(headers, {}, "image-1", f.id, f.store.deps)).rejects.toMatchObject({ status: role ? 403 : 401 });
    expect(p.provider.folderMode).not.toHaveBeenCalled(); expect(p.provider.upload).not.toHaveBeenCalled();
  });
  it.each(["dynamic", "fixed"] as const)("binds %s folder, defaults UNKNOWN, replays without duplicate/provider", async mode => {
    const f = await fixture(); const p = fakeProvider(mode);
    const intent = await createImageIntent(headers, f.input, "image-1", f.id, f.store.deps, p.provider);
    expect(intent.status).toBe("SUCCESS"); if (intent.status !== "SUCCESS") return;
    expect(intent.data.folder).toBe(`KLTN/destinations/${f.id}`);
    expect(intent.data.publicId.startsWith("KLTN/")).toBe(mode === "fixed");
    expect(await uploadDestinationImage(headers, f.bytes, "image-1", f.id, f.store.deps, p.provider)).toMatchObject({ status: "SUCCESS", data: { profile: { media: [{ websiteRights: "UNKNOWN", isCover: true }] } } });
    const row = f.store.rows().get(f.id); const revision = row.contentRevision;
    const replay = await uploadDestinationImage(headers, f.bytes, "image-1", f.id, f.store.deps, p.provider, intent.data.expiresAt + 1);
    expect(replay).toMatchObject({ status: "SUCCESS", replayed: true }); expect(row.media).toHaveLength(1); expect(row.contentRevision).toBe(revision); expect(p.provider.upload).toHaveBeenCalledOnce();
    expect(JSON.parse(row.media[0].storageReference)).toMatchObject({ cloud: "test-cloud", assetId: "asset-image-1" });
  });
  it("rejects another admin, destination, file, expired intent and forged fields", async () => {
    const f = await fixture(); const p = fakeProvider();
    const intent = await createImageIntent(headers, f.input, "image-1", f.id, f.store.deps, p.provider); if (intent.status !== "SUCCESS") throw Error();
    f.actor("another-admin"); await expect(uploadDestinationImage(headers, f.bytes, "image-1", f.id, f.store.deps, p.provider)).rejects.toMatchObject({ code: "INVALID_IMAGE_INTENT" });
    f.actor("test-admin"); await expect(uploadDestinationImage(headers, Buffer.from("different"), "image-1", f.id, f.store.deps, p.provider)).rejects.toMatchObject({ code: "INVALID_IMAGE_INTENT" });
    await expect(uploadDestinationImage(headers, f.bytes, "image-1", f.id, f.store.deps, p.provider, intent.data.expiresAt)).rejects.toMatchObject({ code: "INVALID_IMAGE_INTENT" });
    await expect(createImageIntent(headers, { ...f.input, folder: "Vocab" }, "bad", f.id, f.store.deps, p.provider)).rejects.toMatchObject({ code: "INVALID_IMAGE" });
    expect(p.provider.upload).not.toHaveBeenCalled();
  });
  it("recovers an existing Cloudinary jpg using decoded JPEG bytes and replays without another upload", async () => {
    const f = await fixture(); const p = fakeProvider();
    const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).jpeg().toBuffer();
    const input = { ...f.input, name: "synthetic.jpg", mime: "image/jpeg", size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
    const result = await createImageIntent(headers, input, "jpeg-recovery", f.id, f.store.deps, p.provider);
    if (result.status !== "SUCCESS") throw Error("fixture intent");
    const asset = { ...assetFor(result.data, bytes), format: "jpg", secure_url: `https://res.cloudinary.com/test-cloud/image/upload/v1/${result.data.publicId}.jpg` };
    p.assets.set(result.data.publicId, asset);
    // The alias must not permit JPEG assets to satisfy a different decoded format.
    expect(() => verifyImageAsset(asset, result.data, "png")).toThrow();
    expect(await uploadDestinationImage(headers, bytes, "jpeg-recovery", f.id, f.store.deps, p.provider)).toMatchObject({ status: "SUCCESS" });
    expect(await uploadDestinationImage(headers, bytes, "jpeg-recovery", f.id, f.store.deps, p.provider)).toMatchObject({ status: "SUCCESS", replayed: true });
    expect(p.provider.upload).not.toHaveBeenCalled();
    const media = f.store.rows().get(f.id).media;
    expect(media).toHaveLength(1);
    expect(media[0].websiteRights).toBe("UNKNOWN");
    expect(JSON.parse(media[0].storageReference).format).toBe("jpg");
  });
  it.each(["public_id", "asset_folder", "secure_url", "context", "resource_type", "bytes", "format"])("rejects untrusted asset %s", async field => {
    const f = await fixture(); const p = fakeProvider(); const result = await createImageIntent(headers, f.input, "image-1", f.id, f.store.deps, p.provider); if (result.status !== "SUCCESS") throw Error();
    const asset = assetFor(result.data, f.bytes);
    const replacement: Record<string, unknown> = { public_id: "Vocab/photo", asset_folder: "Vocab", secure_url: "https://res.cloudinary.com/foreign/image/upload/a", context: { custom: { kltn_intent: "another" } }, resource_type: "video", bytes: MAX_IMAGE_BYTES + 1, format: "gif" };
    expect(() => verifyImageAsset({ ...asset, [field]: replacement[field] }, result.data, "png")).toThrow();
  });
  it("reconciles timeout after provider success without uploading again", async () => {
    const f = await fixture(); const p = fakeProvider(); await createImageIntent(headers, f.input, "image-1", f.id, f.store.deps, p.provider);
    p.provider.upload = vi.fn(async (intent, bytes) => { p.assets.set(intent.publicId, assetFor(intent, bytes)); throw Error("timeout"); });
    expect((await uploadDestinationImage(headers, f.bytes, "image-1", f.id, f.store.deps, p.provider)).status).toBe("SUCCESS");
    await uploadDestinationImage(headers, f.bytes, "image-1", f.id, f.store.deps, p.provider); expect(p.provider.upload).toHaveBeenCalledOnce();
  });
  it("retains HIDDEN destination on provider failure, then retries same intent", async () => {
    const f = await fixture(); const p = fakeProvider(); await createImageIntent(headers, f.input, "image-1", f.id, f.store.deps, p.provider);
    const success = p.provider.upload; p.provider.upload = vi.fn(async () => { throw Error("provider"); });
    await expect(uploadDestinationImage(headers, f.bytes, "image-1", f.id, f.store.deps, p.provider)).rejects.toMatchObject({ code: "IMAGE_UPLOAD_RETRY" });
    expect(f.store.rows().get(f.id)).toMatchObject({ visibility: "HIDDEN", media: [] });
    p.provider.upload = success; expect((await uploadDestinationImage(headers, f.bytes, "image-1", f.id, f.store.deps, p.provider)).status).toBe("SUCCESS");
  });
  it("reserves slots and enforces twenty-image and durable attempt budgets", async () => {
    const f = await fixture(); const p = fakeProvider();
    for (let i = 0; i < 20; i++) expect((await createImageIntent(headers, f.input, `image-${i}`, f.id, f.store.deps, p.provider)).status).toBe("SUCCESS");
    expect(await createImageIntent(headers, f.input, "image-limit", f.id, f.store.deps, p.provider)).toMatchObject({ status: "FAILED", error: { code: "IMAGE_LIMIT" } });
    p.provider.upload = vi.fn(async () => { throw Error("provider"); });
    for (let i = 0; i < 30; i++) await expect(uploadDestinationImage(headers, f.bytes, "image-0", f.id, f.store.deps, p.provider)).rejects.toMatchObject({ code: "IMAGE_UPLOAD_RETRY" });
    expect(await uploadDestinationImage(headers, f.bytes, "image-0", f.id, f.store.deps, p.provider)).toMatchObject({ status: "FAILED", error: { code: "IMAGE_RATE_LIMIT" } });
    expect(p.provider.upload).toHaveBeenCalledTimes(30);
  });
  it("reviews require evidence, persist trusted reviewer/time, reject forged reviewer and conflict", async () => {
    const f = await fixture(); const p = fakeProvider(); await createImageIntent(headers, f.input, "image-1", f.id, f.store.deps, p.provider);
    await uploadDestinationImage(headers, f.bytes, "image-1", f.id, f.store.deps, p.provider);
    const row = f.store.rows().get(f.id); const input = { id: row.media[0].id, expectedUpdatedAt: row.updatedAt.toISOString(), decision: "APPROVED", evidence: "Owner grant" };
    await expect(reviewDestinationImage(headers, { ...input, reviewedBy: "forged" }, "review-bad", f.id, f.store.deps)).rejects.toMatchObject({ code: "INVALID_IMAGE_REVIEW" });
    await expect(reviewDestinationImage(headers, { ...input, evidence: "" }, "review-bad", f.id, f.store.deps)).rejects.toMatchObject({ code: "INVALID_IMAGE_REVIEW" });
    expect((await reviewDestinationImage(headers, input, "review-1", f.id, f.store.deps)).status).toBe("SUCCESS");
    expect(row.media[0]).toMatchObject({ websiteRights: "APPROVED", reviewedBy: "test-admin" }); expect(row.media[0].reviewedAt).toBeInstanceOf(Date);
    expect(await reviewDestinationImage(headers, { ...input, decision: "REJECTED" }, "review-2", f.id, f.store.deps)).toMatchObject({ status: "FAILED", error: { code: "DESTINATION_CHANGED" } });
  });
  it("preserves media IDs/reviewer on no-change/prose/cover/order; URL invalidates approval and unlink journals candidates", async () => {
    const f = await fixture(); const p = fakeProvider();
    for (const key of ["image-1", "image-2"]) { await createImageIntent(headers, f.input, key, f.id, f.store.deps, p.provider); await uploadDestinationImage(headers, f.bytes, key, f.id, f.store.deps, p.provider); }
    const row = f.store.rows().get(f.id); const first = row.media[0], second = row.media[1];
    Object.assign(first, { websiteRights: "APPROVED", rightsEvidence: "Grant", reviewedBy: "historical-admin", reviewedAt: new Date(0) });
    const snapshot = structuredClone(row.media); const updatedAt = row.updatedAt;
    await writeDestination(headers, { formVersion: "V3" }, "no-change", f.id, f.store.deps);
    expect(row.media).toEqual(snapshot); expect(row.updatedAt).toEqual(updatedAt);
    await writeDestination(headers, { formVersion: "V3", description: "New prose", coverMediaId: second.id, mediaOrder: [second.id, first.id] }, "reorder", f.id, f.store.deps);
    expect(row.media[0]).toMatchObject({ id: first.id, position: 1, isCover: false, reviewedBy: "historical-admin", reviewedAt: new Date(0) });
    await writeDestination(headers, { formVersion: "V3", media: [{ id: first.id, url: "https://legacy.example/new.jpg" }] }, "replace-url", f.id, f.store.deps);
    expect(row.media[0]).toMatchObject({ id: first.id, websiteRights: "UNKNOWN", reviewedBy: null, reviewedAt: null, storageReference: null });
    await writeDestination(headers, { formVersion: "V3", removedMediaIds: [second.id] }, "unlink", f.id, f.store.deps);
    expect(row.media).toHaveLength(1); expect(p.assets.size).toBe(2);
    const journal = [...f.store.records().values()].filter(record => record.scope.includes("media-unlinked")); expect(journal).toHaveLength(2);
    expect(journal.map(record => JSON.parse(record.responseJson).physicalDeletion)).toEqual(["NOT_AUTHORIZED", "NOT_AUTHORIZED"]);
  });
  it("rolls back failed DB attachment, then recovers provider asset without duplicate upload", async () => {
    const f = await fixture(); const p = fakeProvider(); await createImageIntent(headers, f.input, "image-1", f.id, f.store.deps, p.provider);
    f.store.failNext(); expect((await uploadDestinationImage(headers, f.bytes, "image-1", f.id, f.store.deps, p.provider)).status).toBe("FAILED");
    expect(f.store.rows().get(f.id).media).toHaveLength(0);
    f.store.clearFailure(); expect((await uploadDestinationImage(headers, f.bytes, "image-1", f.id, f.store.deps, p.provider)).status).toBe("SUCCESS"); expect(p.provider.upload).toHaveBeenCalledOnce();
  });
  it("legacy URL edits also invalidate approval and journal the previously linked asset", async () => {
    const f = await fixture(); const p = fakeProvider(); await createImageIntent(headers, f.input, "image-1", f.id, f.store.deps, p.provider); await uploadDestinationImage(headers, f.bytes, "image-1", f.id, f.store.deps, p.provider);
    const row = f.store.rows().get(f.id); const image = row.media[0];
    Object.assign(image, { websiteRights: "APPROVED", rightsEvidence: "Legacy grant", reviewedBy: "old", reviewedAt: new Date(0) });
    const { id: mediaId, url: _url, ...fields } = (await import("./destination-service")).toDestinationDto(row).profile!.media[0]!;
    const result = await writeDestination(headers, { profile: { media: [{ ...fields, id: mediaId, url: "https://legacy.example/replacement.jpg" }] } }, "legacy-image-url", f.id, f.store.deps);
    expect(result.status).toBe("SUCCESS"); expect(row.media[0]).toMatchObject({ id: mediaId, websiteRights: "UNKNOWN", reviewedBy: null, storageReference: null });
    expect([...f.store.records().values()].filter(r => r.scope.includes("media-unlinked"))).toHaveLength(1);
  });
  it("public list uses verified Admin uploads, keeps legacy UNKNOWN/REJECTED blocked and HIDDEN isolated", async () => {
    const f = await fixture(); const p = fakeProvider(); await createImageIntent(headers, f.input, "image-1", f.id, f.store.deps, p.provider); await uploadDestinationImage(headers, f.bytes, "image-1", f.id, f.store.deps, p.provider);
    expect((await listPublicLocations({}, f.db)).items).toHaveLength(0);
    const row = f.store.rows().get(f.id); row.visibility = "VISIBLE";
    expect((await listPublicLocations({}, f.db)).items[0]?.image?.url).toContain("res.cloudinary.com");
    const reference = row.media[0].storageReference;
    row.media[0].storageReference = withoutWebsiteUse(reference);
    expect((await listPublicLocations({}, f.db)).items[0]?.image).toBeNull();
    row.media[0].storageReference = reference; row.media[0].websiteRights = "REJECTED";
    expect((await listPublicLocations({}, f.db)).items[0]?.image).toBeNull();
    row.media[0].websiteRights = "APPROVED";
    expect((await listPublicLocations({}, f.db)).items[0]?.image?.url).toContain("res.cloudinary.com");
    const findMany = vi.spyOn(f.db.destination, "findMany"); await listPublicLocations({}, f.db);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { visibility: "VISIBLE", deletedAt: null }, select: expect.objectContaining({ media: expect.objectContaining({ where: destinationMediaWhere, orderBy: [{ isCover: "desc" }, { position: "asc" }, { id: "asc" }] }) }) }));
  });
});
describe("Media PATCH ownership and omission", () => {
  const rows = [{ id: "a", url: "https://legacy.example/a", alt: "A", caption: null, author: null, sourceUrl: null, isCover: true, position: 0 }];
  it("omission and identical input are no-ops", () => { expect(mediaChanges(rows, { formVersion: "V3" })).toBeUndefined(); expect(mediaChanges(rows, { formVersion: "V3", media: [{ id: "a", alt: "A" }], mediaOrder: ["a"], coverMediaId: "a" })).toBeUndefined(); });
  it.each([{ media: [{ id: "foreign", alt: "a" }] }, { removedMediaIds: ["foreign"] }, { mediaOrder: ["a", "a"] }, { coverMediaId: "foreign" }])("rejects forged child operations %j", patch => {
    expect(() => mediaChanges(rows, { formVersion: "V3", ...patch })).toThrow();
  });
});
describe("Thin HTTP authorization and uncertain response contract", () => {
  it.each([null, "TRAVELER"])("HTTP rejects %s on all write endpoints before reading bytes/JSON", async role => {
    httpAuth.role = role;
    for (const handler of [intentPost, uploadPost, reviewPost]) {
      let reads = 0;
      const request = new Request("http://localhost/api/admin/destinations/test/images", { method: "POST" });
      Object.defineProperty(request, "body", { get: () => { reads++; throw Error("must not read"); } });
      const response = await handler(request, { params: Promise.resolve({ id: "test" }) });
      expect(response.status).toBe(role ? 403 : 401); expect(reads).toBe(0); expect(response.headers.get("cache-control")).toBe("private, no-store");
      if(handler===uploadPost)expect(response.headers.get("X-Image-Upload-Request-Id")).toMatch(/^[0-9a-f-]{36}$/);
    }
  });
  it("configuration returns only a boolean, no credentials", async () => {
    httpAuth.role = "ADMIN";
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "test"); vi.stubEnv("CLOUDINARY_API_KEY", "FAKE_KEY_SENTINEL"); vi.stubEnv("CLOUDINARY_API_SECRET", "FAKE_SECRET_SENTINEL"); vi.stubEnv("CLOUDINARY_DESTINATION_FOLDER", "KLTN/destinations");
    const response = await configurationGet(new Request("http://localhost/api/admin/destination-images/configuration"));
    const body = await response.text(); expect(JSON.parse(body)).toEqual({ success: true, data: { configured: true } }); expect(body).not.toContain("FAKE_");
    vi.unstubAllEnvs(); httpAuth.role = null;
  });
  it("malformed and unconfirmed upload responses are UNKNOWN; no optimistic success", () => {
    const parse = () => { throw Error("bad DTO"); };
    expect(parseImageResult({ success: true, operationStatus: "SUCCESS", data: {} }, parse).status).toBe("UNKNOWN");
    expect(parseImageResult({ success: false, operationStatus: "UNKNOWN" }, parse).status).toBe("UNKNOWN");
    expect(parseImageResult(null, parse).status).toBe("UNKNOWN");
    expect(parseImageResult({ success: false, operationStatus: "FAILED", error: { message: "Denied" } }, parse)).toMatchObject({ status: "FAILED", message: "Denied" });
  });
});
