import { readFile, writeFile } from "node:fs/promises";
import { secrets, verifyIdentity, neon, PIN, refuse } from "./rag-sync-lib.mjs";

async function main() {
  if (process.argv[2] !== "--secrets" || !process.argv[3] || process.argv.length !== 4) refuse("BACKUP_ARGUMENTS_REQUIRED");
  const input = await secrets(process.argv[3]); await verifyIdentity(input);
  const manifest = JSON.parse(await readFile(".cache/rag-sync/manifest-private.json", "utf8"));
  if (manifest.status !== "DRY_RUN_PASS" || manifest.plan.conflicts.length) refuse("DRY_RUN_REQUIRED");
  const name = `kltn-before-rag-sync-${manifest.planHash.slice(0,16)}`;
  let receipt;
  try { receipt = JSON.parse(await readFile(".cache/rag-sync/backup-receipt.json", "utf8")); } catch { /* first invocation */ }
  const existing = (await neon(input, "/snapshots")).snapshots?.find(row => row.name === name);
  if (!receipt && existing) refuse("EXISTING_SNAPSHOT_RECEIPT_RECONCILIATION_REQUIRED");
  if (!receipt) {
    const result = await neon(input, `/branches/${PIN.target.branch}/snapshot?name=${encodeURIComponent(name)}`, "POST");
    receipt = { name, project: PIN.project, branch: PIN.target.branch, planHash: manifest.planHash, requestedAt: new Date().toISOString(),
      status: "PENDING", snapshot: result.snapshot, operations: (result.operations ?? []).map(row=>({id:row.id,status:row.status})) };
    await writeFile(".cache/rag-sync/backup-receipt.json", JSON.stringify(receipt,null,2)+"\n");
  }
  if (receipt.planHash !== manifest.planHash || receipt.branch !== PIN.target.branch || !receipt.snapshot?.id || !receipt.operations.length) refuse("BACKUP_RECEIPT_MISMATCH");
  for (let attempt=0;attempt<12;attempt++) {
    const operations=[];
    for (const row of receipt.operations) operations.push((await neon(input, `/operations/${row.id}`)).operation);
    if (operations.some(row=>["failed","cancelled","skipped"].includes(row?.status))) refuse("BACKUP_OPERATION_FAILED");
    if (operations.every(row=>row?.status==="finished")) { receipt.operations=operations.map(row=>({id:row.id,status:row.status,updated_at:row.updated_at})); break; }
    await new Promise(resolve=>setTimeout(resolve,2000));
  }
  const snapshot = (await neon(input, "/snapshots")).snapshots?.find(row=>row.id===receipt.snapshot.id);
  if (!snapshot || snapshot.source_branch_id!==PIN.target.branch || snapshot.name!==name || !snapshot.created_at || receipt.operations.some(row=>row.status!=="finished")) refuse("BACKUP_NOT_VERIFIED");
  if (Date.parse(snapshot.created_at)<Date.parse(manifest.checkedAt)-60000) refuse("BACKUP_PRECEDES_MANIFEST");
  receipt={...receipt,snapshot:{id:snapshot.id,name:snapshot.name,source_branch_id:snapshot.source_branch_id,created_at:snapshot.created_at,manual:snapshot.manual},status:"VERIFIED_COMPLETE",verifiedAt:new Date().toISOString(),
    recovery:"Restore this snapshot into a NEW isolated recovery branch, verify RAG and preserved business fingerprints, then obtain an owner-approved recovery/cutover decision. Never restore over or reset Production automatically."};
  await writeFile(".cache/rag-sync/backup-receipt.json",JSON.stringify(receipt,null,2)+"\n");
  await writeFile("docs/implementation/rag-sync-evidence/backup.json",JSON.stringify(receipt,null,2)+"\n");
  console.log(JSON.stringify(receipt,null,2));
}
main().catch(error=>{const code=/^[A-Z0-9_]{1,80}$/.test(error?.message||"")?error.message:"DETAILS_SUPPRESSED";console.error(`BACKUP_GATE_FAILED:${code}`);process.exitCode=1;});
