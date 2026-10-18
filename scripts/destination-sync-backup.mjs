import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { readInputs, verifyProvider, expected } from './preflight-destination-production-sync.mjs';
const file='.cache/destination-sync/backup-receipt.json';
try {
 const inputs=readInputs(process.env);
 await verifyProvider(inputs);
 const api=async(path,method='GET')=>{
  const r=await fetch(`https://console.neon.tech/api/v2/projects/${expected.project}${path}`,{method,headers:{Authorization:`Bearer ${inputs.apiKey}`},redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!r.ok)throw new Error(`BACKUP_API_HTTP_${r.status}`);
  return r.json();
 };
 await mkdir('.cache/destination-sync',{recursive:true});
 let receipt;
 try {receipt=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(!receipt){
  // Persist intent before the single POST. An uncertain POST must be reconciled
  // against provider metadata, never retried automatically.
  receipt={project:expected.project,branch:expected.target.branch,name:'kltn-before-destination-sync-'+new Date().toISOString().replaceAll(/[:.]/g,'-'),status:'CREATE_INTENT',requestedAt:new Date().toISOString()};
  await writeFile(file,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
  const data=await api(`/branches/${expected.target.branch}/snapshot?name=${encodeURIComponent(receipt.name)}`,'POST');
  receipt.snapshot=data.snapshot;
  receipt.operations=(data.operations??[]).map(o=>({id:o.id,status:o.status,branch_id:o.branch_id}));
  receipt.status='CREATED_PENDING_VERIFICATION';
  await writeFile(file,JSON.stringify(receipt,null,2)+'\n');
 }
 if(receipt.project!==expected.project || receipt.branch!==expected.target.branch)throw new Error('BACKUP_RECEIPT_IDENTITY_MISMATCH');
 const list=await api('/snapshots');
 const snapshot=list.snapshots?.find(s=>s.id===receipt.snapshot?.id || s.name===receipt.name);
 if(!snapshot || snapshot.source_branch_id!==expected.target.branch || !snapshot.created_at)throw new Error('BACKUP_NOT_VERIFIED');
 const operations=[];
 for(const operation of receipt.operations??[]) operations.push((await api(`/operations/${operation.id}`)).operation);
 if(operations.some(o=>!o || o.status!=='finished'))throw new Error('BACKUP_OPERATION_NOT_FINISHED');
 receipt={...receipt,snapshot,operations:operations.map(o=>({id:o.id,status:o.status,branch_id:o.branch_id,updated_at:o.updated_at})),status:'VERIFIED_COMPLETE',verifiedAt:new Date().toISOString()};
 await writeFile(file,JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify(receipt,null,2));
}catch(error){console.error(JSON.stringify({status:'BACKUP_BLOCKED',code:/^[A-Z0-9_]+$/.test(error.message)?error.message:'BACKUP_FAILED_DETAILS_SUPPRESSED',productionBusinessWrites:0}));process.exitCode=1;}
