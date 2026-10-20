import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { Prisma, type Database } from "@KLTN/db";
import { AppError } from "../../server/http/app-error";
import type { QaPrincipal } from "./qa-runtime-contract";

type Tx = Prisma.TransactionClient;
export interface QaAbuseHooks {
  admit(tx: Tx, principal: QaPrincipal, turnId: string, fence: number, leaseUntil: Date): Promise<void>;
  release(tx: Tx, turnId: string, fence: number): Promise<void>;
}
// The owner requested very high practical request ceilings for QA. Durable
// request counters and concurrency leases remain in place; token reservations
// are not used as an admission limit.
export const QA_ABUSE_LIMITS = {
  bootstrapNetworkHour: 100_000_000, bootstrapGlobalDay: 100_000_000,
  askNetworkTenMinutes: 100_000_000, askNetworkDay: 100_000_000, askGlobalDay: 100_000_000,
  concurrentGlobal: 100_000_000, concurrentNetwork: 100_000_000, concurrentPrincipal: 100_000_000,
} as const;
export type QaAbuseLimits = { [K in keyof typeof QA_ABUSE_LIMITS]: number };
const unavailable = () => new AppError("AI_UNAVAILABLE", "AI_UNAVAILABLE", 503);
const limited = () => new AppError("RATE_LIMITED", "RATE_LIMITED", 429);

export function createQaNetworkResolver(options: { secret: () => string | undefined; vercel: () => boolean; localIdentity?: () => string | undefined }) {
  return (headers: Headers): string => {
    const secret = options.secret();
    const vercel = options.vercel();
    if (!secret || secret.length < 32) throw unavailable();
    // Vercel overwrites x-vercel-forwarded-for at its trusted ingress. Do not
    // trust generic x-forwarded-for or any request header on local/self hosting.
    const identity = vercel ? headers.get("x-vercel-forwarded-for") : options.localIdentity?.();
    if (!identity || (vercel && !isIP(identity)) || identity.length > 128) throw unavailable();
    let canonical = identity;
    if (vercel && isIP(identity) === 6) {
      const normalized = new URL(`http://[${identity}]/`).hostname.slice(1,-1);
      const [left, right] = normalized.split("::");
      const head = left ? left.split(":") : [];
      const tail = right ? right.split(":") : [];
      const full = right === undefined ? head : [...head,...Array(8-head.length-tail.length).fill("0"),...tail];
      // IPv6 privacy addresses within one /64 share a budget; canonical spelling
      // cannot create multiple quotas. IPv4 uses the ingress address itself.
      canonical = `${full.slice(0,4).map(part => part.padStart(4,"0")).join(":")}/64`;
    }
    return createHmac("sha256", secret).update(`qa-network-v1:${canonical}`).digest("hex");
  };
}

export function createQaAbuseGuard(db: Database, overrides: Partial<QaAbuseLimits> = {}) {
  const limits = { ...QA_ABUSE_LIMITS, ...overrides };
  if (Object.values(limits).some(n => !Number.isSafeInteger(n) || n < 1 || n > 100_000_000)) throw new Error("Invalid QA abuse limit");
  const lock = async (tx: Tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended('qa-abuse-global-v1',0))::text AS locked`);
  };
  async function charge(tx: Tx, scope: string, seconds: number, amount: number, ceiling: number) {
    const rows = await tx.$queryRaw<{ used: number }[]>(Prisma.sql`
      INSERT INTO qa_abuse_bucket(scope,"windowStart","windowSeconds",used,"expiresAt")
      VALUES(${scope},to_timestamp(floor(extract(epoch FROM CURRENT_TIMESTAMP)/${seconds})*${seconds}),${seconds},${amount},
        to_timestamp((floor(extract(epoch FROM CURRENT_TIMESTAMP)/${seconds})+2)*${seconds}))
      ON CONFLICT(scope,"windowStart","windowSeconds") DO UPDATE SET used=qa_abuse_bucket.used+EXCLUDED.used
      WHERE qa_abuse_bucket.used+EXCLUDED.used<=${ceiling} RETURNING used`);
    if (!rows.length || rows[0]!.used > ceiling) throw limited();
  }
  async function prune(tx: Tx) {
    await tx.$executeRaw(Prisma.sql`DELETE FROM qa_abuse_lease WHERE "leaseUntil"<=CURRENT_TIMESTAMP`);
    await tx.$executeRaw(Prisma.sql`DELETE FROM qa_abuse_bucket WHERE ctid IN (SELECT ctid FROM qa_abuse_bucket WHERE "expiresAt"<=CURRENT_TIMESTAMP LIMIT 100)`);
  }
  const hooks: QaAbuseHooks = {
    async admit(tx,p,turnId,fence,leaseUntil) {
      if (!p.networkId || !/^[a-f0-9]{64}$/.test(p.networkId)) throw unavailable();
      await lock(tx); await prune(tx);
      const principal = `${p.kind}:${p.id}`;
      const counts = (await tx.$queryRaw<{ total: bigint; network: bigint; principal: bigint }[]>(Prisma.sql`
        SELECT count(*) AS total,count(*) FILTER(WHERE "networkId"=${p.networkId}) AS network,
        count(*) FILTER(WHERE principal=${principal}) AS principal FROM qa_abuse_lease`))[0]!;
      if (Number(counts.total)>=limits.concurrentGlobal || Number(counts.network)>=limits.concurrentNetwork || Number(counts.principal)>=limits.concurrentPrincipal) throw limited();
      await charge(tx,`ask-network:${p.networkId}`,600,1,limits.askNetworkTenMinutes);
      await charge(tx,`ask-network:${p.networkId}`,86400,1,limits.askNetworkDay);
      await charge(tx,"ask-global",86400,1,limits.askGlobalDay);
      await tx.$executeRaw(Prisma.sql`INSERT INTO qa_abuse_lease("turnId",fence,principal,"networkId","leaseUntil") VALUES(${turnId},${fence},${principal},${p.networkId},${leaseUntil}) ON CONFLICT("turnId") DO UPDATE SET fence=EXCLUDED.fence,"leaseUntil"=EXCLUDED."leaseUntil"`);
    },
    async release(tx,turnId,fence) {
      await lock(tx);
      await tx.$executeRaw(Prisma.sql`DELETE FROM qa_abuse_lease WHERE "turnId"=${turnId} AND fence=${fence}`);
    },
  };
  return {
    hooks,
    async cleanup(): Promise<void> {
      await db.$transaction(async tx => { await lock(tx); await prune(tx); }, { timeout: 10_000 });
    },
    async bootstrap<T>(networkId: string, work: (tx: Tx) => Promise<T>): Promise<T> {
      if (!/^[a-f0-9]{64}$/.test(networkId)) throw unavailable();
      return db.$transaction(async tx => {
        await lock(tx); await prune(tx);
        await charge(tx,`bootstrap-network:${networkId}`,3600,1,limits.bootstrapNetworkHour);
        await charge(tx,"bootstrap-global",86400,1,limits.bootstrapGlobalDay);
        return work(tx);
      }, { timeout: 10_000 });
    },
  };
}
