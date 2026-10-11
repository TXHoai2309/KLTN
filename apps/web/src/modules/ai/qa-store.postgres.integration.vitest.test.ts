import { randomUUID, createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../../../../../packages/db/prisma/generated/client";
import type { Database } from "@KLTN/db";
import { createQaConversationStore, type QaReservation } from "./qa-conversation-store";
import { createQaService } from "./qa-service";
import { QA_INSUFFICIENT_SOURCE_MESSAGE, type QaCompletedTurn } from "./qa-contract";
import type { QaPrincipal, QaAnswer } from "./qa-runtime-contract";
vi.mock("server-only",()=>({}));

const url=process.env.US19_TASK184_TEST_DATABASE_URL;
const suite=url?describe:describe.skip;
suite("US21 real PostgreSQL reservations, retention and completion",()=>{
  let db:PrismaClient;
  let store:ReturnType<typeof createQaConversationStore>;
  beforeAll(async()=>{
    const target=new URL(url!);
    if(!["localhost","127.0.0.1","[::1]"].includes(target.hostname)||target.username!=="task184_test"||target.pathname!=="/task184_test"||target.searchParams.get("sslmode")!=="disable"||process.env.US19_TASK184_TEST_DISPOSABLE!=="I_UNDERSTAND_THIS_IS_A_DISPOSABLE_TEST_DATABASE") throw new Error("Disposable loopback target required");
    db=new PrismaClient({adapter:new PrismaPg({connectionString:url!})});
    store=createQaConversationStore(db as Database);
  });
  afterAll(async()=>{await db?.$disconnect();});
  async function guest():Promise<QaPrincipal>{
    const id=createHash("sha256").update(randomUUID()).digest("hex");
    await db.$executeRaw(Prisma.sql`INSERT INTO qa_guest_identity(id,"expiresAt") VALUES(${id},CURRENT_TIMESTAMP+INTERVAL '7 days')`);
    return {kind:"GUEST",id};
  }
  async function reservation(p:QaPrincipal,key=randomUUID(),question="Câu hỏi kiểm thử"){
    const r=await store.reserve(p,key,{question,context:{type:"GENERAL"}});
    expect(r.kind).toBe("RESERVED");
    return r as QaReservation;
  }
  function completed(r:QaReservation):QaCompletedTurn{return {conversationId:r.conversationId,turnId:r.turnId,turnState:"COMPLETED",context:{type:"GENERAL"},status:"INSUFFICIENT_SOURCE",answerParts:[],citations:[],message:QA_INSUFFICIENT_SOURCE_MESSAGE};}
  it("commits first/follow-up, bounded authorized history and replay before stale gate",async()=>{
    const p=await guest(),key=randomUUID(); const first=await reservation(p,key);
    const data=await store.complete(p,first,completed(first),[]);
    const follow=await store.reserve(p,randomUUID(),{conversationId:first.conversationId,parentTurnId:first.turnId,question:"Nó ở đâu?"});
    expect(follow.kind).toBe("RESERVED"); expect((follow as QaReservation).history).toEqual([{question:"Câu hỏi kiểm thử",response:data}]);
    await store.complete(p,follow as QaReservation,completed(follow as QaReservation),[]);
    expect(await store.reserve(p,key,{question:"Câu hỏi kiểm thử",context:{type:"GENERAL"}})).toEqual({kind:"REPLAY",data});
    expect(await store.history(p,first.conversationId)).toHaveLength(2);
  });
  it("same principal/key/different canonical body conflicts without replay",async()=>{
    const p=await guest(),key=randomUUID(),r=await reservation(p,key);
    await store.complete(p,r,completed(r),[]);
    await expect(store.reserve(p,key,{question:"Khác",context:{type:"GENERAL"}})).rejects.toMatchObject({code:"IDEMPOTENCY_KEY_REUSED"});
  });
  it("isolates guests and user identities before history/provider",async()=>{
    const p=await guest(),other=await guest(),r=await reservation(p);
    await expect(store.history(other,r.conversationId)).rejects.toMatchObject({code:"NOT_FOUND"});
    await expect(store.reserve(other,randomUUID(),{conversationId:r.conversationId,parentTurnId:null,question:"x"})).rejects.toMatchObject({code:"NOT_FOUND"});
    await expect(store.history({kind:"USER",id:p.id},r.conversationId)).rejects.toMatchObject({code:"UNAUTHENTICATED"});
  });
  it("serializes distinct concurrent turns and rejects stale head",async()=>{
    const p=await guest(),r=await reservation(p); await store.complete(p,r,completed(r),[]);
    const req={conversationId:r.conversationId,parentTurnId:r.turnId,question:"Tiếp"};
    const results=await Promise.allSettled([store.reserve(p,randomUUID(),req),store.reserve(p,randomUUID(),req)]);
    expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1);
    expect(results.find(x=>x.status==='rejected')).toMatchObject({reason:{code:"CONVERSATION_BUSY"}});
    const accepted=(results.find(x=>x.status==='fulfilled') as PromiseFulfilledResult<QaReservation>).value;
    await store.complete(p,accepted,completed(accepted),[]);
    await expect(store.reserve(p,randomUUID(),req)).rejects.toMatchObject({code:"CONVERSATION_STALE"});
  });
  it("same-key running request is UNKNOWN; expired lease uses a fence",async()=>{
    const p=await guest(),key=randomUUID(),r=await reservation(p,key);
    const req={question:"Câu hỏi kiểm thử",context:{type:"GENERAL" as const}};
    await expect(store.reserve(p,key,req)).rejects.toMatchObject({code:"OPERATION_STATUS_UNKNOWN"});
    await db.$executeRaw(Prisma.sql`UPDATE qa_turn SET "leaseUntil"=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE id=${r.turnId}`);
    const recovered=await store.reserve(p,key,req) as QaReservation;
    expect(recovered.turnId).toBe(r.turnId); expect(recovered.fence).toBe(r.fence+1);
    await expect(store.complete(p,r,completed(r),[])).rejects.toMatchObject({code:"CONVERSATION_BUSY"});
    await db.$executeRaw(Prisma.sql`UPDATE qa_turn SET "leaseUntil"=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE id=${r.turnId}`);
    await expect(createQaConversationStore(db as Database,{maxAttempts:2}).reserve(p,key,req)).rejects.toMatchObject({code:"AI_UNAVAILABLE"});
    await db.$executeRaw(Prisma.sql`UPDATE qa_turn SET "leaseUntil"=CURRENT_TIMESTAMP+INTERVAL '1 minute' WHERE id=${r.turnId}`);
    await store.complete(p,recovered,completed(recovered),[]);
  });
  it("deletion scrubs all content and blocks completion/replay resurrection",async()=>{
    const p=await guest(),key=randomUUID(),r=await reservation(p,key);
    await store.delete(p,r.conversationId);
    await expect(store.complete(p,r,completed(r),[])).rejects.toMatchObject({code:"NOT_FOUND"});
    await expect(store.reserve(p,key,{question:"Câu hỏi kiểm thử",context:{type:"GENERAL"}})).rejects.toMatchObject({code:"NOT_FOUND"});
    expect((await db.$queryRaw<{state:string;question:unknown;response:unknown;provenance:unknown}[]>(Prisma.sql`SELECT state,question,response,provenance FROM qa_turn WHERE id=${r.turnId}`))[0]).toEqual({state:"TOMBSTONE",question:null,response:null,provenance:null});
  });
  it("expired access commits content cleanup even though caller receives NOT_FOUND",async()=>{
    const p=await guest(),r=await reservation(p); await store.complete(p,r,completed(r),[]);
    await db.$executeRaw(Prisma.sql`UPDATE qa_conversation SET "expiresAt"=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE id=${r.conversationId}`);
    await expect(store.history(p,r.conversationId)).rejects.toMatchObject({code:"NOT_FOUND"});
    expect((await db.$queryRaw<{question:unknown}[]>(Prisma.sql`SELECT question FROM qa_turn WHERE id=${r.turnId}`))[0]!.question).toBeNull();
  });
  it("samples expiry after advisory-lock contention crosses the exact expiry boundary",async()=>{
    const p=await guest(),key=randomUUID(),r=await reservation(p,key),data=completed(r);await store.complete(p,r,data,[]);
    const boundary=new Date(Date.now()+250);
    await db.$executeRaw(Prisma.sql`UPDATE qa_conversation SET "expiresAt"=${boundary}::timestamptz WHERE id=${r.conversationId}`);
    let release!:()=>void, acquired!:()=>void;
    const held=new Promise<void>(resolve=>{release=resolve;});
    const locked=new Promise<void>(resolve=>{acquired=resolve;});
    const blocker=db.$transaction(async tx=>{
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify(["qa",p.kind,p.id])},0))::text AS locked`);
      acquired();await held;
    },{timeout:10000});
    await locked;
    let clockReads=0;
    const clocked=createQaConversationStore(db as Database,{now:()=>++clockReads===1?new Date(boundary.getTime()-1):new Date(boundary)});
    const pending=clocked.reserve(p,key,{question:"Câu hỏi kiểm thử",context:{type:"GENERAL"}});
    let observedWait=false;
    try {
      for(let attempt=0;attempt<100&&!observedWait;attempt++){
        const lockKey=JSON.stringify(["qa",p.kind,p.id]);
        const wait=await db.$queryRaw<Array<{count:number}>>(Prisma.sql`WITH lock_hash AS (SELECT hashtextextended(${lockKey},0) AS value)
          SELECT count(*)::int AS count FROM pg_locks l CROSS JOIN lock_hash
          WHERE l.locktype='advisory' AND l.granted=false AND l.objsubid=1
            AND l.database=(SELECT oid FROM pg_database WHERE datname=current_database())
            AND l.classid::bigint=((lock_hash.value>>32)&4294967295) AND l.objid::bigint=(lock_hash.value&4294967295)`);
        observedWait=(wait[0]?.count??0)>0;
        if(!observedWait)await new Promise(resolve=>setTimeout(resolve,10));
      }
      expect(observedWait).toBe(true);
      expect(clockReads).toBe(1);
    } finally {release();}
    await blocker;
    await expect(pending).rejects.toMatchObject({code:"NOT_FOUND"});
    const row=(await db.$queryRaw<{state:string;question:unknown;response:unknown}[]>(Prisma.sql`SELECT state,question,response FROM qa_turn WHERE id=${r.turnId}`))[0]!;
    expect(row).toEqual({state:"TOMBSTONE",question:null,response:null});
    expect((await db.$queryRaw<{expiresAt:Date}[]>(Prisma.sql`SELECT "expiresAt" FROM qa_conversation WHERE id=${r.conversationId}`))[0]!.expiresAt).toEqual(boundary);
  });
  it("history and replay do not extend retention; failed content clears after24h",async()=>{
    const p=await guest(),key=randomUUID(),r=await reservation(p,key); await store.complete(p,r,completed(r),[]);
    const before=await db.$queryRaw<{expiresAt:Date}[]>(Prisma.sql`SELECT "expiresAt" FROM qa_conversation WHERE id=${r.conversationId}`);
    await store.history(p,r.conversationId); await store.reserve(p,key,{question:"Câu hỏi kiểm thử",context:{type:"GENERAL"}});
    const after=await db.$queryRaw<{expiresAt:Date}[]>(Prisma.sql`SELECT "expiresAt" FROM qa_conversation WHERE id=${r.conversationId}`);
    expect(after).toEqual(before);
    const failed=await reservation(p); await store.fail(p,failed,"AI_UNAVAILABLE");
    await db.$executeRaw(Prisma.sql`UPDATE qa_turn SET "contentExpiresAt"=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE id=${failed.turnId}`);
    await store.cleanup();
    expect((await db.$queryRaw<{question:unknown}[]>(Prisma.sql`SELECT question FROM qa_turn WHERE id=${failed.turnId}`))[0]!.question).toBeNull();
  });
  it("revocation atomically fences turns and removes guest content",async()=>{
    const p=await guest(),r=await reservation(p); await store.revokeGuest(p);
    await expect(store.revokeGuest(p)).resolves.toBeUndefined();
    await expect(store.complete(p,r,completed(r),[])).rejects.toMatchObject({code:"UNAUTHENTICATED"});
    expect((await db.$queryRaw<{state:string}[]>(Prisma.sql`SELECT state FROM qa_turn WHERE id=${r.turnId}`))[0]!.state).toBe("TOMBSTONE");
  });
  it("bounded durable rate admission excludes successful replay",async()=>{
    const p=await guest(),limited=createQaConversationStore(db as Database,{maxPerTenMinutes:1,maxPerDay:1}),key=randomUUID();
    const req={question:"x",context:{type:"GENERAL" as const}},r=await limited.reserve(p,key,req) as QaReservation;
    await limited.complete(p,r,completed(r),[]);
    expect((await limited.reserve(p,key,req)).kind).toBe("REPLAY");
    await expect(limited.reserve(p,randomUUID(),req)).rejects.toMatchObject({code:"RATE_LIMITED"});
  });
  it("lost completion acknowledgement reconciles same key without provider replay",async()=>{
    const p=await guest(),key=randomUUID();
    const flaky={...store,complete:async(...args:Parameters<typeof store.complete>)=>{await store.complete(...args);throw new Error("lost acknowledgement");}};
    const generate=vi.fn(async():Promise<QaAnswer>=>({status:"INSUFFICIENT_SOURCE",answerParts:[],citations:[],message:QA_INSUFFICIENT_SOURCE_MESSAGE}));
    const service=createQaService({store:flaky,retriever:{retrieve:async()=>[],recheck:async()=>true},generator:{generate}});
    const request={question:"x",context:{type:"GENERAL" as const}};
    await expect(service.ask(p,key,request)).rejects.toMatchObject({code:"OPERATION_STATUS_UNKNOWN"});
    expect((await service.ask(p,key,request)).replayed).toBe(true); expect(generate).toHaveBeenCalledTimes(1);
  });
  it("persists Traveler/Admin thirty-day history independently of Guest and one another",async()=>{
    const traveler={kind:"USER" as const,id:randomUUID()},admin={kind:"USER" as const,id:randomUUID()},anonymous=await guest();
    for(const [p,role] of [[traveler,"TRAVELER"],[admin,"ADMIN"]] as const) {
      await db.$executeRaw(Prisma.sql`INSERT INTO "user"(id,name,email,role,"updatedAt") VALUES(${p.id},'Fixture',${`${p.id}@fixture.invalid`},${role}::"UserRole",CURRENT_TIMESTAMP)`);
    }
    for(const p of [traveler,admin]) {
      const r=await reservation(p);await store.complete(p,r,completed(r),[]);
      const expiry=(await db.$queryRaw<{days:number}[]>(Prisma.sql`SELECT EXTRACT(EPOCH FROM ("expiresAt"-CURRENT_TIMESTAMP))/86400 AS days FROM qa_conversation WHERE id=${r.conversationId}`))[0]!;
      expect(Number(expiry.days)).toBeGreaterThan(29.9);expect(Number(expiry.days)).toBeLessThanOrEqual(30);
      await expect(store.history(anonymous,r.conversationId)).rejects.toMatchObject({code:"NOT_FOUND"});
      await expect(store.history(p===traveler?admin:traveler,r.conversationId)).rejects.toMatchObject({code:"NOT_FOUND"});
    }
  });
  it("transaction rollback after result update leaves zero completed turns",async()=>{
    const p=await guest(),r=await reservation(p);
    const failingDb=new Proxy(db,{get(target,property){
      if(property==="$transaction") return (callback:(tx:Prisma.TransactionClient)=>Promise<unknown>,options:unknown)=>target.$transaction(async tx=>callback(new Proxy(tx,{get(inner,method){
        if(method==="$executeRaw") return async(query:Prisma.Sql)=>{
          if(query.sql.includes('SET "headTurnId"')) throw new Error("Injected confirmed rollback");
          return inner.$executeRaw(query);
        };
        const value=Reflect.get(inner,method);return typeof value==='function'?value.bind(inner):value;
      }})),options as {timeout:number});
      const value=Reflect.get(target,property);return typeof value==='function'?value.bind(target):value;
    }}) as Database;
    const failingStore=createQaConversationStore(failingDb);
    await expect(failingStore.complete(p,r,completed(r),[])).rejects.toThrow("Injected confirmed rollback");
    const row=(await db.$queryRaw<{state:string;response:unknown}[]>(Prisma.sql`SELECT state,response FROM qa_turn WHERE id=${r.turnId}`))[0]!;
    expect(row).toEqual({state:"PROCESSING",response:null});expect(await store.history(p,r.conversationId)).toEqual([]);
  });
  it("operator cleanup fences abandoned processing and scrubs question content",async()=>{
    const p=await guest(),r=await reservation(p);
    await db.$executeRaw(Prisma.sql`UPDATE qa_turn SET "leaseUntil"=CURRENT_TIMESTAMP-INTERVAL '25 hours' WHERE id=${r.turnId}`);
    await store.cleanup();
    const row=(await db.$queryRaw<{state:string;question:unknown;fence:number}[]>(Prisma.sql`SELECT state,question,fence FROM qa_turn WHERE id=${r.turnId}`))[0]!;
    expect(row).toEqual({state:"FAILED",question:null,fence:r.fence+1});
    await expect(store.complete(p,r,completed(r),[])).rejects.toMatchObject({code:"CONVERSATION_BUSY"});
  });
  it("injected clock enforces exact Guest and failed-content expiry boundaries",async()=>{
    const p=await guest(),base=new Date(); let now=base;
    await db.$executeRaw(Prisma.sql`UPDATE qa_guest_identity SET "expiresAt"=${base}::timestamptz+INTERVAL '60 days' WHERE id=${p.id}`);
    const clocked=createQaConversationStore(db as Database,{now:()=>now});
    const r=await clocked.reserve(p,randomUUID(),{question:"boundary question",context:{type:"GENERAL"}}) as QaReservation;
    await clocked.complete(p,r,completed(r),[]);
    now=new Date(base.getTime()+7*86400000-1);expect(await clocked.history(p,r.conversationId)).toHaveLength(1);
    now=new Date(base.getTime()+7*86400000);
    await expect(clocked.history(p,r.conversationId)).rejects.toMatchObject({code:"NOT_FOUND"});
    expect((await db.$queryRaw<{question:unknown;response:unknown;provenance:unknown}[]>(Prisma.sql`SELECT question,response,provenance FROM qa_turn WHERE id=${r.turnId}`))[0]).toEqual({question:null,response:null,provenance:null});
    now=base;
    const failed=await clocked.reserve(p,randomUUID(),{question:"failure boundary",context:{type:"GENERAL"}}) as QaReservation;
    await clocked.fail(p,failed,"AI_UNAVAILABLE");
    expect((await db.$queryRaw<{question:unknown}[]>(Prisma.sql`SELECT question FROM qa_turn WHERE id=${failed.turnId}`))[0]!.question).toBeNull();
    // Simulate pre-hardening retained content: the legacy 24h boundary is still scrubbed.
    await db.$executeRaw(Prisma.sql`UPDATE qa_turn SET question='failure boundary' WHERE id=${failed.turnId}`);
    now=new Date(base.getTime()+86400000-1);await clocked.cleanup();
    expect((await db.$queryRaw<{question:unknown}[]>(Prisma.sql`SELECT question FROM qa_turn WHERE id=${failed.turnId}`))[0]!.question).toBe("failure boundary");
    now=new Date(base.getTime()+86400000);await clocked.cleanup();
    expect((await db.$queryRaw<{question:unknown}[]>(Prisma.sql`SELECT question FROM qa_turn WHERE id=${failed.turnId}`))[0]!.question).toBeNull();
    await clocked.cleanup();
    expect((await db.$queryRaw<{question:unknown}[]>(Prisma.sql`SELECT question FROM qa_turn WHERE id=${failed.turnId}`))[0]!.question).toBeNull();
  });
  it("bounded cleanup reruns drain conversations and retain Guest dedup markers",async()=>{
    await store.cleanup();
    const p=await guest();
    for(let n=0;n<3;n++) { const r=await reservation(p);await store.complete(p,r,completed(r),[]); }
    await db.$executeRaw(Prisma.sql`UPDATE qa_conversation SET "expiresAt"=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE "principalId"=${p.id}`);
    const bounded=createQaConversationStore(db as Database,{cleanupBatchSize:1});
    for(let n=1;n<=3;n++) {
      expect(await bounded.cleanup()).toMatchObject({processed:1,hasMore:n<3,lockAcquired:true});
      expect(Number((await db.$queryRaw<{count:bigint}[]>(Prisma.sql`SELECT count(*) FROM qa_conversation WHERE "principalId"=${p.id} AND "deletedAt" IS NOT NULL`))[0]!.count)).toBe(n);
    }
    expect(await bounded.cleanup()).toMatchObject({processed:0,hasMore:false,lockAcquired:true});
    await db.$executeRaw(Prisma.sql`UPDATE qa_guest_identity SET "createdAt"=CURRENT_TIMESTAMP-INTERVAL '8 days',"expiresAt"=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE id=${p.id}`);
    await bounded.cleanup();
    expect(Number((await db.$queryRaw<{count:bigint}[]>(Prisma.sql`SELECT count(*) FROM qa_guest_identity WHERE id=${p.id}`))[0]!.count)).toBe(1);
  });
  it("expired Guest access scrubs content before authentication rejects it",async()=>{
    const p=await guest(),r=await reservation(p);await store.complete(p,r,completed(r),[]);
    await db.$executeRaw(Prisma.sql`UPDATE qa_guest_identity SET "createdAt"=CURRENT_TIMESTAMP-INTERVAL '8 days',"expiresAt"=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE id=${p.id}`);
    await expect(store.history(p,r.conversationId)).rejects.toMatchObject({code:"UNAUTHENTICATED"});
    expect((await db.$queryRaw<{state:string;question:unknown;response:unknown;provenance:unknown}[]>(Prisma.sql`SELECT state,question,response,provenance FROM qa_turn WHERE id=${r.turnId}`))[0]).toEqual({state:"TOMBSTONE",question:null,response:null,provenance:null});
  });
  it("hasMore includes remaining content from one deleted multi-turn conversation",async()=>{
    await store.cleanup();
    const p=await guest(),first=await reservation(p);await store.complete(p,first,completed(first),[]);
    let head=first;
    for(let n=0;n<2;n++) {
      head=await store.reserve(p,randomUUID(),{conversationId:first.conversationId,parentTurnId:head.turnId,question:"follow-up"}) as QaReservation;
      await store.complete(p,head,completed(head),[]);
    }
    await db.$executeRaw(Prisma.sql`UPDATE qa_conversation SET "expiresAt"=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE id=${first.conversationId}`);
    const bounded=createQaConversationStore(db as Database,{cleanupBatchSize:1});
    for(let n=1;n<=3;n++) {
      expect(await bounded.cleanup()).toMatchObject({processed:1,hasMore:n<3,lockAcquired:true});
      expect(Number((await db.$queryRaw<{count:bigint}[]>(Prisma.sql`SELECT count(*) FROM qa_turn WHERE "conversationId"=${first.conversationId} AND state='TOMBSTONE'`))[0]!.count)).toBe(n);
    }
    expect(await bounded.cleanup()).toMatchObject({processed:0,hasMore:false,lockAcquired:true});
  });
  it("delete racing completion leaves tombstone without cached answer resurrection",async()=>{
    const p=await guest(),key=randomUUID(),r=await reservation(p,key);
    const results=await Promise.allSettled([store.complete(p,r,completed(r),[]),store.delete(p,r.conversationId)]);
    expect(results[1]!.status).toBe("fulfilled");
    expect((await db.$queryRaw<{state:string;response:unknown}[]>(Prisma.sql`SELECT state,response FROM qa_turn WHERE id=${r.turnId}`))[0]).toEqual({state:"TOMBSTONE",response:null});
    await expect(store.reserve(p,key,{question:"Câu hỏi kiểm thử",context:{type:"GENERAL"}})).rejects.toMatchObject({code:"NOT_FOUND"});
  });
  it("owner-scoped delete replay is idempotent after a lost acknowledgement",async()=>{
    const p=await guest(),other=await guest(),r=await reservation(p);await store.complete(p,r,completed(r),[]);
    await store.delete(p,r.conversationId);
    await expect(Promise.all([store.delete(p,r.conversationId),store.delete(p,r.conversationId)])).resolves.toEqual([undefined,undefined]);
    await expect(store.delete(other,r.conversationId)).rejects.toMatchObject({code:"NOT_FOUND"});
    await expect(store.history(p,r.conversationId)).rejects.toMatchObject({code:"NOT_FOUND"});
    expect((await db.$queryRaw<{state:string;question:unknown;response:unknown;provenance:unknown}[]>(Prisma.sql`SELECT state,question,response,provenance FROM qa_turn WHERE id=${r.turnId}`))[0]).toEqual({state:"TOMBSTONE",question:null,response:null,provenance:null});
  });
  it("durably serializes cleanup runs and records bounded-sweep metrics/failures",async()=>{
    const previous=(await db.$queryRaw<Array<{failureCount:number}>>(Prisma.sql`SELECT "failureCount" FROM qa_cleanup_state WHERE id=1`))[0]?.failureCount??0;
    let failSelection=true;
    const failingDb=new Proxy(db,{get(target,property){
      if(property==="$transaction")return (callback:(tx:Prisma.TransactionClient)=>Promise<unknown>,options:unknown)=>target.$transaction(async tx=>callback(new Proxy(tx,{get(inner,method){
        if(method==="$queryRaw")return async(query:Prisma.Sql)=>{
          if(failSelection&&query.sql.includes("SELECT DISTINCT")){failSelection=false;throw new Error("Synthetic cleanup failure");}
          return inner.$queryRaw(query);
        };
        const value=Reflect.get(inner,method);return typeof value==="function"?value.bind(inner):value;
      }})),options as {timeout:number});
      const value=Reflect.get(target,property);return typeof value==="function"?value.bind(target):value;
    }}) as Database;
    await expect(createQaConversationStore(failingDb).cleanup()).rejects.toThrow("Synthetic cleanup failure");
    const failure=(await db.$queryRaw<Array<{failureCount:number;leaseToken:string|null}>>(Prisma.sql`SELECT "failureCount","leaseToken" FROM qa_cleanup_state WHERE id=1`))[0]!;
    expect(failure.failureCount).toBe(previous+1);expect(failure.leaseToken).toBeNull();
    await db.$executeRaw(Prisma.sql`UPDATE qa_cleanup_state SET "leaseToken"='already-running',"leaseUntil"=clock_timestamp()+INTERVAL '1 minute' WHERE id=1`);
    const busy=await store.cleanup();
    expect(busy.lockAcquired).toBe(false);expect(busy.failureCount).toBe(previous+1);
    await db.$executeRaw(Prisma.sql`UPDATE qa_cleanup_state SET "leaseToken"=NULL,"leaseUntil"=NULL WHERE id=1`);
    const success=await store.cleanup();
    expect(success.lockAcquired).toBe(true);expect(success.lastSuccessfulSweep).toBeTruthy();
    expect(success.eligibleBacklogCount).toBeGreaterThanOrEqual(0);
    expect((await db.$queryRaw<Array<{leaseToken:string|null;lastSucceededAt:Date|null}>>(Prisma.sql`SELECT "leaseToken","lastSucceededAt" FROM qa_cleanup_state WHERE id=1`))[0]).toMatchObject({leaseToken:null});
  });
});
