import { canonical, sha, refuse, TABLES } from "./rag-sync-lib.mjs";
import { conflictPlan } from "./rag-sync-validate.mjs";

const JSON_COLUMNS = new Set(["chunkOptions", "refs", "locators"]);
const quote = name => { if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) refuse("UNSAFE_IDENTIFIER"); return `"${name}"`; };
export function manifestHash(manifest) { const { planHash, ...value } = manifest; return sha(canonical(value)); }
export function assertManifest(manifest) {
  if (manifest.planHash !== manifestHash(manifest) || manifest.status !== "DRY_RUN_PASS" || manifest.plan.conflicts.length ||
      manifest.rows.rag_document.length !== 3 || manifest.rows.rag_document.some(row => row.publicQaApproved !== false || row.status !== "INDEXED") ||
      manifest.rows.rag_index_job.length || manifest.rows.rag_domain_origin.length || Object.keys(manifest.rows).some(table => !TABLES.includes(table))) refuse("MANIFEST_GATE_FAILED");
}

/** Caller owns BEGIN/COMMIT and preflight locks. Inserts only, exact replay only. */
export async function insertPlan(client, manifest, targetRows, afterInsert) {
  assertManifest(manifest);
  const plan = conflictPlan(manifest.rows, targetRows);
  if (plan.conflicts.length) refuse("TARGET_ID_CONFLICT");
  let inserted = 0;
  for (const table of TABLES) {
    if (["rag_index_job", "rag_domain_origin"].includes(table)) continue;
    for (const row of manifest.rows[table]) {
      if (targetRows[table].some(existing => existing.id === row.id)) continue;
      const columns = Object.keys(row).filter(key => key !== "vectorBinary");
      const values = columns.map(key => JSON_COLUMNS.has(key) ? JSON.stringify(row[key]) : row[key]);
      const expressions = columns.map((key, index) => `$${index+1}${key === "embedding" ? "::vector" : ""}`);
      const result = await client.query(`INSERT INTO ${quote(table)} (${columns.map(quote).join(",")}) VALUES (${expressions.join(",")})`, values);
      if (result.rowCount !== 1) refuse("INSERT_NOT_CONFIRMED");
      inserted++;
      if (table === "rag_chunk_embedding") {
        const saved = (await client.query('SELECT encode(vector_send(embedding),\'base64\') AS binary FROM rag_chunk_embedding WHERE id=$1', [row.id])).rows[0];
        if (!saved?.binary || !Buffer.from(saved.binary,"base64").equals(Buffer.from(row.vectorBinary,"base64"))) refuse("VECTOR_BINARY_ROUNDTRIP_MISMATCH");
      }
      if (afterInsert) await afterInsert({ table, inserted }); // dependency injection used only by isolated tests
    }
  }
  return { inserted, replayedRows: Object.values(plan.counts).reduce((n, item)=>n+item.replays,0) };
}

export async function atomicImport(client, manifest, readCurrent, readProtected, afterInsert) {
  assertManifest(manifest);
  let commitStarted=false;
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
    const lock = (await client.query("SELECT pg_try_advisory_xact_lock(hashtextextended('kltn-rag-production-sync-v1',0)) AS acquired")).rows[0];
    if (!lock?.acquired) refuse("MIGRATION_ALREADY_RUNNING");
    // Short maintenance lock: preserve unrelated rows including Auth/history exactly.
    const protectedTables = Object.keys(manifest.targetProtected).sort();
    await client.query(`LOCK TABLE ${[...TABLES,...protectedTables].map(quote).join(",")} IN SHARE ROW EXCLUSIVE MODE`);
    const before = await readCurrent();
    const preservedBefore = await readProtected();
    if (canonical(preservedBefore) !== canonical(manifest.targetProtected)) refuse("PRODUCTION_CHANGED_REQUIRES_NEW_DRY_RUN_AND_BACKUP");
    const result = await insertPlan(client,manifest,before,afterInsert);
    const after = await readCurrent();
    const finalPlan = conflictPlan(manifest.rows,after);
    if (finalPlan.conflicts.length || finalPlan.expectedInserts !== 0) refuse("POST_IMPORT_INTEGRITY_FAILED");
    for (const table of TABLES) {
      const expectedIds = new Set([...before[table],...manifest.rows[table]].map(row=>row.id));
      if (after[table].length !== expectedIds.size || after[table].some(row=>!expectedIds.has(row.id))) refuse("UNRELATED_RAG_ROWS_CHANGED");
    }
    const preservedAfter=await readProtected();
    if (canonical(preservedAfter) !== canonical(preservedBefore)) refuse("PROTECTED_ROWS_CHANGED_ROLLBACK");
    commitStarted=true;
    await client.query("COMMIT");
    return { ...result, updates:0,deletes:0,protectedTables:Object.keys(preservedBefore).length,protectedBefore:preservedBefore,protectedAfter:preservedAfter,publicQaApproved:0 };
  } catch (error) { if(!commitStarted) await client.query("ROLLBACK").catch(()=>{}); error.migrationOutcome=commitStarted?"UNKNOWN":"ROLLED_BACK"; throw error; }
}
