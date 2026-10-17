import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createEditorialOpenAiClient, EDITORIAL_OPENAI_LIMITS } from "./editorial-openai-client";
import { createOpenAiStructuredClient } from "../preference-extraction/openai-structured-client";
import { createEditorialAiDiagnostics, EditorialAiError, editorialHttpError } from "./editorial-ai-diagnostics";
import { editorialAiClient } from "./editorial-server";
import { proposeEditorial } from "./editorial-ai";
import { validateAiProposal } from "./editorial-ai";
import { autoLayout } from "./editorial-engine";
import { editorialBlockSchema } from "./editorial-contract";
import { readEditorialContext } from "./editorial-service";
import { v3TestStore } from "../destination/__fixtures__/v3-store";
import { writeDestination } from "../destination/destination-service";
import { unknownSchedule } from "../destination/destination-contract";
import { ADMIN_IMAGE_USE } from "../destination/destination-media-eligibility";

const input = { system: "fixture-private-system", user: "fixture-private-user", jsonSchema: { type: "object", additionalProperties: false, required: ["value"], properties: { value: { type: "string" } } } };
const completion = (content = '{"value":"ok"}', finish = "stop") => new Response(JSON.stringify({ choices: [{ finish_reason: finish, message: { content } }] }), { status: 200 });
const client = (fetcher: typeof fetch, timeoutMs?: number) => createEditorialOpenAiClient({ apiKey: () => "fixture-private-key", model: () => "gpt-6-luna", fetcher, timeoutMs });
beforeEach(() => { vi.stubEnv("OPENAI_API_KEY", "fixture-private-key"); vi.stubEnv("OPENAI_EDITORIAL_MODEL", "gpt-6-luna"); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Editorial-only GPT-6 Luna adapter, offline", () => {
  it("sends exact Luna model, maximum reasoning, strict schema and bounded tokens; no temperature", async () => {
    const fetcher = vi.fn(async () => completion());
    expect(await client(fetcher as typeof fetch).complete(input)).toEqual({ rawText: '{"value":"ok"}', model: "gpt-6-luna" });
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ model: "gpt-6-luna", reasoning_effort: "max", max_completion_tokens: 8192, store: false,
      response_format: { type: "json_schema", json_schema: { name: "destination_editorial_layout", strict: true, schema: input.jsonSchema } } });
    expect(body).not.toHaveProperty("temperature"); expect(body).not.toHaveProperty("top_p");
  });
  it("reproduces the old unsupported-temperature request in a mock while the Editorial request succeeds", async () => {
    const fetcher = vi.fn(async (_url: unknown, init: any) => JSON.parse(init.body).temperature === 0
      ? new Response(JSON.stringify({ error: { code: "unsupported_value", param: "temperature", message: "fixture-private-error" } }), { status: 400 }) : completion());
    const old = createOpenAiStructuredClient({ apiKey: () => "fixture-private-key", model: () => "gpt-6-luna", fetcher: fetcher as typeof fetch });
    await expect(old.complete(input)).rejects.toMatchObject({ code: "PROVIDER_REJECTED" });
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toMatchObject({ temperature: 0, max_completion_tokens: 1200 });
    await expect(client(fetcher as typeof fetch).complete(input)).resolves.toMatchObject({ model: "gpt-6-luna" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([
    [400, "unsupported_parameter", "temperature", "UNSUPPORTED_PARAMETER"],
    [400, "invalid_json_schema", "response_format", "OPENAI_SCHEMA_REJECTED"],
    [401, "invalid_api_key", null, "INVALID_API_KEY"], [403, null, "model", "FORBIDDEN"],
    [404, "model_not_found", "model", "MODEL_UNAVAILABLE"],
    [429, "insufficient_quota", null, "QUOTA_EXCEEDED"], [429, "rate_limit_exceeded", null, "RATE_LIMIT"],
    [403, "billing_not_active", null, "QUOTA_EXCEEDED"],
    [500, "server_error", null, "PROVIDER_UNAVAILABLE"],
  ])("classifies HTTP %i / %s without retrying or retaining raw response", async (status, code, param, category) => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: { code, param, message: "fixture-private-key and full response", authorization: "fixture-private" } }), { status: status as number }));
    try { await client(fetcher as typeof fetch).complete(input); throw Error("expected failure"); }
    catch (error) {
      expect(error).toBeInstanceOf(EditorialAiError);
      expect(error).toMatchObject({ code: category, httpStatus: status, providerCode: code, param });
      expect(JSON.stringify(error)).not.toContain("fixture-private");
    }
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("sanitizes hostile provider code/param and logs only safe correlation metadata", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = editorialHttpError(400, { error: { code: "fixture-private-key", param: "fixture-private-prompt", message: "fixture-private" } });
    const diagnostics = createEditorialAiDiagnostics(); diagnostics.failure("PROVIDER_REQUEST", error);
    const raw = String(info.mock.calls[0]![0]);
    expect(raw).not.toContain("fixture-private");
    expect(JSON.parse(raw)).toEqual({ event: "editorial_ai", correlationId: diagnostics.correlationId, phase: "PROVIDER_REQUEST", stage: "PROVIDER_REQUEST_FAILED", code: "UNSUPPORTED_PARAMETER", httpStatus: 400, providerCode: null, param: null });
  });
  it("bounds a fetch that ignores abort", async () => {
    vi.useFakeTimers(); const fetcher = vi.fn(() => new Promise<Response>(() => {}));
    const check = expect(client(fetcher as typeof fetch, 20).complete(input)).rejects.toMatchObject({ code: "TIMEOUT" });
    await vi.advanceTimersByTimeAsync(21); await check; expect(fetcher).toHaveBeenCalledOnce();
  });
  it("bounds a stalled response body", async () => {
    vi.useFakeTimers(); const fetcher = vi.fn(async () => new Response(new ReadableStream({ start() {} })));
    const check = expect(client(fetcher as typeof fetch, 20).complete(input)).rejects.toMatchObject({ code: "TIMEOUT" });
    await vi.advanceTimersByTimeAsync(21); await check;
  });
  it("classifies network failure, token exhaustion and invalid structured content", async () => {
    await expect(client(vi.fn(async () => { throw Error("fixture-private-network"); }) as typeof fetch).complete(input)).rejects.toMatchObject({ code: "NETWORK" });
    await expect(client(vi.fn(async () => completion("{}", "length")) as typeof fetch).complete(input)).rejects.toMatchObject({ code: "TOKEN_LIMIT" });
    await expect(client(vi.fn(async () => completion("not JSON")) as typeof fetch).complete(input)).rejects.toMatchObject({ code: "INVALID_OUTPUT" });
    await expect(client(vi.fn(async () => new Response(JSON.stringify({choices:[{finish_reason:"stop",message:{refusal:"fixture-private"}}]}))) as typeof fetch).complete(input)).rejects.toMatchObject({ code: "REFUSAL" });
  });
  it("rejects missing configuration, invalid schemas and already-cancelled input without a provider call", async () => {
    const fetcher = vi.fn(async () => completion());
    await expect(createEditorialOpenAiClient({apiKey:()=>undefined,model:()=>"gpt-6-luna",fetcher:fetcher as typeof fetch}).complete(input)).rejects.toMatchObject({code:"CONFIGURATION"});
    await expect(client(fetcher as typeof fetch).complete({...input,jsonSchema:{type:"object"}})).rejects.toMatchObject({code:"LOCAL_INVALID_SCHEMA"});
    await expect(client(fetcher as typeof fetch).complete({...input,signal:AbortSignal.abort()})).rejects.toMatchObject({code:"CANCELLED"});
    expect(fetcher).not.toHaveBeenCalled();
    vi.stubEnv("OPENAI_API_KEY", ""); expect(editorialAiClient()).toBeNull();
    vi.stubEnv("OPENAI_API_KEY", "fixture-private-key"); vi.stubEnv("OPENAI_EDITORIAL_MODEL", ""); expect(editorialAiClient()).toBeNull();
  });
});

