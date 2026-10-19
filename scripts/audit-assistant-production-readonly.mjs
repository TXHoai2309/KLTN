/** Aggregate-only Production acceptance audit. No model, import or write path. */
import { Client } from "pg";
import { mkdir, writeFile } from "node:fs/promises";

const pin = Object.freeze({ project: "summer-unit-95870477", branch: "br-cold-dew-b3h270wp", endpoint: "ep-blue-art-b3v3vr4h", database: "neondb", snapshot: "snap-snowy-rain-b33t352d" });
const output = "docs/implementation/assistant-production-evidence/corpus.json";
async function main() {
  if (process.argv.slice(2).join(" ") !== "--report") throw Error("REPORT_ONLY");
  const url = new URL(process.env.SYNC_TARGET_DATABASE_URL || "invalid:");
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.username || !url.password ||
      url.pathname !== `/${pin.database}` || url.hostname.split(".")[0].replace(/-pooler$/, "") !== pin.endpoint ||
      !/^ep-[a-z0-9-]+(?:\.c-\d+)?\.ap-southeast-1\.aws\.neon\.tech$/.test(url.hostname) || !process.env.NEON_API_KEY) throw Error("TARGET_REFUSED");
  const meta = async path => {
    const response = await fetch(`https://console.neon.tech/api/v2/projects/${pin.project}${path}`, {
      headers: { Authorization: `Bearer ${process.env.NEON_API_KEY}` }, signal: AbortSignal.timeout(15000), redirect: "error",
    });
    if (!response.ok) throw Error("IDENTITY_UNVERIFIED");
    return response.json();
  };
  const branch = (await meta(`/branches/${pin.branch}`)).branch;
  const endpoint = (await meta(`/endpoints/${pin.endpoint}`)).endpoint;
  if (branch?.id !== pin.branch || branch?.project_id !== pin.project || endpoint?.branch_id !== pin.branch ||
      endpoint?.host !== url.hostname.replace("-pooler.", ".")) throw Error("IDENTITY_MISMATCH");
  const snapshots = await meta("/snapshots");
  const snapshot = snapshots.snapshots?.find(item => item.id === pin.snapshot);
  if (!snapshot || snapshot.source_branch_id !== pin.branch) throw Error("SNAPSHOT_UNVERIFIED");
  url.searchParams.set("options", "-c default_transaction_read_only=on -c statement_timeout=10000");
  url.searchParams.set("sslmode", "verify-full");
  const client = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 15000 });
  try {
    await client.connect();
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const readOnly = (await client.query("SHOW transaction_read_only")).rows[0]?.transaction_read_only;
    if (readOnly !== "on") throw Error("READ_ONLY_REQUIRED");
    const query = async sql => (await client.query(sql)).rows;
    const report = { checkedAt: new Date().toISOString(), pin, identity: "VERIFIED_NEON_API", readOnly,
      snapshot: { id: snapshot.id, sourceBranchId: snapshot.source_branch_id, retained: true },
      documentStates: await query(`SELECT s::text AS status, count(d.id)::int AS documents,
        count(d.id) FILTER (WHERE d."publicQaApproved")::int AS "publicApproved"
        FROM unnest(enum_range(NULL::"RagDocumentStatus")) s LEFT JOIN rag_document d ON d.status=s GROUP BY s ORDER BY s`),
      counts: await query(`SELECT (SELECT count(*)::int FROM rag_document) documents,
        (SELECT count(*)::int FROM rag_content_version) versions, (SELECT count(*)::int FROM rag_index_generation) generations,
        (SELECT count(*)::int FROM rag_index_publication) publications, (SELECT count(*)::int FROM rag_chunk) chunks,
        (SELECT count(*)::int FROM rag_chunk_embedding) vectors, (SELECT count(*)::int FROM rag_domain_origin) origins,
        (SELECT count(*)::int FROM rag_index_job) jobs`),
      generationStates: await query(`SELECT state::text, "embeddingProvider", "embeddingModel", "embeddingDimensions", count(*)::int FROM rag_index_generation GROUP BY 1,2,3,4`),
      vectorHealth: await query(`SELECT count(*)::int AS total,
        count(*) FILTER (WHERE vector_dims(embedding)=1536 AND vector_norm(embedding)>0 AND "tokenCount">0)::int AS "dimensionNormTokenValid",
        count(*) FILTER (WHERE vector_dims(embedding)<>1536 OR vector_norm(embedding)<=0 OR "tokenCount"<=0)::int AS invalid FROM rag_chunk_embedding`),
      vectorDimensions: await query(`SELECT vector_dims(embedding) dimensions, count(*)::int FROM rag_chunk_embedding GROUP BY 1`),
      extension: await query(`SELECT extname,extversion FROM pg_extension WHERE extname='vector'`),
      vectorColumn: await query(`SELECT format_type(a.atttypid,a.atttypmod) AS type FROM pg_attribute a WHERE a.attrelid='rag_chunk_embedding'::regclass AND a.attname='embedding'`),
      eligiblePublishedChunks: await query(`SELECT count(DISTINCT d.id)::int AS documents, count(*)::int AS chunks
        FROM rag_index_publication p JOIN rag_document d ON d.id=p."ragDocumentId"
        JOIN rag_index_generation g ON g.id=p."generationId" AND g."ragDocumentId"=d.id
        JOIN rag_chunk c ON c."generationId"=g.id AND c."ragDocumentId"=d.id JOIN rag_chunk_embedding e ON e."chunkId"=c.id
        WHERE d.status='INDEXED' AND d."publicQaApproved"=true AND g.state='READY'
        AND g."embeddingProvider"='openai' AND g."embeddingModel"='text-embedding-3-small' AND g."embeddingDimensions"=1536
        AND e."tokenCount">0 AND vector_dims(e.embedding)=1536 AND vector_norm(e.embedding)>0`),
      sourceRights: await query(`SELECT "websiteRights"::text,"indexingRights"::text,"openAiRights"::text,count(*)::int AS sources,
        count(*) FILTER(WHERE nullif(trim("rightsEvidence"),'') IS NOT NULL)::int AS "withEvidence"
        FROM content_source GROUP BY 1,2,3 ORDER BY 1,2,3`),
      destinationLinks: await query(`SELECT d.id,d.name,d.visibility::text,
        (SELECT count(*)::int FROM content_source s WHERE s."destinationId"=d.id) AS sources,
        (SELECT count(*)::int FROM rag_domain_origin o WHERE o."destinationId"=d.id) AS "ragOrigins"
        FROM destination d ORDER BY d.id`),
      originLinks: await query(`SELECT count(*)::int AS total, count(*) FILTER(WHERE "revokedAt" IS NULL)::int AS active FROM rag_domain_origin`),
      jobs: await query(`SELECT status::text,phase::text,count(*)::int FROM rag_index_job GROUP BY 1,2`),
      migrations: await query(`SELECT count(*)::int AS total,count(*) FILTER(WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)::int AS healthy FROM _prisma_migrations`),
      fingerprints: {}, providerCalls: 0, businessWrites: 0, authReads: 0,
      limits: ["Vector health counts are structural, not semantic quality acceptance.", "SQL eligibility is before score, tokenization, metadata safety and question-context filters.", "No private document prose, storage paths, Auth records or history exported."] };
    for (const table of ["destination", "opening_day", "content_source", "content_media", "destination_editorial", "rag_document", "rag_chunk", "rag_chunk_embedding"]) {
      report.fingerprints[table] = (await query(`SELECT count(*)::int AS count,md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]')) AS fingerprint FROM "${table}" t`))[0];
    }
    await client.query("ROLLBACK");
    await mkdir("docs/implementation/assistant-production-evidence", { recursive: true });
    await writeFile(output, JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report, null, 2));
  } finally { await client.end(); }
}
main().catch(error => { const code = typeof error?.code === "string" && /^[A-Z0-9_]{1,40}$/.test(error.code) ? error.code : /^[A-Z_]{1,40}$/.test(error?.message || "") ? error.message : "DETAILS_SUPPRESSED"; console.error(`READ_ONLY_AUDIT_FAILED:${code}`); process.exitCode=1; });
