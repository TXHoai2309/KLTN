/** Development-only, read-only service timings. Never outputs rows, IDs or credentials. */
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../../../packages/db/prisma/generated/client";
import { requireTraveler } from "../src/server/auth/require-traveler";
import { getCompanionGroup } from "../src/modules/trip-companions/companion-group-service";
import { getCompanionHistory } from "../src/modules/trip-companions/companion-chat-service";
import { getCompanionMembers } from "../src/modules/trip-companions/companion-members-service";
import { getCompanionViewerContext } from "../src/modules/trip-companions/companion-service";
import { getCompanionDelta } from "../src/modules/trip-companions/companion-delta-service";
import { getCompanionUnread } from "../src/modules/trip-companions/companion-unread-service";

const scriptDir = dirname(fileURLToPath(import.meta.url));
let db: PrismaClient | undefined;
try {
  process.loadEnvFile(resolve(scriptDir, "../.env"));
  const target = new URL(process.env.DATABASE_URL ?? "");
  if (target.hostname.split(".")[0]?.replace(/-pooler$/, "") !== "ep-purple-pond-b3xujb8o" || target.pathname !== "/neondb") throw Error("REFUSED_NON_DEVELOPMENT_TARGET");
  target.searchParams.set("options", "-c default_transaction_read_only=on");
  const client = new PrismaClient({ adapter: new PrismaNeon({ connectionString: target.toString() }), log: [{ emit: "event", level: "query" }] });
  db = client;
  let queryCount = 0;
  client.$on("query", () => { queryCount++; });
  const [identity] = await db.$queryRaw<{ endpoint: string; readonly: string }[]>`SELECT current_setting('neon.endpoint_id') AS endpoint, current_setting('default_transaction_read_only') AS readonly`;
  if (identity?.endpoint !== "ep-purple-pond-b3xujb8o" || identity.readonly !== "on") throw Error("READ_ONLY_DEVELOPMENT_IDENTITY_MISMATCH");
  const row = await db.tripCompanionPublication.findFirst({ where: { trip: { user: { status: "ACTIVE" } } }, select: { id: true, messageSequence: true, trip: { select: { userId: true } } } });
  if (!row) throw Error("NO_EXISTING_DEVELOPMENT_GROUP");
  const deps = { database: client, resolveSession: async () => ({ user: { id: row.trip.userId } }) };
  const h = new Headers();
  const phase = process.argv[2];
  if (phase !== "before" && phase !== "after") throw Error("EXPECTED_BEFORE_OR_AFTER");
  const workloads = {
    group: () => getCompanionGroup(h, row.id, deps),
    "idle-delta": () => getCompanionDelta(h, row.id, { after: row.messageSequence.toString() }, deps),
    unread: () => getCompanionUnread(h, {}, deps),
    "itinerary-page-data-chain": async () => {
      if (phase === "before") {
        await requireTraveler(h, deps);
        await getCompanionGroup(h, row.id, deps);
        await getCompanionViewerContext(h, row.id, deps);
        await getCompanionMembers(h, row.id, deps);
        await getCompanionHistory(h, row.id, {}, deps);
      } else {
        await Promise.all([requireTraveler(h, deps), getCompanionGroup(h, row.id, deps)]);
        await getCompanionViewerContext(h, row.id, deps);
      }
    },
  };
  const measurements: Record<string, { ms: number; queries: number }[]> = {};
  for (const [name, run] of Object.entries(workloads)) {
    measurements[name] = [];
    for (let sample = 0; sample < 3; sample++) {
      queryCount = 0;
      const start = performance.now();
      await run();
      measurements[name].push({ ms: Math.round(performance.now() - start), queries: queryCount });
    }
    console.log(JSON.stringify({ workload: name, samples: measurements[name] }));
  }
  const receipt = { phase, measuredAt: new Date().toISOString(), target: "verified-read-only-development", auth: "synthetic host session; persisted account/relationship checks remain real; excludes Better Auth/HTTP/browser", samples: 3, measurements };
  writeFileSync(resolve(scriptDir, `../../../docs/performance/evidence/companion-reads-2026-10-28-${phase}.json`), JSON.stringify(receipt, null, 2) + "\n");
} catch {
  // Provider errors can include SQL parameters or connection details.
  console.error("COMPANION_READ_BENCHMARK_FAILED; no provider details emitted");
  process.exitCode = 1;
} finally {
  await db?.$disconnect();
}
