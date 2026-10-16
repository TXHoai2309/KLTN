import { fixtureQaAssessment } from "./__fixtures__/qa-reviewed-input";
import { randomUUID, createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../../../../../packages/db/prisma/generated/client";
import type { Database } from "@KLTN/db";
import { createQaAbuseGuard } from "./qa-abuse";
import { createQaPrincipalResolver, guestToken } from "./qa-principal";
import { createQaConversationStore, type QaReservation } from "./qa-conversation-store";
import { createQaService } from "./qa-service";
import { QA_INSUFFICIENT_SOURCE_MESSAGE, type QaCompletedTurn } from "./qa-contract";
import type { QaPrincipal } from "./qa-runtime-contract";
vi.mock("server-only",()=>({}));
const url=process.env.US19_TASK184_TEST_DATABASE_URL;
const suite=url?describe:describe.skip;
suite("US21 durable multi-instance guest/cost admission",()=>{
  let db:PrismaClient;
  const network="a".repeat(64);
  beforeAll(async()=>{
    const target=new URL(url!);
    if(!["localhost","127.0.0.1","[::1]"].includes(target.hostname)||target.username!=="task184_test"||target.pathname!=="/task184_test"||target.searchParams.get("sslmode")!=="disable"||process.env.US19_TASK184_TEST_DISPOSABLE!=="I_UNDERSTAND_THIS_IS_A_DISPOSABLE_TEST_DATABASE") throw new Error("Disposable loopback target required");
    db=new PrismaClient({adapter:new PrismaPg({connectionString:url!})});
  });
  beforeEach(async()=>{
    await db.$executeRaw(Prisma.sql`DELETE FROM qa_abuse_lease`);
    await db.$executeRaw(Prisma.sql`DELETE FROM qa_abuse_bucket`);
  });
  afterAll(async()=>{await db?.$disconnect();});
  async function guest(networkId=network):Promise<QaPrincipal>{
    const id=createHash("sha256").update(randomUUID()).digest("hex");
    await db.$executeRaw(Prisma.sql`INSERT INTO qa_guest_identity(id,"expiresAt") VALUES(${id},CURRENT_TIMESTAMP+INTERVAL '7 days')`);
    return {kind:"GUEST",id,networkId};
  }
  const input={question:"Câu hỏi kiểm thử",context:{type:"GENERAL" as const}};
  function completed(r:QaReservation):QaCompletedTurn{return {conversationId:r.conversationId,turnId:r.turnId,turnState:"COMPLETED",context:{type:"GENERAL"},status:"INSUFFICIENT_SOURCE",answerParts:[],citations:[],message:QA_INSUFFICIENT_SOURCE_MESSAGE};}
  async function tokenUsage(){return (await db.$queryRaw<{used:number}[]>(Prisma.sql`SELECT used FROM qa_abuse_bucket WHERE scope='tokens-global'`))[0]?.used??0;}
  it("serializes different instances against one network and rolls back rejected reservations",async()=>{
    const guard=createQaAbuseGuard(db as Database,{concurrentNetwork:1});
    const stores=[createQaConversationStore(db as Database,{abuse:guard.hooks}),createQaConversationStore(db as Database,{abuse:createQaAbuseGuard(db as Database,{concurrentNetwork:1}).hooks})];
    const principals=[await guest(),await guest()];
    const results=await Promise.allSettled(stores.map((store,i)=>store.reserve(principals[i]!,randomUUID(),input)));
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect(results.find(r=>r.status==='rejected')).toMatchObject({reason:{code:"RATE_LIMITED"}});
    const rows=await db.$queryRaw<{n:bigint}[]>(Prisma.sql`SELECT count(*) AS n FROM qa_turn WHERE "principalId" IN (${Prisma.join(principals.map(p=>p.id))})`);
    expect(Number(rows[0]!.n)).toBe(1);expect(await tokenUsage()).toBe(43_000);
  });
  it("same-key replay does not charge; cookie/principal rotation cannot evade network quota or call providers",async()=>{
    const guard=createQaAbuseGuard(db as Database,{askNetworkDay:1});
    const store=createQaConversationStore(db as Database,{abuse:guard.hooks});
    const p=await guest(),key=randomUUID(),r=await store.reserve(p,key,input) as QaReservation;
    const data=await store.complete(p,r,completed(r),[]);
    expect(await store.reserve(p,key,input)).toEqual({kind:"REPLAY",data});expect(await tokenUsage()).toBe(43_000);
    const retrieve=vi.fn(),generate=vi.fn();
    const service=createQaService({store,assessor:{assess:async input=>fixtureQaAssessment(input)},retriever:{retrieve,recheck:async()=>true},generator:{generate}});
    await expect(service.ask(await guest(),randomUUID(),input)).rejects.toMatchObject({code:"RATE_LIMITED"});
    expect(retrieve).not.toHaveBeenCalled();expect(generate).not.toHaveBeenCalled();expect(await tokenUsage()).toBe(43_000);
  });
  it("charges recovered same-key attempts and expired leases cannot release the new fence",async()=>{
    const guard=createQaAbuseGuard(db as Database),store=createQaConversationStore(db as Database,{abuse:guard.hooks});
    const p=await guest(),key=randomUUID(),r=await store.reserve(p,key,input) as QaReservation;
    await db.$executeRaw(Prisma.sql`UPDATE qa_turn SET "leaseUntil"=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE id=${r.turnId}`);
    await db.$executeRaw(Prisma.sql`UPDATE qa_abuse_lease SET "leaseUntil"=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE "turnId"=${r.turnId}`);
    const recovered=await store.reserve(p,key,input) as QaReservation;
    expect(recovered.fence).toBe(2);expect(await tokenUsage()).toBe(66_000);
    await db.$transaction(tx=>guard.hooks.release(tx,r.turnId,1));
    expect((await db.$queryRaw<{fence:number}[]>(Prisma.sql`SELECT fence FROM qa_abuse_lease WHERE "turnId"=${r.turnId}`))[0]!.fence).toBe(2);
    await store.fail(p,recovered,"AI_UNAVAILABLE");
    expect(await db.$queryRaw(Prisma.sql`SELECT * FROM qa_abuse_lease WHERE "turnId"=${r.turnId}`)).toEqual([]);
    expect(await tokenUsage()).toBe(66_000);
  });
  it("full conservative cost ceiling is enforced globally across networks",async()=>{
    const guard=createQaAbuseGuard(db as Database,{globalTokensDay:43_000});
    const store=createQaConversationStore(db as Database,{abuse:guard.hooks});
    const p=await guest(),r=await store.reserve(p,randomUUID(),input) as QaReservation;
    await store.fail(p,r,"AI_UNAVAILABLE");
    await expect(store.reserve(await guest("b".repeat(64)),randomUUID(),input)).rejects.toMatchObject({code:"RATE_LIMITED"});
    expect(await tokenUsage()).toBe(43_000);
  });
  it("global concurrency cannot be bypassed by using another principal and network",async()=>{
    const guard=createQaAbuseGuard(db as Database,{concurrentGlobal:1});
    const store=createQaConversationStore(db as Database,{abuse:guard.hooks});
    const p=await guest(),r=await store.reserve(p,randomUUID(),input) as QaReservation;
    const other=await guest("c".repeat(64));
    await expect(store.reserve(other,randomUUID(),input)).rejects.toMatchObject({code:"RATE_LIMITED"});
    await store.fail(p,r,"AI_UNAVAILABLE");
    expect((await store.reserve(other,randomUUID(),input)).kind).toBe("RESERVED");
  });
  it("counter expiry and cleanup rerun preserve current budgets",async()=>{
    const guard=createQaAbuseGuard(db as Database);
    await guard.bootstrap(network,async()=>undefined);
    await db.$executeRaw(Prisma.sql`INSERT INTO qa_abuse_bucket(scope,"windowStart","windowSeconds",used,"expiresAt") VALUES('expired-test',CURRENT_TIMESTAMP-INTERVAL '2 days',3600,1,CURRENT_TIMESTAMP-INTERVAL '1 day')`);
    await guard.cleanup();await guard.cleanup();
    expect(await db.$queryRaw(Prisma.sql`SELECT * FROM qa_abuse_bucket WHERE scope='expired-test'`)).toEqual([]);
    const rows=await db.$queryRaw<{used:number}[]>(Prisma.sql`SELECT used FROM qa_abuse_bucket WHERE scope=${`bootstrap-network:${network}`}`);
    expect(rows).toEqual([{used:1}]);
  });
  it("bootstrap reuses server session, rejects forged identity, and persists multi-instance quotas atomically",async()=>{
    const guard=createQaAbuseGuard(db as Database,{bootstrapNetworkHour:1});
    const auth={database:{user:{findUnique:vi.fn()}} as never,resolveSession:async()=>null};
    const resolver=()=>createQaPrincipalResolver({database:db as Database,auth,secure:true,networkId:()=>network,abuse:guard});
    const first=await resolver().bootstrap(new Headers({cookie:"kltn_qa_guest=forged"}));
    expect(first.setCookie).toContain("HttpOnly; SameSite=Strict");expect(first.setCookie).toContain("Secure");
    const token=guestToken(new Headers({cookie:first.setCookie!}));expect(token).toMatch(/^[a-f0-9]{64}$/);
    const retry=await resolver().bootstrap(new Headers({cookie:`kltn_qa_guest=${token}`}));
    expect(retry.principal).toEqual(first.principal);expect(retry.setCookie).toBeUndefined();
    await expect(resolver().bootstrap(new Headers({cookie:`kltn_qa_guest=${"b".repeat(64)}`}))).rejects.toMatchObject({code:"RATE_LIMITED"});
    const identity=await db.$queryRaw<{id:string}[]>(Prisma.sql`SELECT id FROM qa_guest_identity WHERE id=${first.principal.id}`);
    expect(identity).toHaveLength(1);expect(identity[0]!.id).not.toBe(token);
  });
  it("missing trusted identity and unknown guest are denied before providers",async()=>{
    const store=createQaConversationStore(db as Database,{abuse:createQaAbuseGuard(db as Database).hooks});
    const p=await guest();delete p.networkId;
    await expect(store.reserve(p,randomUUID(),input)).rejects.toMatchObject({code:"AI_UNAVAILABLE"});
    await expect(store.reserve({kind:"GUEST",id:"f".repeat(64),networkId:network},randomUUID(),input)).rejects.toMatchObject({code:"UNAUTHENTICATED"});
    expect(await tokenUsage()).toBe(0);
  });
});
