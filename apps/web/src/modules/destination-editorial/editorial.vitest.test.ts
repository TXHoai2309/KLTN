import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
const httpRole=vi.hoisted(()=>({role:null as string|null}));
vi.mock("../destination/destination-server",()=>({destinationDependencies:{resolveSession:async()=>httpRole.role?{user:{id:"admin"}}:null,database:{user:{findUnique:async()=>httpRole.role?{id:"admin",role:httpRole.role}:null}}}}));
import { autoLayout, resolveEditorial, validateLayoutReferences, chooseFamily } from "./editorial-engine";
import { editorialLayoutSchema, editorialBlockSchema, families, variants } from "./editorial-contract";
import { editorialFixture } from "./__fixtures__/editorial-fixture";
import { validateAiProposal, proposeEditorial } from "./editorial-ai";
import { getEditorial, readPublicEditorial, writeEditorial } from "./editorial-service";
import { v3TestStore } from "../destination/__fixtures__/v3-store";
import { writeDestination } from "../destination/destination-service";
import { unknownSchedule } from "../destination/destination-contract";
import { GET as getRoute, PATCH as patchRoute } from "@/app/api/admin/destinations/[id]/editorial/route";
import { POST as aiRoute } from "@/app/api/admin/destinations/[id]/editorial/propose/route";
import { createOpenAiStructuredClient } from "../preference-extraction/openai-structured-client";
describe("Content-aware deterministic magazine", () => {
  it.each([0, 1, 2, 4, 8, 20])("%i photos: no repetition, no invented quote/timeline, deterministic refresh", count => {
    const context = editorialFixture(undefined, count), layout = autoLayout(context);
    expect(autoLayout(context)).toEqual(layout);
    const ids = layout.blocks.flatMap(b => b.mediaIds); expect(new Set(ids).size).toBe(ids.length); expect(ids).toHaveLength(count);
    expect(layout.blocks.some(b => b.type === "TIMELINE" || b.type === "QUOTE")).toBe(false);
    expect(resolveEditorial(layout, context)).not.toBeNull();
    if (!count) expect(layout.variant).toBe("EDITORIAL");
    if (count === 1) expect(layout.blocks.filter(b => b.mediaIds.length)).toHaveLength(1);
  });
  it.each([["di tích lịch sử – kiến trúc", "HERITAGE_STORY"], ["thiên nhiên – thắng cảnh", "NATURE_SHOWCASE"], ["làng du lịch – bản làng", "VILLAGE_CULTURE"], ["công viên địa chất", "NATURE_SHOWCASE"]])("%s chooses %s", (category, family) => expect(chooseFamily(category)).toBe(family));
  it("all twelve combinations are strict layouts with materially different variant IDs", () => { const base = autoLayout(editorialFixture()); for (const family of families) for (const variant of variants) expect(editorialLayoutSchema.safeParse({ ...base, family, variant }).success).toBe(true); });
  it("filters revoked media and references; does not expose internal identity metadata", () => {
    const context = editorialFixture(); const layout = autoLayout(context); context.media[0]!.websiteRights = "REJECTED";
    const result = resolveEditorial(layout, context)!;
    expect(result.media.some(m => m.id === "photo-0")).toBe(false); expect(JSON.stringify(result)).not.toContain("storageReference"); expect(JSON.stringify(result)).not.toContain("asset-");
    expect(() => validateLayoutReferences(layout, context, true)).toThrow();
  });
  it("rejects foreign media/source, HTML, executable JSON and duplicate photo usage", () => {
    const context = editorialFixture(); const layout = autoLayout(context);
    expect(() => validateLayoutReferences({ ...layout, blocks: [{ ...layout.blocks[0]!, mediaIds: ["foreign"] }] }, context, false)).toThrow();
    expect(editorialLayoutSchema.safeParse({ ...layout, html: "<script>" }).success).toBe(false);
    expect(editorialBlockSchema.safeParse({ id: "unsafe", type: "INTRO", text: "<img src=x>" }).success).toBe(false);
    expect(editorialLayoutSchema.safeParse({ ...layout, blocks: [layout.blocks[0], { ...layout.blocks[0], id: "duplicate" }] }).success).toBe(false);
  });
  it("short and extremely segmented prose do not create empty/too-many blocks", () => {
    const context = editorialFixture(undefined, 0); context.description = "Short";
    expect(autoLayout(context).blocks.filter(b => ["TEXT_SECTION", "IMAGE_TEXT_SPLIT"].includes(b.type))).toHaveLength(0);
    context.description = Array(300).fill("A paragraph.").join("\n\n"); expect(autoLayout(context).blocks.length).toBeLessThanOrEqual(30);
  });
  it("regeneration retains supplementary Admin prose and source-backed timeline without assigning duplicate photos",()=>{
    const context=editorialFixture(),base=autoLayout(context);
    const extra=editorialBlockSchema.parse({id:"manual",type:"TEXT_SECTION",title:"Nét riêng",text:"Nội dung bổ sung được Admin kiểm duyệt",sourceIds:["source"]});
    const next=autoLayout(context,{...base,blocks:[...base.blocks,extra]});expect(next.blocks.some(b=>b.text===extra.text)).toBe(true);expect(new Set(next.blocks.flatMap(b=>b.mediaIds)).size).toBe(context.media.length);expect(autoLayout(context,next)).toEqual(next);
  });
  it("quote/timeline require genuine provenance; revoked sources remove them", () => {
    const context = editorialFixture(); const layout = autoLayout(context);
    const quote = editorialBlockSchema.parse({ id: "quote", type: "QUOTE", text: "Not supplied", sourceIds: [] });
    expect(() => validateLayoutReferences({ ...layout, blocks: [...layout.blocks, quote] }, context, true)).toThrow();
    const sourced = { ...quote, sourceIds: ["source"] }; expect(() => validateLayoutReferences({ ...layout, blocks: [...layout.blocks, sourced] }, context, true)).not.toThrow();
    context.sources[0]!.websiteRights = "REJECTED"; expect(resolveEditorial({ ...layout, blocks: [...layout.blocks, sourced] }, context)?.layout.blocks.some(b => b.id === "quote")).toBe(false);
  });
});
describe("AI proposal is constrained presentation only", () => {
  const context = editorialFixture(), base = autoLayout(context);
  const proposal = () => ({ family: base.family, variant: "SPLIT", blocks: base.blocks.map(b => ({ id: b.id, mediaIds: b.mediaIds, placement: b.placement, title: b.title })) });
  it("accepts reordered known block IDs and leaves prose/source facts unchanged", () => {
    const input = proposal(); input.blocks.reverse(); const result = validateAiProposal(JSON.stringify(input), base, context);
    expect(result.blocks[0]?.type).toBe("HERO"); expect(result.blocks.at(-1)?.type).toBe("SOURCES");
    expect(result.blocks.filter(b=>["TEXT_SECTION","IMAGE_TEXT_SPLIT","FULL_WIDTH_IMAGE","IMAGE_GRID","IMAGE_GALLERY"].includes(b.type)).map(b=>b.id)).toEqual([...base.blocks].reverse().filter(b=>["TEXT_SECTION","IMAGE_TEXT_SPLIT","FULL_WIDTH_IMAGE","IMAGE_GRID","IMAGE_GALLERY"].includes(b.type)).map(b=>b.id));
    expect(result.blocks.find(b => b.type === "INTRO")?.text).toBe(base.blocks.find(b => b.type === "INTRO")?.text);
  });
  it.each(["json", "title", "media", "block", "url"])("rejects invalid/forged %s", mode => {
    const input = proposal();
    if (mode === "json") return expect(() => validateAiProposal("bad json", base, context)).toThrow();
    if (mode === "title") input.blocks[0]!.title = "Invented historical claim";
    if (mode === "media") input.blocks[0]!.mediaIds = ["foreign"];
    if (mode === "block") input.blocks[0]!.id = "unknown";
    if (mode === "url") Object.assign(input, { url: "https://foreign.example" });
    expect(() => validateAiProposal(JSON.stringify(input), base, context)).toThrow();
  });
});
describe("Authorization and missing migration fallback", () => {
  it.each([null, "TRAVELER"])("rejects %s for read/write/AI", async role => {
    const f = v3TestStore(role); const h = new Headers();
    await expect(getEditorial(h,"fixture",f.deps)).rejects.toMatchObject({ status: role ? 403 : 401 });
    await expect(writeEditorial(h,{},"key","fixture",f.deps)).rejects.toMatchObject({ status: role ? 403 : 401 });
    await expect(proposeEditorial(h,"fixture",f.deps,null)).rejects.toMatchObject({ status: role ? 403 : 401 });
  });
  it("missing table shows migration blocker while deterministic editor and public legacy remain available", async () => {
    const f = v3TestStore(); const h = new Headers();
    const created = await writeDestination(h,{ name:"Fixture",description:"Fixture",area:"area",category:"thiên nhiên – thắng cảnh",latitude:23,longitude:105,suggestedDurationMinutes:null,minimumDurationMinutes:null,openingDays:unknownSchedule() },"create",null,f.deps);
    if (created.status !== "SUCCESS") throw Error();
    Object.assign(f.deps.database,{ destinationEditorial: { findUnique: async()=>{throw {code:"P2021"};} } });
    const state = await getEditorial(h,created.data.id,f.deps); expect(state.available).toBe(false); expect(state.reason).toContain("migration");
    expect(await proposeEditorial(h,created.data.id,f.deps,null)).toMatchObject({ status:"FALLBACK" });
    expect(await readPublicEditorial(created.data.id,f.deps.database)).toBeNull();
  });
});
describe("HTTP boundary and real structured adapter with mocked transport",()=>{
  it.each([null,"TRAVELER"])("%s denied before body reads on editor/AI routes",async role=>{
    httpRole.role=role;
    for(const handler of [patchRoute,aiRoute]){let reads=0;const request=new Request("http://localhost/api/admin/destinations/fixture/editorial",{method:"POST"});Object.defineProperty(request,"body",{get:()=>{reads++;throw Error("must not read");}});const response=await handler(request,{params:Promise.resolve({id:"fixture"})});expect(response.status).toBe(role?403:401);expect(reads).toBe(0);expect(response.headers.get("cache-control")).toBe("private, no-store");}
    expect((await getRoute(new Request("http://localhost/api/admin/destinations/fixture/editorial"),{params:Promise.resolve({id:"fixture"})})).status).toBe(role?403:401);
  });
  it("structured OpenAI adapter sends bounded presentation schema and validates returned known IDs",async()=>{
    const f=v3TestStore();const db=f.deps.database as any;db.$executeRaw=async()=>1;db.idempotencyRecord.count=async()=>1;
    const created=await writeDestination(new Headers(),{name:"Synthetic",description:"Synthetic introduction.\n\nSynthetic second paragraph.",area:"area",category:"thiên nhiên – thắng cảnh",latitude:23,longitude:105,suggestedDurationMinutes:60,minimumDurationMinutes:30,openingDays:unknownSchedule()},"create",null,f.deps);if(created.status!=="SUCCESS")throw Error();
    let requestBody:any;
    const fetcher=vi.fn(async(_url:unknown,init:any)=>{requestBody=JSON.parse(init.body);const supplied=JSON.parse(requestBody.messages[1].content);return new Response(JSON.stringify({choices:[{finish_reason:"stop",message:{content:JSON.stringify({family:"NATURE_SHOWCASE",variant:"SPLIT",blocks:supplied.base.blocks.map((b:any)=>({id:b.id,mediaIds:b.mediaIds,placement:b.placement,title:b.title}))})}}]}),{status:200});});
    const client=createOpenAiStructuredClient({apiKey:()=>"fake-offline-key",model:()=>"owner-model",fetcher:fetcher as typeof fetch,maxOutputTokens:1200,timeoutMs:15000,maxResponseBytes:24000});
    const result=await proposeEditorial(new Headers(),created.data.id,f.deps,client,{direction:"AUTO"});expect(result.status).toBe("PROPOSED");expect(fetcher).toHaveBeenCalledOnce();expect(requestBody).toMatchObject({store:false,max_completion_tokens:1200,response_format:{type:"json_schema",json_schema:{strict:true}}});expect(requestBody.messages[1].content).not.toContain("storageReference");expect(requestBody.messages[1].content).not.toContain("reviewedBy");
  });
});
