import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
vi.mock("server-only", () => ({}));
import { AppError } from "../../server/http/app-error";
import { createQaHttpHandlers, readQaRequest, type QaHttpDependencies } from "./qa-http";
import { QA_INSUFFICIENT_SOURCE_MESSAGE, qaResponseSchema, type QaCompletedTurn } from "./qa-contract";
import { assertQaSameOrigin, guestCookie, guestToken, createQaPrincipalResolver } from "./qa-principal";
import type { Database } from "@KLTN/db";

const completed: QaCompletedTurn = { conversationId: "conv", turnId: "turn", turnState: "COMPLETED" as const, context: { type: "GENERAL" as const }, status: "INSUFFICIENT_SOURCE" as const, answerParts: [] as [], citations: [] as [], message: QA_INSUFFICIENT_SOURCE_MESSAGE };
function dependencies(): QaHttpDependencies {
  return { enabled: () => true, resolve: vi.fn(async () => ({ kind: "GUEST" as const, id: "digest" })), ask: vi.fn(async () => ({ data: completed, replayed: false })), history: vi.fn(async () => []), delete: vi.fn(async () => undefined) };
}
function request(body: string = JSON.stringify({ question: " Câu hỏi " }), headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/ai/ask", { method: "POST", body, headers: { origin: "http://localhost", "content-type": "application/json", "Idempotency-Key": "key", ...headers } });
}
describe("QA HTTP contract and identity boundary", () => {
  it("normalizes and passes only validated request, principal and key", async () => {
    const deps = dependencies(); const res = await createQaHttpHandlers(deps).ask(request());
    expect(res.status).toBe(200); expect(res.headers.get("cache-control")).toBe("no-store");
    expect(qaResponseSchema.parse(await res.json()).operationStatus).toBe("SUCCESS");
    expect(deps.ask).toHaveBeenCalledWith({ kind: "GUEST", id: "digest" }, "key", { question: "Câu hỏi", context: { type: "GENERAL" } }, expect.any(AbortSignal));
  });
  it.each(["userId", "role", "history", "evidence", "sourceList", "trustedContext"])("rejects client %s before auth/provider", async field => {
    const deps = dependencies(); const res = await createQaHttpHandlers(deps).ask(request(JSON.stringify({ question: "Q", [field]: "untrusted" })));
    expect(res.status).toBe(400); expect(deps.resolve).not.toHaveBeenCalled(); expect(deps.ask).not.toHaveBeenCalled();
  });
  it.each([["{}", 400], ["{", 400], [JSON.stringify({question:"x".repeat(2001)}),400], [JSON.stringify({question:"Q",context:{type:"TRIP"}}),400], ["x".repeat(16385),413]] as const)("rejects invalid/oversized body", async(body,status)=>{
    const deps=dependencies(); expect((await createQaHttpHandlers(deps).ask(request(body))).status).toBe(status); expect(deps.ask).not.toHaveBeenCalled();
  });
  it("counts streamed bytes independent of declared content-length", async()=>{
    const body=new ReadableStream<Uint8Array>({start(c){c.enqueue(new Uint8Array(8192));c.enqueue(new Uint8Array(8193));c.close();}});
    const req=new Request("http://localhost/api/ai/ask",{method:"POST",body,duplex:"half",headers:{"content-type":"application/json","content-length":"1"}} as RequestInit);
    await expect(readQaRequest(req)).rejects.toMatchObject({code:"PAYLOAD_TOO_LARGE"});
  });
  it("enforces media/key and rejects cross-site writes", async()=>{
    const h=createQaHttpHandlers(dependencies());
    expect((await h.ask(request("{}",{"content-type":"text/plain"}))).status).toBe(415);
    expect((await h.ask(request(undefined,{"Idempotency-Key":""}))).status).toBe(400);
    expect((await h.ask(request(undefined,{"Idempotency-Key":"x".repeat(201)}))).status).toBe(400);
    expect((await h.ask(request(undefined,{origin:"https://attacker.invalid"}))).status).toBe(403);
    expect(()=>assertQaSameOrigin(new Request("http://localhost"))).toThrow(AppError);
  });
  it("hard unavailable gate makes no auth/DB/provider calls",async()=>{
    const deps=dependencies();deps.enabled=()=>false;
    const res=await createQaHttpHandlers(deps).ask(request());expect(res.status).toBe(503);expect(deps.resolve).not.toHaveBeenCalled();
  });
  it("replay header follows confirmed replay",async()=>{
    const deps=dependencies();deps.ask=async()=>({data:completed,replayed:true});
    expect((await createQaHttpHandlers(deps).ask(request())).headers.get("Idempotency-Replayed")).toBe("true");
  });
  it.each(["AI_UNAVAILABLE", "AI_INVALID_RESPONSE", "INTERNAL_SERVER_ERROR", "CONVERSATION_STALE", "NOT_FOUND"] as const)("sanitizes %s errors",async code=>{
    const deps=dependencies();deps.ask=async()=>{throw new AppError(code,"private/blob?token=secret",500,{embedding:[1]});};
    const res=await createQaHttpHandlers(deps).ask(request());const text=await res.text();
    expect(text).not.toMatch(/private|token|embedding|secret/); expect(qaResponseSchema.parse(JSON.parse(text)).operationStatus).toBe("FAILED");
  });
  it("uncertain commit never emits SUCCESS content",async()=>{
    const deps=dependencies();deps.ask=async()=>{throw new Error("database secret");};
    const res=await createQaHttpHandlers(deps).ask(request());const body=qaResponseSchema.parse(await res.json());expect(body.operationStatus).toBe("UNKNOWN");expect(body).not.toHaveProperty("data");
  });
  it("read-only principal/history failure is FAILED internal, not uncertain completion",async()=>{
    const deps=dependencies();deps.resolve=async()=>{throw new Error("SQL timeout");};
    const res=await createQaHttpHandlers(deps).ask(request());
    expect(res.status).toBe(500);expect(qaResponseSchema.parse(await res.json()).operationStatus).toBe("FAILED");expect(deps.ask).not.toHaveBeenCalled();
    const readDeps=dependencies();readDeps.history=async()=>{throw new Error("SQL timeout");};
    const read=await createQaHttpHandlers(readDeps).conversation(new Request("http://localhost/"),"conv",false);
    expect(read.status).toBe(500);expect((await read.json()).operationStatus).toBe("FAILED");
  });
  it("authorizes read/delete and rejects foreign origin delete",async()=>{
    const deps=dependencies();const h=createQaHttpHandlers(deps);
    await h.conversation(new Request("http://localhost/api/ai/conversations/conv"),"conv",false);expect(deps.history).toHaveBeenCalledWith({kind:"GUEST",id:"digest"},"conv");
    expect((await h.conversation(request(undefined,{origin:"https://attacker.invalid"}),"conv",true)).status).toBe(403);expect(deps.delete).not.toHaveBeenCalled();
  });
  it("cookie is HttpOnly scoped, strict, secure; duplicate/malformed tokens rejected",()=>{
    const token="a".repeat(64); expect(guestToken(new Headers({cookie:`kltn_qa_guest=${token}`}))).toBe(token);
    expect(guestToken(new Headers({cookie:`kltn_qa_guest=${token}; kltn_qa_guest=${token}`}))).toBeNull();
    expect(guestToken(new Headers({cookie:"kltn_qa_guest=client-id"}))).toBeNull();
    expect(guestCookie(token,true)).toContain("Path=/api/ai; HttpOnly; SameSite=Strict; Max-Age=604800; Secure");
  });
  it("logged-in principal wins over guest cookie, bootstrap clears guest without migration",async()=>{
    const db={$queryRaw:vi.fn(),$executeRaw:vi.fn()} as unknown as Database;
    const resolve=createQaPrincipalResolver({database:db,secure:true,auth:{database:{user:{findUnique:async()=>({id:"user",role:"ADMIN"})}} as never,resolveSession:async()=>({user:{id:"user"}})}});
    expect(await resolve.resolve(new Headers({cookie:`kltn_qa_guest=${"a".repeat(64)}`}))).toEqual({kind:"USER",id:"user"});
    expect((await resolve.bootstrap(new Headers())).setCookie).toContain("Max-Age=0");expect(db.$queryRaw).not.toHaveBeenCalled();expect(db.$executeRaw).not.toHaveBeenCalled();
  });
  it("allows only same-token revocation reconciliation after the identity was revoked",async()=>{
    const token="b".repeat(64),id=createHash("sha256").update(token).digest("hex");
    const query=vi.fn(async(sql:{sql:string})=>sql.sql.includes('"revokedAt" IS NULL')?[]:[{id}]);
    const resolve=createQaPrincipalResolver({database:{$queryRaw:query} as unknown as Database,secure:true,
      auth:{resolveSession:async()=>null,database:{user:{findUnique:async()=>null}} as never}});
    const headers=new Headers({cookie:`kltn_qa_guest=${token}`});
    await expect(resolve.resolve(headers)).rejects.toMatchObject({code:"UNAUTHENTICATED"});
    await expect(resolve.revoke(headers)).resolves.toEqual({kind:"GUEST",id});
    expect(query).toHaveBeenCalledTimes(2);
  });
  it("supports conversation list with search and cursor pagination", async () => {
    const deps = dependencies();
    deps.list = vi.fn(async () => ({ items: [{ id: "c1", title: "Test", context: { type: "GENERAL" }, createdAt: "2026-10-17T00:00:00.000Z", lastActivityAt: "2026-10-17T00:00:00.000Z" }], nextCursor: null, hasMore: false }));
    const h = createQaHttpHandlers(deps);
    const res = await h.listConversations(new Request("http://localhost/api/ai/conversations?limit=10&search=h%C3%A0+giang"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.items).toHaveLength(1);
    expect(deps.list).toHaveBeenCalledWith({ kind: "GUEST", id: "digest" }, { cursor: undefined, limit: 10, search: "hà giang" });
  });
  it("supports rename conversation with origin protection and title validation", async () => {
    const deps = dependencies();
    deps.rename = vi.fn(async (_p, id, title) => ({ id, title }));
    const h = createQaHttpHandlers(deps);
    const crossRes = await h.renameConversation(new Request("http://localhost/api/ai/conversations/c1", { method: "PATCH", body: JSON.stringify({ title: "New" }), headers: { origin: "https://attacker.invalid", "content-type": "application/json" } }), "c1");
    expect(crossRes.status).toBe(403);
    const emptyRes = await h.renameConversation(new Request("http://localhost/api/ai/conversations/c1", { method: "PATCH", body: JSON.stringify({ title: "   " }), headers: { origin: "http://localhost", "content-type": "application/json" } }), "c1");
    expect(emptyRes.status).toBe(400);
    const validRes = await h.renameConversation(new Request("http://localhost/api/ai/conversations/c1", { method: "PATCH", body: JSON.stringify({ title: "Đèo Mã Pí Lèng" }), headers: { origin: "http://localhost", "content-type": "application/json" } }), "c1");
    expect(validRes.status).toBe(200);
    expect(await validRes.json()).toEqual({ success: true, operationStatus: "SUCCESS", data: { id: "c1", title: "Đèo Mã Pí Lèng" } });
  });
  it("enriches conversation get with metadata and completed turns array", async () => {
    const deps = dependencies();
    deps.get = vi.fn(async () => ({
      conversation: { id: "c1", title: "Title", context: { type: "GENERAL" }, headTurnId: "t1", createdAt: "2026-10-17T00:00:00.000Z", lastActivityAt: "2026-10-17T00:00:00.000Z" },
      turns: [{ question: "Q1", response: completed }],
    }));
    const h = createQaHttpHandlers(deps);
    const res = await h.conversation(new Request("http://localhost/api/ai/conversations/c1"), "c1", false);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(1);
    expect(json.conversation.id).toBe("c1");
  });
  it("supports conversation turns pagination", async () => {
    const deps = dependencies();
    deps.turns = vi.fn(async () => ({ turns: [{ question: "Q1", response: completed }], nextCursor: null, hasMore: false }));
    const h = createQaHttpHandlers(deps);
    const res = await h.conversationTurns(new Request("http://localhost/api/ai/conversations/c1/turns?limit=5"), "c1");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.turns).toHaveLength(1);
  });
});
