import { createHash, randomUUID } from "node:crypto";
import { Prisma, type Database } from "@KLTN/db";
import { AppError } from "../../server/http/app-error";
import {
  QA_ERROR_HTTP_STATUS,
  qaCompletedTurnSchema,
  qaContextSchema,
  sameQaContext,
  qaConversationTitleSchema,
  type QaContext,
  type QaCompletedTurn,
  type QaRequest,
  type QaConversationSummary,
  type QaConversationDetailMetadata,
} from "./qa-contract";
import { resolveQaContext } from "./qa-destination-context";
import type { QaEvidence, QaHistoryTurn, QaPrincipal } from "./qa-runtime-contract";
import type { QaAbuseHooks } from "./qa-abuse";
import { lockQaEvidenceEligibility } from "./qa-retrieval";
import { qaOrigin } from "./qa-diagnostics";
import { generateConversationTitle } from "./qa-conversation-title";
import { validQaSourceProjection } from "./qa-original-source-projection";

type Tx = Prisma.TransactionClient;
type Conversation = {
  id: string;
  context: QaContext;
  principalKind: string;
  principalId: string;
  headTurnId: string | null;
  activeTurnId: string | null;
  title: string | null;
  titleCustomized: boolean;
  lastActivityAt: Date;
  expiresAt: Date;
  deletedAt: Date | null;
  createdAt: Date;
};
type Turn = { id: string; conversationId: string; requestHash: string; state: string; fence: number; leaseUntil: Date; question: string | null; response: unknown; errorCode: string | null; parentTurnId: string | null };
export type QaReservation = { kind: "RESERVED"; conversationId: string; turnId: string; fence: number; history: QaHistoryTurn[]; context?: QaContext };
export type QaAdmission = QaReservation | { kind: "REPLAY"; data: QaCompletedTurn };
export type QaCleanupResult = { processed: number; hasMore: boolean; lockAcquired: boolean; lastSuccessfulSweep: string | null; eligibleBacklogCount: number; oldestOverdueItem: string | null; failureCount: number };
export interface QaConversationStore {
  reserve(principal: QaPrincipal, key: string, request: QaRequest): Promise<QaAdmission>;
  complete(principal: QaPrincipal, reservation: QaReservation, data: QaCompletedTurn, evidence: readonly QaEvidence[]): Promise<QaCompletedTurn>;
  fail(principal: QaPrincipal, reservation: QaReservation, code: string): Promise<void>;
  list?(principal: QaPrincipal, options?: { cursor?: string | null; limit?: number; search?: string }): Promise<{ items: QaConversationSummary[]; nextCursor: string | null; hasMore: boolean }>;
  get?(principal: QaPrincipal, id: string): Promise<{ conversation: QaConversationDetailMetadata; turns: QaHistoryTurn[] }>;
  rename?(principal: QaPrincipal, id: string, title: string): Promise<{ id: string; title: string }>;
  turns?(principal: QaPrincipal, id: string, options?: { cursor?: string | null; limit?: number }): Promise<{ turns: QaHistoryTurn[]; nextCursor: string | null; hasMore: boolean }>;
  history(principal: QaPrincipal, id: string): Promise<QaHistoryTurn[]>;
  delete(principal: QaPrincipal, id: string): Promise<void>;
  revokeGuest(principal: QaPrincipal): Promise<void>;
  cleanup(): Promise<QaCleanupResult>;
}
export function qaRequestHash(request: QaRequest): string {
  // Preserve the legacy GENERAL/omission hash. Omitted follow-up context is
  // resolved separately from the owned conversation; it never resets its context.
  const canonical = "conversationId" in request
    ? [request.conversationId, request.parentTurnId, request.question, request.context?.type === "DESTINATION" ? request.context : "GENERAL"]
    : [null, null, request.question, request.context.type === "DESTINATION" ? request.context : "GENERAL"];
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
    const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM "user" WHERE id=${p.id} AND role IN ('TRAVELER','ADMIN') AND status='ACTIVE' FOR SHARE`);
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

function encodeCursor(item: { lastActivityAt: Date; id: string }): string {
  return Buffer.from(JSON.stringify({ lastActivityAt: item.lastActivityAt.toISOString(), id: item.id })).toString("base64url");
}

function decodeCursor(cursor: string): { lastActivityAt: Date; id: string } | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed.lastActivityAt === "string" && typeof parsed.id === "string") {
      const d = new Date(parsed.lastActivityAt);
      if (Number.isFinite(d.getTime())) return { lastActivityAt: d, id: parsed.id };
    }
    return null;
  } catch {
    return null;
  }
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
  if (![maxPerTenMinutes,maxPerDay].every(n=>Number.isInteger(n)&&n>=1&&n<=100_000_000)) throw new Error("Invalid QA admission limits");
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
          const owned = await loadOwned(tx, p, existing.conversationId, now); // Authorization precedes replay/hash disclosure.
          await resolveQaContext(tx, owned.context, true);
          if (existing.requestHash !== hash) error("IDEMPOTENCY_KEY_REUSED");
          if (request.context && !sameQaContext(request.context, owned.context)) error("CONVERSATION_STALE");
          if (existing.state === "COMPLETED") return { kind: "REPLAY", data: qaCompletedTurnSchema.parse(existing.response) };
          if (existing.state === "FAILED") error(existing.errorCode as keyof typeof QA_ERROR_HTTP_STATUS || "INTERNAL_SERVER_ERROR");
          if (existing.state !== "PROCESSING") error("NOT_FOUND");
          if (existing.leaseUntil.getTime() > now.getTime()) error("OPERATION_STATUS_UNKNOWN");
          if (existing.fence>=maxAttempts) error("AI_UNAVAILABLE");
          await options.abuse?.admit(tx,p,existing.id,existing.fence+1,new Date(now.getTime()+leaseMs));
          // A retry of the identical attempt may acquire an expired lease. Fence rejects the old worker.
          await tx.$executeRaw(Prisma.sql`UPDATE qa_turn SET fence=fence+1, "leaseUntil"=${now}::timestamptz + ${leaseMs} * INTERVAL '1 millisecond' WHERE id=${existing.id}`);
          return { kind: "RESERVED", conversationId: existing.conversationId, turnId: existing.id, fence: existing.fence+1, history: await loadHistory(tx, existing.conversationId), context: qaContextSchema.parse(owned.context) };
        }
        const counts = (await tx.$queryRaw<{ recent: bigint; daily: bigint }[]>(Prisma.sql`SELECT count(*) FILTER (WHERE "createdAt">${now}::timestamptz-INTERVAL '10 minutes') AS recent,count(*) AS daily FROM qa_turn WHERE "principalKind"=${p.kind} AND "principalId"=${p.id} AND "createdAt">${now}::timestamptz-INTERVAL '1 day'`))[0]!;
        if (Number(counts.recent)>=maxPerTenMinutes || Number(counts.daily)>=maxPerDay) error("RATE_LIMITED");
        let conversation: Conversation;
        if ("conversationId" in request) {
          conversation = await loadOwned(tx, p, request.conversationId, now);
          if (request.context && !sameQaContext(request.context, conversation.context)) error("CONVERSATION_STALE");
          await resolveQaContext(tx, conversation.context, true);
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
          await resolveQaContext(tx, request.context, true);
          const rows = await tx.$queryRaw<Conversation[]>(Prisma.sql`INSERT INTO qa_conversation(id,"principalKind","principalId",context,"expiresAt","createdAt","lastActivityAt","title") VALUES(${id},${p.kind},${p.id},${JSON.stringify(request.context)}::jsonb,${now}::timestamptz + ${p.kind === "GUEST" ? 7 : 30} * INTERVAL '1 day',${now}::timestamptz,${now}::timestamptz,NULL) RETURNING *`);
          conversation = rows[0]!;
        }
        const turnId = randomUUID();
        await options.abuse?.admit(tx,p,turnId,1,new Date(now.getTime()+leaseMs));
        await tx.$executeRaw(Prisma.sql`INSERT INTO qa_turn(id,"conversationId","principalKind","principalId",key,"requestHash","parentTurnId",state,"leaseUntil",question,"createdAt") VALUES(${turnId},${conversation.id},${p.kind},${p.id},${key},${hash},${conversation.headTurnId},'PROCESSING',${now}::timestamptz + ${leaseMs} * INTERVAL '1 millisecond',${request.question},${now}::timestamptz)`);
        await tx.$executeRaw(Prisma.sql`UPDATE qa_conversation SET "activeTurnId"=${turnId} WHERE id=${conversation.id}`);
        return { kind: "RESERVED", conversationId: conversation.id, turnId, fence: 1, history: await loadHistory(tx, conversation.id), context: qaContextSchema.parse(conversation.context) };
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
        if (!await lockQaEvidenceEligibility(tx,evidence,options.publicSourceIds)) throw qaOrigin(new AppError("AI_INVALID_RESPONSE", "AI_INVALID_RESPONSE", 502), "PERSISTENCE_STARTED", "ELIGIBILITY");
        const parsed = qaCompletedTurnSchema.parse(data);
        if (!validQaSourceProjection(parsed,evidence)) throw qaOrigin(new AppError("AI_INVALID_RESPONSE","AI_INVALID_RESPONSE",502),"PERSISTENCE_STARTED","CITATION_PROJECTION");
        await resolveQaContext(tx, conversation.context, true);
        if (!sameQaContext(parsed.context, conversation.context)) error("CONVERSATION_STALE");
        if (parsed.conversationId !== r.conversationId || parsed.turnId !== r.turnId) throw qaOrigin(new AppError("AI_INVALID_RESPONSE", "AI_INVALID_RESPONSE", 502), "PERSISTENCE_STARTED", "IDENTITY_MISMATCH");
        const provenance = evidence.map(({ documentId,generationId,contentVersionId,chunkId,chunkHash,citationId,sourceBundle,projectedCitations })=>({documentId,generationId,contentVersionId,chunkId,chunkHash,citationId, ...(sourceBundle ? {sourceBundle,publicCitationIds:projectedCitations?.map(c=>c.id) ?? []} : {})}));
        await tx.$executeRaw(Prisma.sql`UPDATE qa_turn SET state='COMPLETED', response=${JSON.stringify(parsed)}::jsonb, provenance=${JSON.stringify(provenance)}::jsonb, "completedAt"=${now}::timestamptz WHERE id=${r.turnId}`);
        const generatedTitle = generateConversationTitle(turn.question ?? "Cuộc hội thoại mới");
        await tx.$executeRaw(Prisma.sql`UPDATE qa_conversation SET "headTurnId"=${r.turnId}, "activeTurnId"=NULL, "lastActivityAt"=${now}::timestamptz, "title"=COALESCE("title", ${generatedTitle}), "expiresAt"=${now}::timestamptz + ${p.kind === "GUEST" ? 7 : 30} * INTERVAL '1 day' WHERE id=${r.conversationId}`);
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
    async list(p, options = {}) {
      await cleanupAccess(p);
      const limit = Math.max(1, Math.min(50, options.limit ?? 20));
      const search = options.search ? options.search.normalize("NFC").trim() : undefined;
      const decoded = options.cursor ? decodeCursor(options.cursor) : null;
      return transaction(async (tx) => {
        const now = await lockPrincipal(tx, p, currentTime);
        await cleanPrincipal(tx, p, now, batchSize);

        const conditions = [
          Prisma.sql`"principalKind" = ${p.kind}`,
          Prisma.sql`"principalId" = ${p.id}`,
          Prisma.sql`"deletedAt" IS NULL`,
          Prisma.sql`"expiresAt" > ${now}::timestamptz`,
        ];
        if (search) {
          conditions.push(Prisma.sql`"title" ILIKE ${"%" + search + "%"}`);
        }
        if (decoded) {
          conditions.push(Prisma.sql`("lastActivityAt" < ${decoded.lastActivityAt}::timestamptz OR ("lastActivityAt" = ${decoded.lastActivityAt}::timestamptz AND id < ${decoded.id}))`);
        }
        const whereClause = Prisma.join(conditions, " AND ");
        const rows = await tx.$queryRaw<Array<{ id: string; context: unknown; title: string | null; createdAt: Date; lastActivityAt: Date }>>(
          Prisma.sql`SELECT id, context, title, "createdAt", "lastActivityAt" FROM qa_conversation WHERE ${whereClause} ORDER BY "lastActivityAt" DESC, id DESC LIMIT ${limit + 1}`
        );
        const hasMore = rows.length > limit;
        const items = (hasMore ? rows.slice(0, limit) : rows).map(row => ({
          id: row.id,
          title: row.title ?? "Cuộc hội thoại mới",
          context: qaContextSchema.parse(row.context),
          createdAt: row.createdAt.toISOString(),
          lastActivityAt: row.lastActivityAt.toISOString(),
        }));
        const nextCursor = hasMore && items.length > 0
          ? encodeCursor({ lastActivityAt: new Date(items[items.length - 1]!.lastActivityAt), id: items[items.length - 1]!.id })
          : null;
        return { items, nextCursor, hasMore };
      });
    },
    async get(p, id) {
      await cleanupAccess(p);
      return transaction(async (tx) => {
        const now = await lockPrincipal(tx, p, currentTime);
        const owned = await loadOwned(tx, p, id, now);
        await resolveQaContext(tx, owned.context, true);
        const turnRows = await tx.$queryRaw<Turn[]>(Prisma.sql`
          SELECT * FROM qa_turn
          WHERE "conversationId" = ${id}
            AND "principalKind" = ${p.kind}
            AND "principalId" = ${p.id}
            AND state = 'COMPLETED'
          ORDER BY "createdAt" ASC
        `);
        const turns = turnRows.map(row => ({
          question: row.question!,
          response: qaCompletedTurnSchema.parse(row.response),
        }));
        const conversation: QaConversationDetailMetadata = {
          id: owned.id,
          title: owned.title ?? (turns.length ? generateConversationTitle(turns[0]!.question) : "Cuộc hội thoại mới"),
          context: qaContextSchema.parse(owned.context),
          headTurnId: owned.headTurnId,
          createdAt: owned.createdAt.toISOString(),
          lastActivityAt: owned.lastActivityAt.toISOString(),
        };
        return { conversation, turns };
      });
    },
    async rename(p, id, title) {
      const validated = qaConversationTitleSchema.parse(title);
      await cleanupAccess(p);
      return transaction(async (tx) => {
        const now = await lockPrincipal(tx, p, currentTime);
        await loadOwned(tx, p, id, now);
        await tx.$executeRaw(Prisma.sql`
          UPDATE qa_conversation
          SET "title" = ${validated}, "titleCustomized" = true
          WHERE id = ${id} AND "principalKind" = ${p.kind} AND "principalId" = ${p.id}
        `);
        return { id, title: validated };
      });
    },
    async turns(p, id, options = {}) {
      await cleanupAccess(p);
      const limit = Math.max(1, Math.min(50, options.limit ?? 20));
      return transaction(async (tx) => {
        const now = await lockPrincipal(tx, p, currentTime);
        const owned = await loadOwned(tx, p, id, now);
        await resolveQaContext(tx, owned.context, true);
        const rows = await tx.$queryRaw<Turn[]>(Prisma.sql`
          SELECT * FROM qa_turn
          WHERE "conversationId" = ${id}
            AND "principalKind" = ${p.kind}
            AND "principalId" = ${p.id}
            AND state = 'COMPLETED'
          ORDER BY "createdAt" ASC
          LIMIT ${limit + 1}
        `);
        const hasMore = rows.length > limit;
        const items = (hasMore ? rows.slice(0, limit) : rows).map(row => ({
          question: row.question!,
          response: qaCompletedTurnSchema.parse(row.response),
        }));
        return { turns: items, nextCursor: null, hasMore };
      });
    },
    async history(p, id) {
      const detail = await this.get!(p, id);
      return detail.turns;
    },
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
