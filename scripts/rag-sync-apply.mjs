import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { secrets,verifyIdentity,neon,open,readState,fingerprintOtherTables,canonical,sha,PIN,refuse,verifyLedgers } from "./rag-sync-lib.mjs";
import { assertManifest, atomicImport } from "./rag-sync-transaction.mjs";
import { validateReusable } from "./rag-sync-validate.mjs";
import { readPrivateBlob } from "./rag-sync-blob.mjs";
import { backupPolicy,assertOwnerScope,assertTargetRowsForDirectApply } from "./rag-sync-backup-policy.mjs";

async function main() {
  const waiver=process.argv.length===7 && process.argv[6]==="--accept-no-current-backup";
  if ((!waiver && process.argv.length!==6) || process.argv[2]!=="--secrets" || process.argv[4]!=="--plan-hash") refuse("EXACT_PLAN_HASH_REQUIRED");
  const manifest=JSON.parse(await readFile(".cache/rag-sync/manifest-private.json","utf8")); assertManifest(manifest);
  if (process.argv[5]!==manifest.planHash) refuse("PLAN_HASH_MISMATCH");
  const input=await secrets(process.argv[3]); const identities=await verifyIdentity(input);
  let backup;
  try { backup=JSON.parse(await readFile(".cache/rag-sync/backup-receipt.json","utf8")); } catch { /* default policy below refuses missing backup */ }
  const policy=backupPolicy({manifest,identities,expectedHash:process.argv[5],acceptNoCurrentBackup:waiver,backup});
  if(!waiver){
    const snapshot=(await neon(input,"/snapshots")).snapshots?.find(row=>row.id===backup.snapshot?.id);
    if (!snapshot || snapshot.source_branch_id!==PIN.target.branch) refuse("SNAPSHOT_NOT_AVAILABLE");
  }
  const source=await open(input,"source"), target=await open(input,"target");
  try {
    const sourceState=await readState(source),targetState=await readState(target);
    assertOwnerScope(manifest,identities,process.argv[5]);
    assertTargetRowsForDirectApply(manifest,targetState.rows);
    if(targetState.triggers.some(row=>Object.keys(manifest.rows).includes(row.table_name))) refuse("RAG_TRIGGER_SIDE_EFFECT_REVIEW_REQUIRED");
    const rules=(await target.query("SELECT tablename FROM pg_rules WHERE schemaname='public' AND tablename=ANY($1::text[])",[Object.keys(manifest.rows)])).rows;
    if(rules.length) refuse("RAG_RULE_SIDE_EFFECT_REVIEW_REQUIRED");
    if (sha(canonical(sourceState.rows))!==manifest.sourceRowsHash) refuse("SOURCE_CHANGED_NEW_DRY_RUN_REQUIRED");
    await verifyLedgers(sourceState.ledger,targetState.ledger);
    if (["columns","constraints","triggers","extensions"].some(key=>canonical(sourceState[key])!==canonical(targetState[key])) ||
        sha(canonical([sourceState.columns,sourceState.constraints,sourceState.triggers,sourceState.extensions]))!==manifest.schemaHash) refuse("SCHEMA_CHANGED");
    const token=input.SYNC_SOURCE_BLOB_READ_WRITE_TOKEN||input.BLOB_READ_WRITE_TOKEN;
    const storeId=token?.match(/^vercel_blob_rw_([A-Za-z0-9]+)_/)?.[1];
    if(!storeId||sha(storeId.toLowerCase())!==manifest.storeIdHash) refuse("BLOB_STORE_CHANGED");
    const processing=createRequire(import.meta.url)("../.cache/rag-sync/processing.cjs");
    for(const item of manifest.verified){
      const doc=sourceState.rows.rag_document.find(row=>row.id===item.documentId);
      const blob=await readPrivateBlob(doc,token,storeId);
      const verified=await validateReusable(doc,sourceState.rows,blob.bytes,processing);
      if(verified.originalSha256!==item.originalSha256 || verified.generationId!==item.generationId || verified.versionId!==item.versionId || verified.publicationId!==item.publicationId) refuse("ORIGINAL_OR_INDEX_CHANGED");
    }
    await source.query("ROLLBACK");await target.query("ROLLBACK");
  } finally {await source.end();await target.end();}
  await writeFile(".cache/rag-sync/execution-intent.json",JSON.stringify({checkedAt:new Date().toISOString(),planHash:manifest.planHash,identities,policy,status:"PREFLIGHT_PASSED_NOT_COMMITTED"},null,2)+"\n");
  // Write-capable connection is opened only after all source/blob and backup-policy gates.
  const writer=await open(input,"target",false);
  let receipt;
  try {
    const result=await atomicImport(writer,manifest,async()=> {const state=await readState(writer);assertTargetRowsForDirectApply(manifest,state.rows);return state.rows;},()=>fingerprintOtherTables(writer));
    receipt={checkedAt:new Date().toISOString(),status:"COMMIT_CONFIRMED",identities,planHash:manifest.planHash,backupPolicy:policy,...result,
      documents:manifest.verified,openAiCalls:0,openAiCostUsd:0,blobCopies:0,jobsImported:0,actorIdsPreserved:true};
  } catch(error){await writeFile(".cache/rag-sync/failed-execution.json",JSON.stringify({checkedAt:new Date().toISOString(),planHash:manifest.planHash,policy,status:error.migrationOutcome??"NOT_CONFIRMED",code:/^[A-Z0-9_]{1,90}$/.test(error.message)?error.message:"DETAILS_SUPPRESSED",retryAutomatically:false},null,2)+"\n");throw error;}
  finally {await writer.end();}
  await writeFile(`.cache/rag-sync/${receipt.inserted===0?"replay":"applied"}-receipt.json`,JSON.stringify(receipt,null,2)+"\n");
  await writeFile(`docs/implementation/rag-sync-evidence/${receipt.inserted===0?"replay":"import"}.json`,JSON.stringify(receipt,null,2)+"\n");
  console.log(JSON.stringify(receipt,null,2));
}
main().catch(error=>{const code=/^[A-Z0-9_]{1,90}$/.test(error?.message||"")?error.message:"DETAILS_SUPPRESSED";console.error(`IMPORT_NOT_CONFIRMED:${code}`);process.exitCode=1;});
