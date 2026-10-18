import { canonical, PIN, refuse, TABLES } from "./rag-sync-lib.mjs";
import { assertManifest } from "./rag-sync-transaction.mjs";

export const APPROVED_DOCUMENTS = Object.freeze([
  { id:"cmvapg3l0001j7w9w61egpl01", name:"Cao_nguyen_da_Dong_Van_RAG_URL_day_du_2026.docx", chunks:51, sha256:"6f21f0c8f69a4b8e5315299b5a2693518d9ac85c4c116d81d83ec0db14abe6b6" },
  { id:"cmvc530ki0001ik9wn3ynioi6", name:"Cang_Bac_Me_Ho_so_du_lieu_RAG_nguon_URL_day_du_2026.docx", chunks:35, sha256:"8bb6e92b2b301c01e3bf8ac70ead1c7ed87512f7215cf81e85374335b71e6ad7" },
  { id:"cmvc55mhx000bik9wpn3gtlmn", name:"Khau_Vai_RAG_2026.docx", chunks:51, sha256:"43659cfc3614034bb02987d17f00e1eb97b29f6338546d8d2774b72f5c577fdf" },
]);
export const APPROVED_COUNTS = Object.freeze({rag_document:3,rag_content_version:3,rag_index_generation:3,rag_chunk:137,rag_chunk_embedding:137,rag_index_publication:3,rag_index_job:0,rag_domain_origin:0});

/** This execution-only exception is bound to the owner's exact corpus and target. */
export function assertOwnerScope(manifest, identities, expectedHash) {
  assertManifest(manifest);
  if (manifest.planHash!==expectedHash) refuse("PLAN_HASH_MISMATCH");
  const target=identities?.find(row=>row.side==="target"),source=identities?.find(row=>row.side==="source");
  if (!target?.verified || target.project!==PIN.project || target.branch!==PIN.target.branch || target.endpoint!==PIN.target.endpoint || target.database!==PIN.database ||
      !source?.verified || source.project!==PIN.project || source.branch!==PIN.source.branch || source.endpoint!==PIN.source.endpoint || source.database!==PIN.database) refuse("WAIVER_WRONG_TARGET_OR_SOURCE");
  if (manifest.plan.expectedUpdates!==0 || manifest.plan.expectedDeletes!==0 || manifest.plan.expectedInserts!==286 || manifest.plan.conflicts.length) refuse("OWNER_SCOPE_WRITE_COUNTS_MISMATCH");
  for(const table of TABLES) if(manifest.rows[table].length!==APPROVED_COUNTS[table] || new Set(manifest.rows[table].map(row=>row.id)).size!==manifest.rows[table].length) refuse("OWNER_SCOPE_ROW_COUNTS_MISMATCH");
  if(manifest.verified?.length!==3) refuse("OWNER_SCOPE_VERIFICATION_REQUIRED");
  for(const approved of APPROVED_DOCUMENTS){
    const doc=manifest.rows.rag_document.find(row=>row.id===approved.id),verified=manifest.verified.find(row=>row.documentId===approved.id);
    if(!doc || doc.originalFileName!==approved.name || doc.fileType!=="DOCX" || doc.status!=="INDEXED" || doc.publicQaApproved!==false ||
        !verified || verified.originalSha256!==approved.sha256 || verified.chunks!==approved.chunks || verified.embeddings!==approved.chunks ||
        verified.integrity!=="TECHNICALLY_READY" || verified.allHashesMatch!==true || verified.dimensions!==1536 || verified.targetPublicQaApproved!==false) refuse("OWNER_SCOPE_DOCUMENT_MISMATCH");
    const versions=manifest.rows.rag_content_version.filter(row=>row.ragDocumentId===doc.id),gens=manifest.rows.rag_index_generation.filter(row=>row.ragDocumentId===doc.id),chunks=manifest.rows.rag_chunk.filter(row=>row.ragDocumentId===doc.id),pubs=manifest.rows.rag_index_publication.filter(row=>row.ragDocumentId===doc.id);
    if(versions.length!==1 || gens.length!==1 || pubs.length!==1 || chunks.length!==approved.chunks || versions[0].originalBytesHash!==approved.sha256 ||
      gens[0].state!=="READY" || gens[0].contentVersionId!==versions[0].id || pubs[0].generationId!==gens[0].id || chunks.some(row=>row.generationId!==gens[0].id) ||
      manifest.rows.rag_chunk_embedding.filter(row=>chunks.some(chunk=>chunk.id===row.chunkId)).length!==approved.chunks) refuse("OWNER_SCOPE_DEPENDENCY_MISMATCH");
  }
}

export function backupPolicy({ manifest,identities,expectedHash,acceptNoCurrentBackup=false,backup,now=Date.now() }) {
  assertOwnerScope(manifest,identities,expectedHash);
  if(acceptNoCurrentBackup===true) return {
    OWNER_BACKUP_WAIVER_ACCEPTED:true, reason:"SNAPSHOTS_LIMIT_EXCEEDED", scope:APPROVED_DOCUMENTS.map(row=>row.id),
    target:{project:PIN.project,...PIN.target,database:PIN.database},manifestHash:expectedHash,executionTimestamp:new Date(now).toISOString(),
    CURRENT_PRODUCTION_BACKUP:"WAIVED_BY_OWNER",RECOVERY_POINT_AFTER_DESTINATION_IMPORT:"NOT_AVAILABLE",backupVerified:false,
  };
  if(!backup || backup.status!=="VERIFIED_COMPLETE" || backup.planHash!==expectedHash || backup.branch!==PIN.target.branch || !backup.snapshot?.id ||
      !Number.isFinite(Date.parse(backup.verifiedAt)) || Date.parse(backup.verifiedAt)<Date.parse(manifest.checkedAt) || now-Date.parse(backup.verifiedAt)>3600000) refuse("CURRENT_BACKUP_REQUIRED");
  return {OWNER_BACKUP_WAIVER_ACCEPTED:false,CURRENT_PRODUCTION_BACKUP:"VERIFIED",backupVerified:true,backupId:backup.snapshot.id};
}

export function assertTargetRowsForDirectApply(manifest,rows) {
  const sizes=TABLES.map(table=>rows[table].length);
  if(sizes.every(n=>n===0)) return "FIRST_APPLY";
  if(TABLES.every(table=>rows[table].length===manifest.rows[table].length)) return "EXACT_REPLAY_CANDIDATE";
  refuse("UNEXPECTED_TARGET_RAG_COUNTS");
}
