import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { Client, types } from "pg";

export const PIN = Object.freeze({ project: "summer-unit-95870477", database: "neondb",
  source: { branch: "br-aged-hat-b3o6hg9p", endpoint: "ep-purple-pond-b3xujb8o" },
  target: { branch: "br-cold-dew-b3h270wp", endpoint: "ep-blue-art-b3v3vr4h" } });
export const TABLES = Object.freeze(["rag_document", "rag_content_version", "rag_index_generation", "rag_chunk", "rag_chunk_embedding", "rag_index_publication", "rag_index_job", "rag_domain_origin"]);
export const canonical = value => value === null || typeof value !== "object" ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : `{${Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
export const sha = value => createHash("sha256").update(value).digest("hex");
export const refuse = code => { throw Error(code); };
export async function secrets(file) {
  const input = parseEnv(await readFile(file, "utf8"));
  return Object.fromEntries(["SYNC_SOURCE_DATABASE_URL", "SYNC_TARGET_DATABASE_URL", "NEON_API_KEY", "BLOB_READ_WRITE_TOKEN", "SYNC_SOURCE_BLOB_READ_WRITE_TOKEN", "SYNC_TARGET_BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID"].map(key => [key, input[key] ?? process.env[key]]));
}
export function connection(input, side) {
  let url; try { url = new URL(input[`SYNC_${side.toUpperCase()}_DATABASE_URL`]); } catch { refuse("DATABASE_INPUT_MISSING"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.username || !url.password || url.pathname !== `/${PIN.database}` ||
      url.port && url.port !== "5432" || url.hostname.split(".")[0].replace(/-pooler$/, "") !== PIN[side].endpoint ||
      !/^ep-[a-z0-9-]+(?:\.c-\d+)?\.ap-southeast-1\.aws\.neon\.tech$/.test(url.hostname) || !["require", "verify-full"].includes(url.searchParams.get("sslmode"))) refuse("WRONG_DATABASE_TARGET");
  return url;
}
export async function neon(input, path, method = "GET") {
  if (!input.NEON_API_KEY) refuse("NEON_CREDENTIAL_MISSING");
  const response = await fetch(`https://console.neon.tech/api/v2/projects/${PIN.project}${path}`, {
    method, headers: { Authorization: `Bearer ${input.NEON_API_KEY}` }, redirect: "error", signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    // Diagnostic provider body stays in ignored local storage; never print it.
    await writeFile(".cache/rag-sync/neon-error-private.txt", await response.text());
    refuse(`NEON_HTTP_${response.status}`);
  }
  return response.json();
}
export async function verifyIdentity(input) {
  const identities = [];
  for (const side of ["source", "target"]) {
    const url = connection(input, side), pin = PIN[side];
    const branch = (await neon(input, `/branches/${pin.branch}`)).branch;
    const endpoint = (await neon(input, `/endpoints/${pin.endpoint}`)).endpoint;
    const databases = (await neon(input, `/branches/${pin.branch}/databases`)).databases;
    if (branch?.id !== pin.branch || branch?.project_id !== PIN.project || endpoint?.id !== pin.endpoint || endpoint?.branch_id !== pin.branch ||
        endpoint?.host !== url.hostname.replace("-pooler.", ".") || !databases?.some(db => db.name === PIN.database)) refuse("NEON_IDENTITY_MISMATCH");
    identities.push({ side, project: PIN.project, ...pin, database: PIN.database, verified: true });
  }
  return identities;
}
// Preserve PostgreSQL timestamp representations; never shift timestamp-without-zone through JS Date.
types.setTypeParser(1114, value => value); types.setTypeParser(1184, value => value);
export async function open(input, side, readOnly = true) {
  const url = connection(input, side);
  url.searchParams.set("sslmode", "verify-full");
  url.searchParams.set("options", `-c default_transaction_read_only=${readOnly ? "on" : "off"} -c statement_timeout=20000 -c lock_timeout=5000`);
  const client = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 15000 });
  await client.connect();
  if (readOnly) {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    if ((await client.query("SHOW transaction_read_only")).rows[0]?.transaction_read_only !== "on") refuse("READ_ONLY_REQUIRED");
  }
  if ((await client.query("SELECT current_database() AS name")).rows[0]?.name !== PIN.database) refuse("DATABASE_NAME_MISMATCH");
  return client;
}
export async function fingerprintOtherTables(client) {
  const tables = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(row => row.tablename).filter(table => !TABLES.includes(table));
  const report = {};
  for (const table of tables) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) refuse("UNEXPECTED_TABLE_IDENTIFIER");
    report[table] = (await client.query(`SELECT count(*)::int AS count,md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]')) AS fingerprint FROM "${table}" t`)).rows[0];
  }
  return report;
}
export async function readState(client) {
  const rows = {};
  for (const table of TABLES) {
    rows[table] = table === "rag_chunk_embedding" ? (await client.query(`SELECT e.*,encode(vector_send(e.embedding),'base64') AS "vectorBinary" FROM "rag_chunk_embedding" e ORDER BY e.id`)).rows
      : (await client.query(`SELECT * FROM "${table}" ORDER BY ${table === "rag_domain_origin" ? '"id"' : '"id"'}`)).rows;
  }
  const ledger = (await client.query("SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations ORDER BY migration_name")).rows;
  const columns = (await client.query(`SELECT c.relname AS table_name,a.attname AS column_name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS not_null
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum`)).rows;
  const constraints = (await client.query(`SELECT c.relname AS table_name,k.conname,k.contype,pg_get_constraintdef(k.oid) AS definition
    FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' ORDER BY c.relname,k.conname`)).rows;
  const triggers = (await client.query(`SELECT c.relname AS table_name,t.tgname,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`)).rows;
  const extensions = (await client.query("SELECT extname,extversion FROM pg_extension WHERE extname IN ('vector','postgis') ORDER BY extname")).rows;
  return { rows, ledger, columns, constraints, triggers, extensions, protected: await fingerprintOtherTables(client) };
}
export async function verifyLedgers(source, target) {
  if (source.length !== 23 || target.length !== 23 || [...source, ...target].some(row => !row.finished_at || row.rolled_back_at)) refuse("UNHEALTHY_MIGRATION_LEDGER");
  const differences = [];
  for (const row of source) {
    const peer = target.find(item => item.migration_name === row.migration_name);
    if (!peer) refuse("MIGRATION_NAME_MISMATCH");
    if (peer.checksum === row.checksum) continue;
    if (!/^\d+_[a-z0-9_]+$/.test(row.migration_name)) refuse("MIGRATION_NAME_INVALID");
    const raw = await readFile(`packages/db/prisma/migrations/${row.migration_name}/migration.sql`, "utf8");
    const lf = raw.replace(/\r\n/g, "\n"), variants = { LF: sha(lf), CRLF: sha(lf.replace(/\n/g, "\r\n")) };
    const a = Object.keys(variants).find(key => variants[key] === row.checksum);
    const b = Object.keys(variants).find(key => variants[key] === peer.checksum);
    if (!a || !b) refuse("UNEXPLAINED_MIGRATION_CHECKSUM");
    differences.push({ migration: row.migration_name, sourceLineEnding: a, targetLineEnding: b, normalizedSqlSha256: variants.LF });
  }
  return { healthyBoth: true, semanticSqlEquivalent: true, rawChecksumsEqual: differences.length === 0, lineEndingDifferences: differences };
}
export function decodeVector(binary) {
  const data = Buffer.from(binary, "base64");
  if (data.length < 4 || data.readUInt16BE(0) !== 1536 || data.readUInt16BE(2) !== 0 || data.length !== 4 + 1536 * 4) refuse("INVALID_VECTOR_BINARY");
  const values = Array.from({ length: 1536 }, (_, i) => data.readFloatBE(4 + i * 4));
  const norm = values.reduce((total, value) => total + value * value, 0);
  if (values.some(value => !Number.isFinite(value)) || !Number.isFinite(norm) || norm <= 0) refuse("INVALID_VECTOR_VALUES");
  return values;
}
export function basicInventory(state) {
  return state.rows.rag_document.map(doc => {
    const versions = state.rows.rag_content_version.filter(row => row.ragDocumentId === doc.id);
    const generations = state.rows.rag_index_generation.filter(row => row.ragDocumentId === doc.id);
    const chunks = state.rows.rag_chunk.filter(row => row.ragDocumentId === doc.id);
    const vectors = state.rows.rag_chunk_embedding.filter(row => chunks.some(chunk => chunk.id === row.chunkId));
    let validVectors = 0, vectorHashMatches = 0;
    for (const row of vectors) try { const values = decodeVector(row.vectorBinary); validVectors++; if (sha(canonical(values.map(value => Object.is(value, -0) ? 0 : value))) === row.vectorHash) vectorHashMatches++; } catch { /* summarized, never repair */ }
    const publication = state.rows.rag_index_publication.find(row => row.ragDocumentId === doc.id);
    return { id: doc.id, name: doc.originalFileName, sourceTitle: doc.sourceTitle, fileType: doc.fileType, status: doc.status,
      sourceUrl: doc.sourceUrl && /^https?:\/\//.test(doc.sourceUrl) && !/[?#]/.test(doc.sourceUrl) ? doc.sourceUrl : null,
      storagePathDigest: sha(doc.storagePath), storagePathLocation: "Private ignored inventory contains exact original pathname",
      publicQaApproved: doc.publicQaApproved, actorProvenancePresent: !!doc.uploadedById, versions: versions.length,
      generations: generations.map(g => ({ id: g.id, state: g.state, model: g.embeddingModel, provider: g.embeddingProvider, dimensions: g.embeddingDimensions, expectedChunks: g.expectedChunkCount, expectedTokens: g.expectedTokenCount })),
      chunks: chunks.length, vectors: vectors.length, validVectors, vectorHashMatches,
      publication: publication ? { id: publication.id, generationId: publication.generationId, ready: generations.find(g => g.id === publication.generationId)?.state === "READY" } : null,
      jobs: state.rows.rag_index_job.filter(row => row.ragDocumentId === doc.id).map(job => ({ id: job.id, status: job.status, phase: job.phase })),
      origins: state.rows.rag_domain_origin.filter(row => row.ragDocumentId === doc.id).length,
      classification: /(?:\bTEST\b|fixture|synthetic|smoke|US\d{2}_)/i.test(doc.originalFileName.replaceAll("_", " ") + " " + doc.sourceTitle) ? "FIXTURE_EXCLUDE" : "REAL_DOCUMENT_REVIEW_REQUIRED" };
  });
}
