import { createHash, randomUUID } from "node:crypto";
import { Prisma, type Database } from "@KLTN/db";
import { AppError } from "../../server/http/app-error";
import { QA_ERROR_HTTP_STATUS, qaCompletedTurnSchema, type QaCompletedTurn, type QaRequest } from "./qa-contract";
import type { QaEvidence, QaHistoryTurn, QaPrincipal } from "./qa-runtime-contract";
import type { QaAbuseHooks } from "./qa-abuse";
import { lockQaEvidenceEligibility } from "./qa-retrieval";

type Tx = Prisma.TransactionClient;
type Conversation = { id: string; principalKind: string; principalId: string; headTurnId: string | null; activeTurnId: string | null; expiresAt: Date; deletedAt: Date | null };
type Turn = { id: string; conversationId: string; requestHash: string; state: string; fence: number; leaseUntil: Date; question: string | null; response: unknown; errorCode: string | null; parentTurnId: string | null };
export type QaReservation = { kind: "RESERVED"; conversationId: string; turnId: string; fence: number; history: QaHistoryTurn[] };
export type QaAdmission = QaReservation | { kind: "REPLAY"; data: QaCompletedTurn };
export type QaCleanupResult = { processed: number; hasMore: boolean; lockAcquired: boolean; lastSuccessfulSweep: string | null; eligibleBacklogCount: number; oldestOverdueItem: string | null; failureCount: number };
export interface QaConversationStore {
  reserve(principal: QaPrincipal, key: string, request: QaRequest): Promise<QaAdmission>;
  complete(principal: QaPrincipal, reservation: QaReservation, data: QaCompletedTurn, evidence: readonly QaEvidence[]): Promise<QaCompletedTurn>;
  fail(principal: QaPrincipal, reservation: QaReservation, code: string): Promise<void>;
  history(principal: QaPrincipal, id: string): Promise<QaHistoryTurn[]>;
  delete(principal: QaPrincipal, id: string): Promise<void>;
  revokeGuest(principal: QaPrincipal): Promise<void>;
  cleanup(): Promise<QaCleanupResult>;
}
export function qaRequestHash(request: QaRequest): string {
  // The validated request has fixed keys; missing follow-up context inherits GENERAL.
  const canonical = "conversationId" in request
    ? [request.conversationId, request.parentTurnId, request.question, "GENERAL"]
    : [null, null, request.question, "GENERAL"];
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
function error(code: keyof typeof QA_ERROR_HTTP_STATUS): never {
  throw new AppError(code, code, QA_ERROR_HTTP_STATUS[code]);
}
async function lockPrincipal(tx: Tx, p: QaPrincipal, clock: (tx: Tx) => Promise<Date>) {
  await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify(["qa", p.kind, p.id])}, 0))::text AS locked`);
  // Transaction timestamps are fixed at BEGIN. Sample only after acquiring the
  // principal lock so time spent waiting cannot make an expired conversation live.
  const now = await clock(tx);
  if (p.kind === "USER") {
    const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM "user" WHERE id=${p.id} AND role IN ('TRAVELER','ADMIN') FOR SHARE`);
    if (!rows.length) error("UNAUTHENTICATED");
  } else {
    const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM qa_guest_identity WHERE id=${p.id} AND "expiresAt">${now}::timestamptz AND "revokedAt" IS NULL FOR SHARE`);
    if (!rows.length) error("UNAUTHENTICATED");
  }
  return now;
}
async function lockPrincipalKey(tx: Tx, p: QaPrincipal) {
  await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify(["qa", p.kind, p.id])}, 0))::text AS locked`);
}
async function tombstone(tx: Tx, id: string, now: Date, scrub = true) {
  await tx.$executeRaw(Prisma.sql`UPDATE qa_conversation SET "deletedAt"=COALESCE("deletedAt",${now}::timestamptz), "activeTurnId"=NULL, "headTurnId"=NULL WHERE id=${id}`);
  if (scrub) await tx.$executeRaw(Prisma.sql`UPDATE qa_turn SET state='TOMBSTONE', question=NULL, response=NULL, provenance=NULL, "errorCode"=NULL, "contentExpiresAt"=NULL, fence=fence+1 WHERE "conversationId"=${id} AND state<>'TOMBSTONE'`);
}
async function loadOwned(tx: Tx, p: QaPrincipal, id: string, now: Date): Promise<Conversation> {
  const rows = await tx.$queryRaw<Conversation[]>(Prisma.sql`SELECT * FROM qa_conversation WHERE id=${id} AND "principalKind"=${p.kind} AND "principalId"=${p.id} FOR UPDATE`);
  const row = rows[0];
  if (!row || row.deletedAt || row.expiresAt.getTime() <= now.getTime()) error("NOT_FOUND");
  return row;
}
async function loadHistory(tx: Tx, id: string): Promise<QaHistoryTurn[]> {
  // Follow the completed parent chain instead of timestamps, whose millisecond
  // precision does not guarantee ordering of rapidly committed adjacent turns.
  const rows = await tx.$queryRaw<Turn[]>(Prisma.sql`WITH RECURSIVE history AS (
    SELECT t.*,0 AS depth FROM qa_turn t JOIN qa_conversation c ON c."headTurnId"=t.id WHERE c.id=${id} AND t.state='COMPLETED'
    UNION ALL SELECT t.*,h.depth+1 AS depth FROM qa_turn t JOIN history h ON h."parentTurnId"=t.id WHERE t."conversationId"=${id} AND t.state='COMPLETED' AND h.depth<11
  ) SELECT * FROM history ORDER BY depth DESC`);
  return rows.map(row => ({ question: row.question!, response: qaCompletedTurnSchema.parse(row.response) }));
}
async function cleanPrincipal(tx: Tx, p: QaPrincipal, now: Date, batchSize = 100) {
  const expired = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM qa_conversation WHERE "principalKind"=${p.kind} AND "principalId"=${p.id} AND "deletedAt" IS NULL AND ("expiresAt"<=${now}::timestamptz OR ("principalKind"='GUEST' AND "principalId" IN (SELECT id FROM qa_guest_identity WHERE "expiresAt"<=${now}::timestamptz OR "revokedAt" IS NOT NULL))) ORDER BY "expiresAt",id LIMIT ${batchSize} FOR UPDATE`);
  for (const row of expired) await tombstone(tx, row.id, now, false);
  // Hide/fence the conversation first; scrub its content in a bounded batch.
  // Completion/replay checks deletedAt under the same principal lock.
  await tx.$executeRaw(Prisma.sql`UPDATE qa_turn SET state='TOMBSTONE', question=NULL, response=NULL, provenance=NULL, "errorCode"=NULL, "contentExpiresAt"=NULL, fence=fence+1
    WHERE id IN (SELECT t.id FROM qa_turn t JOIN qa_conversation c ON c.id=t."conversationId"
      WHERE t."principalKind"=${p.kind} AND t."principalId"=${p.id} AND c."deletedAt" IS NOT NULL AND t.state<>'TOMBSTONE'
      ORDER BY t."createdAt",t.id LIMIT ${batchSize} FOR UPDATE OF t)`);
  // An abandoned provider request is terminal after at most 24 hours of its lease
  // expiring. It cannot keep failed question content indefinitely.
  const abandoned=await tx.$queryRaw<{conversationId:string;id:string}[]>(Prisma.sql`UPDATE qa_turn SET state='FAILED', "errorCode"='AI_UNAVAILABLE', fence=fence+1, question=NULL, provenance=NULL WHERE id IN (SELECT id FROM qa_turn WHERE "principalKind"=${p.kind} AND "principalId"=${p.id} AND state='PROCESSING' AND "leaseUntil"<=${now}::timestamptz-INTERVAL '24 hours' ORDER BY "leaseUntil",id LIMIT ${batchSize} FOR UPDATE) RETURNING id,"conversationId"`);
  for(const turn of abandoned) await tx.$executeRaw(Prisma.sql`UPDATE qa_conversation SET "activeTurnId"=NULL WHERE id=${turn.conversationId} AND "activeTurnId"=${turn.id}`);
  await tx.$executeRaw(Prisma.sql`UPDATE qa_turn SET question=NULL, response=NULL, provenance=NULL, "contentExpiresAt"=NULL WHERE id IN (SELECT id FROM qa_turn WHERE "principalKind"=${p.kind} AND "principalId"=${p.id} AND state='FAILED' AND "contentExpiresAt"<=${now}::timestamptz ORDER BY "contentExpiresAt",id LIMIT ${batchSize} FOR UPDATE)`);
}

export function createQaConversationStore(db: Database, options: { leaseMs?: number; maxPerTenMinutes?: number; maxPerDay?: number; maxAttempts?: number; cleanupBatchSize?: number; cleanupMaxDurationMs?: number; now?: () => Date; abuse?: QaAbuseHooks; publicSourceIds?: ReadonlySet<string> } = {}): QaConversationStore {
  const cleanupMaxDurationMs = options.cleanupMaxDurationMs ?? 30_000;
  if (!Number.isInteger(cleanupMaxDurationMs) || cleanupMaxDurationMs < 100 || cleanupMaxDurationMs > 40_000) throw new Error("Invalid QA cleanup duration budget");
  const batchSize = options.cleanupBatchSize ?? 100;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) throw new Error("Invalid QA cleanup batch size");
  const leaseMs = options.leaseMs ?? 90_000;
  if (!Number.isInteger(leaseMs) || leaseMs < 10_000 || leaseMs > 300_000) throw new Error("Invalid QA lease duration");
  const maxPerTenMinutes = options.maxPerTenMinutes ?? 10;
  const maxPerDay = options.maxPerDay ?? 100;
  const maxAttempts=options.maxAttempts ?? 3;
  if(!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>5) throw new Error("Invalid QA recovery attempt limit");
  if (![maxPerTenMinutes,maxPerDay].every(n=>Number.isInteger(n)&&n>=1&&n<=1000)) throw new Error("Invalid QA admission limits");
  const transaction = <T>(work: (tx: Tx, now: Date) => Promise<T>) => db.$transaction(async tx => {
    const now = options.now?.() ?? (await tx.$queryRaw<{ now: Date }[]>(Prisma.sql`SELECT clock_timestamp() AS now`))[0]!.now;
    if (!Number.isFinite(now.getTime())) throw new Error("Invalid QA clock");
    return work(tx, now);
  }, { timeout: 10_000 });
  const currentTime = async (tx: Tx) => {
    const now = options.now?.() ?? (await tx.$queryRaw<{ now: Date }[]>(Prisma.sql`SELECT clock_timestamp() AS now`))[0]!.now;
    if (!Number.isFinite(now.getTime())) throw new Error("Invalid QA clock");
    return now;
  };
  // Commit access cleanup independently: a subsequent NOT_FOUND must not roll
  // back the expired content scrubbing. It never refreshes retention.
  const cleanupAccess = async (p: QaPrincipal) => {
    try { await transaction(async (tx)=>{ await lockPrincipalKey(tx,p); const now=await currentTime(tx);
      await cleanPrincipal(tx,p,now,batchSize); }); }
    catch(e) { if(e instanceof AppError) throw e; throw new AppError("INTERNAL_SERVER_ERROR","INTERNAL_SERVER_ERROR",500); }
  };
  return {
    async reserve(p, key, request) {
      const hash = qaRequestHash(request);
      await cleanupAccess(p);
      return transaction(async (tx) => {
        const now=await lockPrincipal(tx,p,currentTime);
        await cleanPrincipal(tx, p, now, batchSize);
        const existing = (await tx.$queryRaw<Turn[]>(Prisma.sql`SELECT * FROM qa_turn WHERE "principalKind"=${p.kind} AND "principalId"=${p.id} AND key=${key} FOR UPDATE`))[0];
        if (existing) {
          await loadOwned(tx, p, existing.conversationId, now); // Authorization precedes replay/hash disclosure.
          if (existing.requestHash !== hash) error("IDEMPOTENCY_KEY_REUSED");
          if (existing.state === "COMPLETED") return { kind: "REPLAY", data: qaCompletedTurnSchema.parse(existing.response) };
          if (existing.state === "FAILED") error(existing.errorCode as keyof typeof QA_ERROR_HTTP_STATUS || "INTERNAL_SERVER_ERROR");
          if (existing.state !== "PROCESSING") error("NOT_FOUND");
          if (existing.leaseUntil.getTime() > now.getTime()) error("OPERATION_STATUS_UNKNOWN");
          if (existing.fence>=maxAttempts) error("AI_UNAVAILABLE");
          await options.abuse?.admit(tx,p,existing.id,existing.fence+1,new Date(now.getTime()+leaseMs));
          // A retry of the identical attempt may acquire an expired lease. Fence rejects the old worker.
          await tx.$executeRaw(Prisma.sql`UPDATE qa_turn SET fence=fence+1, "leaseUntil"=${now}::timestamptz + ${leaseMs} * INTERVAL '1 millisecond' WHERE id=${existing.id}`);
          return { kind: "RESERVED", conversationId: existing.conversationId, turnId: existing.id, fence: existing.fence+1, history: await loadHistory(tx, existing.conversationId) };
        }
        const counts = (await tx.$queryRaw<{ recent: bigint; daily: bigint }[]>(Prisma.sql`SELECT count(*) FILTER (WHERE "createdAt">${now}::timestamptz-INTERVAL '10 minutes') AS recent,count(*) AS daily FROM qa_turn WHERE "principalKind"=${p.kind} AND "principalId"=${p.id} AND "createdAt">${now}::timestamptz-INTERVAL '1 day'`))[0]!;
        if (Number(counts.recent)>=maxPerTenMinutes || Number(counts.daily)>=maxPerDay) error("RATE_LIMITED");
        let conversation: Conversation;
        if ("conversationId" in request) {
          conversation = await loadOwned(tx, p, request.conversationId, now);
          if (conversation.activeTurnId) {
            const active = (await tx.$queryRaw<Turn[]>(Prisma.sql`SELECT * FROM qa_turn WHERE id=${conversation.activeTurnId} FOR UPDATE`))[0];
            if (active && active.leaseUntil.getTime() <= now.getTime()) {
              // Distinct request never silently retries an abandoned provider attempt.
              await tx.$executeRaw(Prisma.sql`UPDATE qa_turn SET state='FAILED', "errorCode"='AI_UNAVAILABLE', fence=fence+1, question=NULL, response=NULL, provenance=NULL, "contentExpiresAt"=LEAST(${now}::timestamptz+INTERVAL '24 hours',${conversation.expiresAt}) WHERE id=${active.id} AND state='PROCESSING'`);
              await tx.$executeRaw(Prisma.sql`UPDATE qa_conversation SET "activeTurnId"=NULL WHERE id=${conversation.id}`);
            } else error("CONVERSATION_BUSY");
          }
          if (conversation.headTurnId !== request.parentTurnId) error("CONVERSATION_STALE");
        } else {
          const id = randomUUID();
          const rows = await tx.$queryRaw<Conversation[]>(Prisma.sql`INSERT INTO qa_conversation(id,"principalKind","principalId","expiresAt","createdAt") VALUES(${id},${p.kind},${p.id},${now}::timestamptz + ${p.kind === "GUEST" ? 7 : 30} * INTERVAL '1 day',${now}::timestamptz) RETURNING *`);
          conversation = rows[0]!;
        }
        const turnId = randomUUID();
        await options.abuse?.admit(tx,p,turnId,1,new Date(now.getTime()+leaseMs));
        await tx.$executeRaw(Prisma.sql`INSERT INTO qa_turn(id,"conversationId","principalKind","principalId",key,"requestHash","parentTurnId",state,"leaseUntil",question,"createdAt") VALUES(${turnId},${conversation.id},${p.kind},${p.id},${key},${hash},${conversation.headTurnId},'PROCESSING',${now}::timestamptz + ${leaseMs} * INTERVAL '1 millisecond',${request.question},${now}::timestamptz)`);
        await tx.$executeRaw(Prisma.sql`UPDATE qa_conversation SET "activeTurnId"=${turnId} WHERE id=${conversation.id}`);
        return { kind: "RESERVED", conversationId: conversation.id, turnId, fence: 1, history: await loadHistory(tx, conversation.id) };
      });
    },
    async complete(p, r, data, evidence) {
      return transaction(async (tx) => {
        const now=await lockPrincipal(tx,p,currentTime);
        const conversation = await loadOwned(tx, p, r.conversationId, now);
        const turn = (await tx.$queryRaw<Turn[]>(Prisma.sql`SELECT * FROM qa_turn WHERE id=${r.turnId} AND "conversationId"=${r.conversationId} FOR UPDATE`))[0];
        if (!turn || turn.fence !== r.fence || turn.state !== "PROCESSING" || conversation.activeTurnId !== r.turnId || turn.leaseUntil.getTime() <= now.getTime()) error("CONVERSATION_BUSY");
        // Disable and index publication use the same document row lock. This eligibility
        // check and the completed write are one linearization point, not a preflight.
        if (!await lockQaEvidenceEligibility(tx,evidence,options.publicSourceIds ?? new Set())) error("AI_INVALID_RESPONSE");
        const parsed = qaCompletedTurnSchema.parse(data);
        if (parsed.conversationId !== r.conversationId || parsed.turnId !== r.turnId) error("AI_INVALID_RESPONSE");
        const provenance = evidence.map(({ documentId,generationId,contentVersionId,chunkId,chunkHash,citationId })=>({documentId,generationId,contentVersionId,chunkId,chunkHash,citationId}));
        await tx.$executeRaw(Prisma.sql`UPDATE qa_turn SET state='COMPLETED', response=${JSON.stringify(parsed)}::jsonb, provenance=${JSON.stringify(provenance)}::jsonb, "completedAt"=${now}::timestamptz WHERE id=${r.turnId}`);
        await tx.$executeRaw(Prisma.sql`UPDATE qa_conversation SET "headTurnId"=${r.turnId}, "activeTurnId"=NULL, "expiresAt"=${now}::timestamptz + ${p.kind === "GUEST" ? 7 : 30} * INTERVAL '1 day' WHERE id=${r.conversationId}`);
        await options.abuse?.release(tx,r.turnId,r.fence);
        return parsed;
      });
    },
    async fail(p,r,code) {
      await transaction(async (tx) => {
        const now=await lockPrincipal(tx,p,currentTime);
        const c = await loadOwned(tx,p,r.conversationId,now);
        const changed = await tx.$executeRaw(Prisma.sql`UPDATE qa_turn SET state='FAILED', "errorCode"=${code}, question=NULL, response=NULL, provenance=NULL, "contentExpiresAt"=LEAST(${now}::timestamptz+INTERVAL '24 hours',${c.expiresAt}) WHERE id=${r.turnId} AND "conversationId"=${r.conversationId} AND state='PROCESSING' AND fence=${r.fence}`);
        if (changed) await options.abuse?.release(tx,r.turnId,r.fence);
        if (changed) await tx.$executeRaw(Prisma.sql`UPDATE qa_conversation SET "activeTurnId"=NULL WHERE id=${r.conversationId} AND "activeTurnId"=${r.turnId}`);
      });
    },
    async history(p,id) { await cleanupAccess(p); return transaction(async (tx)=>{ const now=await lockPrincipal(tx,p,currentTime); await loadOwned(tx,p,id,now); return loadHistory(tx,id); }); },
    async delete(p,id) {
      await cleanupAccess(p);
      await transaction(async (tx)=>{
        const now=await lockPrincipal(tx,p,currentTime);
        const rows=await tx.$queryRaw<Conversation[]>(Prisma.sql`SELECT * FROM qa_conversation WHERE id=${id} AND "principalKind"=${p.kind} AND "principalId"=${p.id} FOR UPDATE`);
        const conversation=rows[0];
        if(!conversation) error("NOT_FOUND");
        if(conversation.deletedAt) return; // Stable owner-scoped delete replay after a lost response.
        if(conversation.expiresAt.getTime()<=now.getTime()) { await tombstone(tx,id,now); return; }
        await tombstone(tx,id,now);
      });
    },
    async revokeGuest(p) {
      if (p.kind !== "GUEST") error("FORBIDDEN");
      await transaction(async (tx)=>{
        await lockPrincipalKey(tx,p);
        const lockedNow=await currentTime(tx);
        const identity=await tx.$queryRaw<{id:string;revokedAt:Date|null}[]>(Prisma.sql`SELECT id,"revokedAt" FROM qa_guest_identity WHERE id=${p.id} FOR UPDATE`);
        if(!identity.length) error("UNAUTHENTICATED");
        await tx.$executeRaw(Prisma.sql`UPDATE qa_guest_identity SET "revokedAt"=COALESCE("revokedAt",${lockedNow}::timestamptz) WHERE id=${p.id}`);
        const rows=await tx.$queryRaw<{id:string}[]>(Prisma.sql`SELECT id FROM qa_conversation WHERE "principalKind"='GUEST' AND "principalId"=${p.id} FOR UPDATE`);
        for(const row of rows) await tombstone(tx,row.id,lockedNow);
      });
    },
    async cleanup() {
      // A durable lease serializes all scheduler/manual invocations across
      // instances. A crashed run becomes eligible after its bounded lease.
      const leaseToken=randomUUID();
      const initial=await transaction(async tx=>{
        await tx.$executeRaw(Prisma.sql`INSERT INTO qa_cleanup_state(id) VALUES(1) ON CONFLICT(id) DO NOTHING`);
        const rows=await tx.$queryRaw<Array<{leaseToken:string|null;leaseUntil:Date|null;lastSucceededAt:Date|null;eligibleBacklogCount:bigint;oldestOverdueAt:Date|null;failureCount:number}>>(Prisma.sql`
          UPDATE qa_cleanup_state SET "leaseToken"=${leaseToken},"leaseUntil"=clock_timestamp()+INTERVAL '90 seconds',
            "lastStartedAt"=clock_timestamp(),"updatedAt"=clock_timestamp()
          WHERE id=1 AND ("leaseUntil" IS NULL OR "leaseUntil"<=clock_timestamp())
          RETURNING "leaseToken","leaseUntil","lastSucceededAt","eligibleBacklogCount","oldestOverdueAt","failureCount"`);
        if(rows.length)return {acquired:true,state:rows[0]!};
        const state=await tx.$queryRaw<Array<{leaseToken:string|null;leaseUntil:Date|null;lastSucceededAt:Date|null;eligibleBacklogCount:bigint;oldestOverdueAt:Date|null;failureCount:number}>>(Prisma.sql`
          SELECT "leaseToken","leaseUntil","lastSucceededAt","eligibleBacklogCount","oldestOverdueAt","failureCount" FROM qa_cleanup_state WHERE id=1`);
        return {acquired:false,state:state[0]!};
      });
      const stateResult=(processed:number,lockAcquired:boolean,state:typeof initial.state):QaCleanupResult=>({
        processed,hasMore:Number(state.eligibleBacklogCount)>0,lockAcquired,
        lastSuccessfulSweep:state.lastSucceededAt?.toISOString()??null,
        eligibleBacklogCount:Number(state.eligibleBacklogCount),
        oldestOverdueItem:state.oldestOverdueAt?.toISOString()??null,
        failureCount:state.failureCount,
      });
      if(!initial.acquired)return stateResult(0,false,initial.state);

      try {
        // Keep identity and turn tombstones: deleting them races bootstrap/replay.
        const started = Date.now();
        const principals = await transaction(async (tx, now) => tx.$queryRaw<QaPrincipal[]>(Prisma.sql`
          SELECT DISTINCT "principalKind" AS kind,"principalId" AS id FROM qa_conversation
          WHERE "deletedAt" IS NULL AND ("expiresAt"<=${now}::timestamptz OR ("principalKind"='GUEST' AND "principalId" IN
            (SELECT id FROM qa_guest_identity WHERE "expiresAt"<=${now}::timestamptz OR "revokedAt" IS NOT NULL)))
          UNION SELECT DISTINCT "principalKind" AS kind,"principalId" AS id FROM qa_turn
          WHERE (state='FAILED' AND "contentExpiresAt"<=${now}::timestamptz) OR (state='PROCESSING' AND "leaseUntil"<=${now}::timestamptz-INTERVAL '24 hours')
            OR (state<>'TOMBSTONE' AND "conversationId" IN (SELECT id FROM qa_conversation WHERE "deletedAt" IS NOT NULL))
          ORDER BY kind,id LIMIT ${batchSize+1}`));
        let processed = 0;
        for (const p of principals.slice(0,batchSize)) {
          if (Date.now()-started >= cleanupMaxDurationMs) break;
          await transaction(async (tx) => {
            await lockPrincipalKey(tx,p);
            const now=await currentTime(tx);
            await cleanPrincipal(tx,p,now,batchSize);
          });
          processed++;
        }
        const finished=await transaction(async tx=>{
          const backlog=await tx.$queryRaw<Array<{count:bigint;oldest:Date|null}>>(Prisma.sql`
            WITH overdue AS (
              SELECT CASE WHEN c."principalKind"='GUEST' AND (g."revokedAt" IS NOT NULL OR g."expiresAt"<=clock_timestamp())
                THEN LEAST(c."expiresAt",COALESCE(g."expiresAt",c."expiresAt"),COALESCE(g."revokedAt",c."expiresAt"))
                ELSE c."expiresAt" END AS at
              FROM qa_conversation c LEFT JOIN qa_guest_identity g ON g.id=c."principalId"
              WHERE c."deletedAt" IS NULL AND (c."expiresAt"<=clock_timestamp() OR (c."principalKind"='GUEST' AND (g."expiresAt"<=clock_timestamp() OR g."revokedAt" IS NOT NULL)))
              UNION ALL
              SELECT CASE WHEN c."deletedAt" IS NOT NULL THEN c."deletedAt"
                WHEN t.state='FAILED' THEN t."contentExpiresAt"
                ELSE t."leaseUntil"+INTERVAL '24 hours' END AS at
              FROM qa_turn t JOIN qa_conversation c ON c.id=t."conversationId"
              WHERE (t.state='FAILED' AND t."contentExpiresAt"<=clock_timestamp())
                OR (t.state='PROCESSING' AND t."leaseUntil"<=clock_timestamp()-INTERVAL '24 hours')
                OR (t.state<>'TOMBSTONE' AND c."deletedAt" IS NOT NULL)
            ) SELECT count(*)::bigint AS count,min(at) AS oldest FROM overdue`);
          const row=backlog[0]!;
          const state=await tx.$queryRaw<Array<{leaseToken:string|null;leaseUntil:Date|null;lastSucceededAt:Date|null;eligibleBacklogCount:bigint;oldestOverdueAt:Date|null;failureCount:number}>>(Prisma.sql`
            UPDATE qa_cleanup_state SET "leaseToken"=NULL,"leaseUntil"=NULL,"lastSucceededAt"=clock_timestamp(),
              "eligibleBacklogCount"=${row.count},"oldestOverdueAt"=${row.oldest},"updatedAt"=clock_timestamp()
            WHERE id=1 AND "leaseToken"=${leaseToken} RETURNING "leaseToken","leaseUntil","lastSucceededAt","eligibleBacklogCount","oldestOverdueAt","failureCount"`);
          if(!state.length)throw new Error("QA cleanup lease was lost before finalization");
          return state[0]!;
        });
        return stateResult(processed,true,finished);
      } catch(error) {
        try { await transaction(async tx=>{await tx.$executeRaw(Prisma.sql`UPDATE qa_cleanup_state SET "leaseToken"=NULL,"leaseUntil"=NULL,"lastFailedAt"=clock_timestamp(),"failureCount"="failureCount"+1,"updatedAt"=clock_timestamp() WHERE id=1 AND "leaseToken"=${leaseToken}`);}); } catch { /* The next authenticated sweep reports stale state if storage is unavailable. */ }
        throw error;
      }
    },
  };
}