async function fixture() {
  const store = v3TestStore(), db = store.deps.database as any;
  db.$executeRaw = async () => 1; db.idempotencyRecord.count = async () => 0;
  const created = await writeDestination(new Headers(), {name:"Synthetic",description:"Fixture introduction.\n\nSecond paragraph.",area:"area",category:"thiên nhiên – thắng cảnh",latitude:23,longitude:105,suggestedDurationMinutes:60,minimumDurationMinutes:30,openingDays:unknownSchedule()},"create",null,store.deps);
  if(created.status!=="SUCCESS")throw Error("fixture"); const id=created.data.id, row=store.rows().get(id);
  row.media.push({id:"photo",url:"https://res.cloudinary.com/fixture/image/upload/v1/photo.jpg",alt:"Hình ảnh Synthetic",caption:null,author:null,sourceUrl:null,isCover:true,position:0,websiteRights:"UNKNOWN",rightsEvidence:null,reviewedBy:null,reviewedAt:null,storageReference:JSON.stringify({provider:"cloudinary",cloud:"fixture",assetId:"asset",publicId:"photo",version:1,format:"jpg",destinationId:id,websiteUse:ADMIN_IMAGE_USE})});
  const layout=autoLayout(await readEditorialContext(id,db));
  layout.blocks.push(editorialBlockSchema.parse({id:"manual",type:"TEXT_SECTION",text:"fixture-private unsaved manual text"}));
  return {store,db,id,row,layout};
}
describe("Editorial proposal through the real Luna adapter with mocked HTTP", () => {
  it.each(["KEEP", "AUTO"] as const)("sends %s direction, a strict design schema and only safe media descriptions", async direction => {
    const f = await fixture(); let sent:any;
    const fetcher = vi.fn(async (_url:unknown, init:any) => {
      sent = JSON.parse(init.body); const input = JSON.parse(sent.messages[1].content);
      return completion(JSON.stringify({ family: direction === "KEEP" ? input.base.family : "HERITAGE_STORY", variant: direction === "KEEP" ? input.base.variant : "EDITORIAL", design: { typography:"LITERARY", palette:"EARTH", rhythm:"IMMERSIVE" }, blocks: input.base.blocks.map((b:any) => ({ id:b.id, title:b.title, mediaIds:b.mediaIds, placement:b.placement, crop:"wide", gallery:"mosaic" })) }));
    });
    const result = await proposeEditorial(new Headers(), f.id, f.store.deps, client(fetcher as typeof fetch), { layout:f.layout, direction });
    expect(result.status).toBe("PROPOSED"); expect(result.layout.design?.palette).toBe("EARTH");
    const schema = sent.response_format.json_schema.schema;
    expect(schema.properties.family.enum).toHaveLength(direction === "KEEP" ? 1 : 4);
    expect(schema.properties.variant.enum).toHaveLength(direction === "KEEP" ? 1 : 3);
    expect(schema.required).toContain("design");
    expect(schema.required).toContain("heroComposition");
    expect(schema.properties.heroComposition.enum).toEqual(["PANORAMA", "SPLIT", "EDITORIAL"]);
    expect(schema.properties.blocks.items.required).toEqual(expect.arrayContaining(["focalX", "focalY"]));
    const input = JSON.parse(sent.messages[1].content); expect(input.direction).toBe(direction);
    expect(input.media[0]).toMatchObject({ id:"photo", alt:"Hình ảnh Synthetic", isCover:true });
    expect(sent.messages[1].content).not.toContain("res.cloudinary.com");
    expect(sent.messages[1].content).not.toContain("storageReference");
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("rejects foreign or REJECTED image IDs even inside a hidden existing block",async()=>{
    const f=await fixture();f.row.media.push({...f.row.media[0],id:"rejected",isCover:false,websiteRights:"REJECTED"});
    const context=await readEditorialContext(f.id,f.db);
    const base={...f.layout,blocks:f.layout.blocks.map(b=>b.type==="HERO"?{...b,hidden:true}:b)};
    for(const id of ["foreign","rejected"]) {
      const proposed={family:base.family,variant:base.variant,blocks:base.blocks.map(b=>({id:b.id,mediaIds:b.type==="HERO"?[id]:b.mediaIds,placement:b.placement,title:b.title}))};
      expect(()=>validateAiProposal(JSON.stringify(proposed),base,context)).toThrow();
    }
  });
  it.each([[400,"unsupported_parameter","UNSUPPORTED_PARAMETER"],[401,"invalid_api_key","INVALID_API_KEY"],[403,null,"FORBIDDEN"],[429,"insufficient_quota","QUOTA_EXCEEDED"],[500,"server_error","PROVIDER_UNAVAILABLE"]])("HTTP %i becomes a diagnosed fallback with the same current layout",async(status,code,category)=>{
    const f=await fixture(), info=vi.spyOn(console,"info").mockImplementation(()=>{});
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({error:{code,param:status===400?"temperature":null,message:"fixture-private-provider-message"}}),{status:status as number}));
    const diagnostics=createEditorialAiDiagnostics();
    const result=await proposeEditorial(new Headers(),f.id,f.store.deps,client(fetcher as typeof fetch),{layout:f.layout,diagnostics});
    expect(result.status).toBe("FALLBACK");expect(result.outcome).toBe("PROVIDER_FAILED");expect(result.layout).toEqual(f.layout);expect(result.reason).toContain(diagnostics.correlationId);
    expect(JSON.parse(String(info.mock.calls.at(-1)![0]))).toMatchObject({phase:"PROVIDER_REQUEST",code:category,httpStatus:status,correlationId:diagnostics.correlationId});
    expect(JSON.stringify(info.mock.calls)).not.toContain("fixture-private");expect(fetcher).toHaveBeenCalledOnce();
  });
  it("uses the configured factory, changes layout, preserves existing blocks/prose and does not save Destination or Editorial", async () => {
    const f=await fixture(), before=structuredClone(f.row); let requestBody:any;
    const fetcher=vi.fn(async (_url:unknown,init:any)=>{requestBody=JSON.parse(init.body);const supplied=JSON.parse(requestBody.messages[1].content);
      return completion(JSON.stringify({family: supplied.base.family,variant:"EDITORIAL",blocks:[...supplied.base.blocks].reverse().map((b:any)=>({id:b.id,mediaIds:b.mediaIds,placement:"right",title:b.title}))}));});
    vi.stubGlobal("fetch",fetcher); const diagnostics=createEditorialAiDiagnostics();
    const result=await proposeEditorial(new Headers(),f.id,f.store.deps,editorialAiClient(),{layout:f.layout,diagnostics,direction:"AUTO"});
    expect(result.status).toBe("PROPOSED"); expect(result.layout).not.toEqual(f.layout);
    expect(result.layout.blocks.map(b=>b.id).sort()).toEqual(f.layout.blocks.map(b=>b.id).sort());
    expect(result.layout.blocks.find(b=>b.id==="manual")?.text).toBe("fixture-private unsaved manual text");
    expect(f.row).toEqual(before); expect(requestBody.model).toBe("gpt-6-luna");
    expect(JSON.parse(requestBody.messages[1].content).mediaIds).toEqual(["photo"]);
    expect(requestBody.messages[1].content).not.toContain("rightsEvidence");
    expect(result.correlationId).toBe(diagnostics.correlationId);
  });
  it("logs proposal-validation failure separately and falls back without changing the existing layout", async () => {
    const f=await fixture(); const info=vi.spyOn(console,"info").mockImplementation(()=>{});
    const fetcher=vi.fn(async (_url:unknown,init:any)=>{const base=JSON.parse(JSON.parse(init.body).messages[1].content).base;return completion(JSON.stringify({family:base.family,variant:base.variant,blocks:base.blocks.map((b:any)=>({id:b.id,mediaIds:b.type==="HERO"?["foreign"]:[],placement:b.placement,title:b.title}))}));});
    const result=await proposeEditorial(new Headers(),f.id,f.store.deps,client(fetcher as typeof fetch),{layout:f.layout});
    expect(result.status).toBe("FALLBACK"); expect(result.layout).toEqual(f.layout);
    const log=JSON.parse(String(info.mock.calls.at(-1)![0])); expect(log).toMatchObject({phase:"PROPOSAL_VALIDATION",code:"PROPOSAL_INVALID"});
    expect(JSON.stringify(info.mock.calls)).not.toContain("fixture-private");
  });
  it("missing client returns a deterministic fallback without spending a provider budget",async()=>{
    const f=await fixture();const count=vi.spyOn(f.db.idempotencyRecord,"count");
    const result=await proposeEditorial(new Headers(),f.id,f.store.deps,null);
    expect(result.status).toBe("FALLBACK");expect(result.reason).toContain("Chưa cấu hình");expect(count).not.toHaveBeenCalled();
  });
  it.each(["schema", "duplicate", "missing", "foreign", "design"])("invalid %s model proposal returns a diagnosed atomic fallback", async mode => {
    const f = await fixture(), before = structuredClone({ layout: f.layout, row: f.row });
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const fetcher = vi.fn(async (_url: unknown, init: any) => {
      const supplied = JSON.parse(JSON.parse(init.body).messages[1].content);
      const p = { family: supplied.base.family, variant: supplied.base.variant, design: supplied.base.design, blocks: supplied.base.blocks.map((b: any) => ({ id: b.id, title: b.title, mediaIds: b.mediaIds, placement: b.placement })) };
      if (mode === "schema") return completion("[]");
      if (mode === "duplicate") p.blocks[1].id = p.blocks[0].id;
      if (mode === "missing") p.blocks.pop();
      if (mode === "foreign") p.blocks[0].mediaIds = ["foreign"];
      if (mode === "design") p.design.typography = "unsafe";
      return completion(JSON.stringify(p));
    });
    const result = await proposeEditorial(new Headers(), f.id, f.store.deps, client(fetcher as typeof fetch), { layout: f.layout });
    expect(result).toMatchObject({ status: "FALLBACK", outcome: "VALIDATION_FAILED", layout: before.layout });
    expect({ layout: f.layout, row: f.row }).toEqual(before);
    const log = JSON.parse(String(info.mock.calls.at(-1)![0]));
    expect(log).toMatchObject({ phase: "PROPOSAL_VALIDATION", code: "PROPOSAL_INVALID" });
    expect(log.validationCode).toBeTruthy(); expect(JSON.stringify(info.mock.calls)).not.toContain("fixture-private");
  });
  it("a timeout preserves the exact current layout even when the AI input must omit revoked media", async () => {
    const f = await fixture(); f.row.media[0].websiteRights = "REJECTED";
    const before = structuredClone({ layout: f.layout, row: f.row });
    const fetcher = vi.fn(() => new Promise<Response>(() => {}));
    const result = await proposeEditorial(new Headers(), f.id, f.store.deps, client(fetcher as typeof fetch, 20), { layout: f.layout });
    expect(result).toMatchObject({ status: "FALLBACK", outcome: "PROVIDER_FAILED", layout: before.layout });
    expect(result.layout.blocks[0]!.mediaIds).toEqual(["photo"]);
    expect({ layout: f.layout, row: f.row }).toEqual(before);
  });
});
