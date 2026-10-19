import { parseEnv } from "node:util";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../../packages/db/prisma/generated/client";
import { listPublicLocations, parsePublicListQuery, publicLocationSelect, projectPublicLocationRows } from "../../apps/web/src/modules/destination/public-destination-list";
import { listPublicHomeDestinations } from "../../apps/web/src/modules/destination/public-home-destinations";
import { publicLocationListSchema } from "../../apps/web/src/modules/destination/public-destination-query";
import { createHash } from "node:crypto";
import { readInputs, verifyProvider } from "../preflight-destination-production-sync.mjs";
import { summarize, canonicalJson } from "./metrics.mjs";

async function main() {
const [secretFile, output = "docs/performance/evidence/database-before.json", mode = "before"] = process.argv.slice(2);
if (!["before", "after"].includes(mode)) throw new Error("Expected before|after");
if (!secretFile) throw new Error("Ignored secret-file path required; never provide a connection string as CLI argument");
const env = parseEnv(await readFile(secretFile, "utf8"));
const inputs = readInputs(env);
const identities = await verifyProvider(inputs);
const url = new URL(inputs.target.value);
url.searchParams.set("sslmode", "verify-full");
url.searchParams.set("options", "-c default_transaction_read_only=on -c statement_timeout=10000 -c lock_timeout=2000");
const db = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url.toString(), max: 2 }), log: [{ emit: "event", level: "query" }] });
// Never retain query params, SQL text, row content, usernames or session data.
let queries: { durationMs: number }[] = [];
db.$on("query", e => { queries.push({ durationMs: e.duration }); });
try {
  const readOnlyStatus = await db.$queryRawUnsafe<{default_transaction_read_only:string}[]>("SHOW default_transaction_read_only");
  if (readOnlyStatus[0]?.default_transaction_read_only !== "on") throw new Error("READ_ONLY_REQUIRED");
  const observations: { kind: string; elapsedMs: number; queryCount: number; queries: { durationMs: number }[]; resultBytes: number; resultHash: string }[] = [];
  const run = async (kind: string, work: () => Promise<unknown>) => {
    queries = []; const start = performance.now(); const result = await work();
    observations.push({ kind, elapsedMs: Math.round(performance.now()-start), queryCount: queries.length, queries: [...queries], resultBytes: Buffer.byteLength(JSON.stringify(result)), resultHash: createHash("sha256").update(canonicalJson(result)).digest("hex") });
  };
  const legacyList = async () => {
    const [rows,options] = await Promise.all([
      db.destination.findMany({where:{visibility:"VISIBLE"},select:publicLocationSelect,orderBy:[{name:"asc"},{id:"asc"}]}),
      db.destination.findMany({where:{visibility:"VISIBLE"},select:{category:true,area:true},distinct:["category","area"]}),
    ]);
    const unique=(v:string[])=>[...new Set(v.filter(s=>s.trim()))].sort((a,b)=>a.localeCompare(b,"vi"));
    return publicLocationListSchema.parse({items:projectPublicLocationRows(rows),filters:{categories:unique(options.map(o=>o.category)),regions:unique(options.map(o=>o.area))}});
  };
  const legacyHome = async () => {
    const list = await legacyList();
    const details = list.items.length ? await db.destination.findMany({where:{id:{in:list.items.map(d=>d.id)}},select:{id:true,description:true}}):[];
    const descriptions:Record<string,string>={};
    for(const d of details){const t=d.description.trim().replace(/\s+/g," ");if(t)descriptions[d.id]=t.length>130?`${t.slice(0,127)}...`:t;}
    return {destinations:list.items,descriptions};
  };
  for (let i=0;i<5;i++) {
    if(mode==="after") {
      const paired: [string,()=>Promise<unknown>][] = [["list-before-paired",legacyList],["list-after-paired",()=>listPublicLocations({},db)],["home-before-paired",legacyHome],["home-after-paired",()=>listPublicHomeDestinations(db)]];
      for(const [kind,work] of i%2 ? [...paired].reverse():paired)await run(kind,work);
      await run("public-list-filtered",()=>listPublicLocations({q:"Đồng Văn"},db));
      await new Promise(r=>setTimeout(r,300));
      continue;
    }
    await run("public-list-unfiltered", () => listPublicLocations({}, db));
    await run("public-list-filtered", () => listPublicLocations({ q: "Đồng Văn" }, db));
    await run("home-existing", async () => {
      const list = await listPublicLocations(parsePublicListQuery(new URLSearchParams()), db);
      const details = list.items.length ? await db.destination.findMany({ where: { id: { in: list.items.map(d=>d.id) } }, select: { id: true, description: true } }) : [];
      return { list, descriptions: Object.fromEntries(details.map(d=>[d.id,d.description.trim().replace(/\s+/g," ").slice(0,130)])) };
    });
    await new Promise(r=>setTimeout(r,300));
  }
  const connections = await db.$queryRawUnsafe("SELECT state,count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() GROUP BY state ORDER BY state");
  const extensions = await db.$queryRawUnsafe("SELECT extname::text,extversion FROM pg_extension WHERE extname IN ('vector','pg_stat_statements') ORDER BY extname");
  const plans = [];
  for (const [label, sql] of [
    ["visible-destinations", `SELECT id,name,area,category,latitude,longitude FROM destination WHERE visibility='VISIBLE' ORDER BY name,id`],
    ["filter-options", `SELECT DISTINCT category,area FROM destination WHERE visibility='VISIBLE'`],
    ["rag-eligibility-count", `SELECT status,count(*)::int AS count FROM rag_document GROUP BY status`],
  ]) {
    const result = await db.$queryRawUnsafe(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`);
    // Statements have no user/private literals; plan structure/costs only.
    plans.push({ label, plan: result });
  }
  const tables = await db.$queryRawUnsafe("SELECT relname::text,n_live_tup::int,n_dead_tup::int,seq_scan::int,idx_scan::int FROM pg_stat_user_tables WHERE relname IN ('destination','content_media','rag_document','rag_chunk','rag_chunk_embedding') ORDER BY relname");
  const equivalence = mode === "after" ? {
    home: new Set(observations.filter(o=>o.kind.startsWith("home-")).map(o=>o.resultHash)).size===1,
    list: new Set(observations.filter(o=>o.kind.startsWith("list-")).map(o=>o.resultHash)).size===1,
  } : null;
  const report = { measuredAt: new Date().toISOString(), mode, equivalence, identities, readOnly: true, databaseWrites: 0, method: "Actual PrismaNeon adapter; verified default_transaction_read_only=on; sequential 5 samples, pool max2; paired after mode alternates old/new ordering; warm-read mixed; statement_timeout10s; no raw SQL parameters retained", observations, summary: [...new Set(observations.map(o=>o.kind))].map(kind=>({kind,elapsedMs:summarize(observations.filter(o=>o.kind===kind).map(o=>o.elapsedMs)),queryCounts:observations.filter(o=>o.kind===kind).map(o=>o.queryCount)})), connections, extensions, tables, plans };
  await mkdir(dirname(output),{recursive:true}); await writeFile(output,JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify({output,readOnly:true,summary:report.summary},null,2));
  if(equivalence&&(!equivalence.home||!equivalence.list))process.exitCode=1;
} finally { await db.$disconnect(); }
}
main().catch(() => { console.error("PERFORMANCE_DATABASE_AUDIT_FAILED_DETAILS_SUPPRESSED"); process.exitCode = 1; });
