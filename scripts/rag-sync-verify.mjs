/** Independent post-commit SQL/Blob verification. No INSERT/UPDATE/DELETE path. */
import { readFile,writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { secrets,verifyIdentity,open,readState,canonical,sha,TABLES,refuse } from "./rag-sync-lib.mjs";
import { assertManifest } from "./rag-sync-transaction.mjs";
import { assertOwnerScope,APPROVED_COUNTS } from "./rag-sync-backup-policy.mjs";
import { validateReusable,conflictPlan } from "./rag-sync-validate.mjs";
import { readPrivateBlob } from "./rag-sync-blob.mjs";

async function main(){
  if(process.argv.length!==4 || process.argv[2]!=="--secrets")refuse("READ_ONLY_VERIFY_ARGUMENTS_REQUIRED");
  const manifest=JSON.parse(await readFile(".cache/rag-sync/manifest-private.json","utf8"));assertManifest(manifest);
  const input=await secrets(process.argv[3]),identities=await verifyIdentity(input);assertOwnerScope(manifest,identities,manifest.planHash);
  const db=await open(input,"target");
  let state,foreignKeys;
  try{
    state=await readState(db);
    const plan=conflictPlan(manifest.rows,state.rows);
    if(plan.conflicts.length || plan.expectedInserts!==0 || TABLES.some(table=>state.rows[table].length!==APPROVED_COUNTS[table]))refuse("TARGET_ROW_OR_METADATA_MISMATCH");
    if(state.rows.rag_document.some(row=>row.publicQaApproved!==false || row.status!=="INDEXED"))refuse("PUBLIC_APPROVAL_OR_STATUS_MISMATCH");
    foreignKeys=(await db.query(`SELECT
      (SELECT count(*) FROM rag_content_version v LEFT JOIN rag_document d ON d.id=v."ragDocumentId" WHERE d.id IS NULL)::int AS "orphanVersions",
      (SELECT count(*) FROM rag_index_generation g LEFT JOIN rag_document d ON d.id=g."ragDocumentId" LEFT JOIN rag_content_version v ON v.id=g."contentVersionId" AND v."ragDocumentId"=g."ragDocumentId" WHERE d.id IS NULL OR v.id IS NULL)::int AS "orphanGenerations",
      (SELECT count(*) FROM rag_chunk c LEFT JOIN rag_index_generation g ON g.id=c."generationId" AND g."ragDocumentId"=c."ragDocumentId" WHERE g.id IS NULL)::int AS "orphanChunks",
      (SELECT count(*) FROM rag_chunk_embedding e LEFT JOIN rag_chunk c ON c.id=e."chunkId" WHERE c.id IS NULL)::int AS "orphanEmbeddings",
      (SELECT count(*) FROM rag_index_publication p LEFT JOIN rag_index_generation g ON g.id=p."generationId" AND g."ragDocumentId"=p."ragDocumentId" WHERE g.id IS NULL OR g.state<>'READY')::int AS "brokenPublications",
      (SELECT count(*) FROM rag_chunk_embedding e WHERE vector_dims(e.embedding)<>1536 OR vector_norm(e.embedding)<=0)::int AS "invalidVectors"`)).rows[0];
    if(Object.values(foreignKeys).some(value=>value!==0))refuse("TARGET_FOREIGN_KEY_OR_VECTOR_FAILURE");
    await db.query("ROLLBACK");
  }finally{await db.end();}
  const processing=createRequire(import.meta.url)("../.cache/rag-sync/processing.cjs");
  const token=input.SYNC_SOURCE_BLOB_READ_WRITE_TOKEN||input.BLOB_READ_WRITE_TOKEN,storeId=token?.match(/^vercel_blob_rw_([A-Za-z0-9]+)_/)?.[1];
  if(!storeId || sha(storeId.toLowerCase())!==manifest.storeIdHash)refuse("BLOB_STORE_CHANGED");
  const documents=[],blobs=[];
  for(const doc of state.rows.rag_document){const blob=await readPrivateBlob(doc,token,storeId);blobs.push(blob.report);documents.push(await validateReusable(doc,state.rows,blob.bytes,processing));}
  const protectedTables=Object.entries(state.protected).map(([table,after])=>({table,before:manifest.targetProtected[table],after,matches:canonical(after)===canonical(manifest.targetProtected[table])}));
  const noProtectedDrift=protectedTables.every(row=>row.matches);
  const report={checkedAt:new Date().toISOString(),status:noProtectedDrift?"PASS":"PROTECTED_DRIFT_REQUIRES_RECONCILIATION",mode:"INDEPENDENT_READ_ONLY_AFTER_COMMIT",identities,
    planHash:manifest.planHash,transactionReadOnly:"on",counts:Object.fromEntries(TABLES.map(table=>[table,state.rows[table].length])),
    documents,blobs,foreignKeys,publicQaApprovedCount:state.rows.rag_document.filter(row=>row.publicQaApproved).length,
    structurallyVerifiedEmbeddings:documents.reduce((n,row)=>n+row.embeddings,0),exactManifestMetadataMatches:true,expectedInsertsRemaining:0,
    protectedTables,noProtectedDrift,migrationLedgerHealthy:state.ledger.length===23&&state.ledger.every(row=>row.finished_at&&!row.rolled_back_at),
    jobsImported:0,fixturesPresent:0,openAiCalls:0,blobCopies:0,productionWrites:0,
    limitations:["No live OpenAI or Public QA enable action.","Shared-store SDK proof does not certify the deployed server's credential; authenticated CMS smoke is separate.","Post-commit rollback/restore is not executed or claimed."]};
  await writeFile(".cache/rag-sync/post-import-state-private.json",JSON.stringify(state,null,2)+"\n");
  await writeFile("docs/implementation/rag-sync-evidence/post-import.json",JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify({status:report.status,counts:report.counts,publicQaApprovedCount:0,verifiedVectors:report.structurallyVerifiedEmbeddings,protectedTables:protectedTables.length,noProtectedDrift}));
  if(!noProtectedDrift)process.exitCode=1;
}
main().catch(error=>{const code=/^[A-Z0-9_]{1,90}$/.test(error?.message||"")?error.message:"DETAILS_SUPPRESSED";console.error(`POST_IMPORT_VERIFY_FAILED:${code}`);process.exitCode=1;});
