// Local Development read-only probe. No provider calls, auth or stored fixtures.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { createHash } from "node:crypto";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../../packages/db/prisma/generated/client";
import { getPublicDestination } from "../../apps/web/src/modules/destination/public-destination-service";
import { readPublicEditorial } from "../../apps/web/src/modules/destination-editorial/editorial-service";
import { canonicalJson } from "./metrics.mjs";
import { observeNeonFactory, readSpans, unionMs } from "./neon-spans.mjs";

let stage = "input";
async function main() {
  const env = parseEnv(await readFile("apps/web/.env", "utf8"));
  const target = new URL(env.DATABASE_URL!);
  if (!/^ep-purple-pond-b3xujb8o(?:-pooler)?\.c-4\.ap-southeast-1\.aws\.neon\.tech$/.test(target.hostname) || target.pathname !== "/neondb") {
    throw new Error("Pinned Development database required");
  }
  // PgBouncer rejects startup options (08P01). The same pinned Development
  // endpoint's direct hostname supports server-enforced read-only connections.
  target.hostname = target.hostname.replace("-pooler.", ".");
  target.searchParams.set("options", "-c default_transaction_read_only=on -c statement_timeout=5000 -c lock_timeout=2000");
  stage = "client";
  const db = new PrismaClient({
    adapter: observeNeonFactory(new PrismaNeon({ connectionString: target.toString() })),
    log: [{ emit: "event", level: "query" }],
  });
  let queryCount = 0;
  db.$on("query", () => { queryCount++; });
  const samples: object[] = [];
  try {
    stage = "read-only-check";
    const readOnly = await db.$queryRawUnsafe<Array<{ default_transaction_read_only: string }>>("SHOW default_transaction_read_only");
    stage = "read-only-assert";
    if (readOnly[0]?.default_transaction_read_only !== "on") throw new Error("Read-only connection required");
    stage = "cohort";
    const cohort = await db.destination.findMany({ where: { visibility: "VISIBLE", deletedAt: null }, orderBy: [{ name: "asc" }, { id: "asc" }], take: 3, select: { id: true } });
    if (!cohort.length) throw new Error("Visible destinations required");
    for (const [index, { id }] of cohort.entries()) {
      let expectedHash: string | undefined;
      for (let pair = 0; pair < 4; pair++) {
        for (const variant of pair % 2 ? ["overlapped", "sequential"] : ["sequential", "overlapped"]) {
          const scope = { connections: [] as any[], queries: [] as any[], explain: [] as any[] };
          queryCount = 0;
          const started = performance.now();
          let destinationMs = 0, editorialMs = 0;
          stage = "public-detail-read";
          const value = await readSpans.run(scope, async () => {
            const readDestination = async () => {
              const t = performance.now(), value = await getPublicDestination(id, db);
              destinationMs = performance.now() - t;
              return value;
            };
            const readEditorial = async () => {
              const t = performance.now(), value = await readPublicEditorial(id, db);
              editorialMs = performance.now() - t;
              return value;
            };
            const [destination, editorial] = variant === "sequential"
              ? [await readDestination(), await readEditorial()]
              : await Promise.all([readDestination(), readEditorial()]);
            return { destination, editorial };
          });
          const serviceMs = performance.now() - started;
          const hash = createHash("sha256").update(canonicalJson(value)).digest("hex");
          stage = "dto-equivalence";
          if (expectedHash && expectedHash !== hash) throw new Error("Public DTO changed during probe");
          expectedHash = hash;
          samples.push({ cohort: index + 1, pair: pair + 1, variant, serviceMs: Math.round(serviceMs), destinationMs: Math.round(destinationMs), editorialMs: Math.round(editorialMs), queryCount, driverWaitMs: Math.round(unionMs(scope.queries)), checkoutWaitMs: Math.round(unionMs(scope.connections)), resultHash: hash, hasEditorial: value.editorial !== null });
        }
      }
    }
    const report = { measuredAt: new Date().toISOString(), scope: "Pinned Development direct endpoint; three public destinations; four alternating pairs each; same default PrismaNeon pool; server-enforced read-only; service latency, not runtime pooled endpoint, browser LCP or Production", samples };
    stage = "receipt";
    await mkdir(".cache/data-latency", { recursive: true });
    await writeFile(".cache/data-latency/detail-service-paired.json", JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally {
    await db.$disconnect();
  }
}
main().catch((error) => { const codes = [error?.code, error?.cause?.code, error?.meta?.driverAdapterError?.cause?.originalCode].filter(value => typeof value === "string" && /^[A-Z0-9]{2,10}$/.test(value)); console.error(`DETAIL_PROBE_FAILED stage=${stage} codes=${codes.join(",")} details=suppressed`); process.exitCode = 1; });
