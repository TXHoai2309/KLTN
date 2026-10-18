import { createRequire } from 'node:module';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { delimiter } from 'node:path';
import { readInputs,verifyProvider,expected } from './preflight-destination-production-sync.mjs';
import { buildPlan,hash,quote,tableAllowlist,insertPlan,transaction } from './destination-sync-core.mjs';
const require=createRequire(import.meta.url);
const {Client,types}=require('pg');
types.setTypeParser(1114,value=>value);types.setTypeParser(1184,value=>value);
const fail=code=>{throw new Error(code);};
const cache='.cache/destination-sync';
const json=async path=>JSON.parse(await readFile(path,'utf8'));
const save=async(name,value)=>writeFile(`${cache}/${name}.json`,JSON.stringify(value,null,2)+'\n');
const refresh=()=>{const result=spawnSync(process.execPath,['scripts/destination-sync-inventory.mjs'],{encoding:'utf8',env:process.env,timeout:120000});if(result.status!==0)fail('FRESH_INVENTORY_FAILED');};
async function compileValidators(){
 await require('esbuild').build({stdin:{contents:`export {editorialLayoutSchema} from './apps/web/src/modules/destination-editorial/editorial-contract.ts'; export {isDestinationMediaUsable} from './apps/web/src/modules/destination/destination-media-eligibility.ts'; export {buildEditorialContentUnits} from './apps/web/src/modules/destination-editorial/editorial-content-units.ts';`,resolveDir:process.cwd(),sourcefile:'sync-validators.ts'},nodePaths:(process.env.NODE_PATH??'').split(delimiter).filter(Boolean),tsconfigRaw:{compilerOptions:{}},bundle:true,format:'esm',platform:'node',outfile:`${cache}/validators.mjs`});
 const v=await import(`../${cache}/validators.mjs?${Date.now()}`);
 return {editorialValid:x=>v.editorialLayoutSchema.safeParse(x).success,mediaUsable:v.isDestinationMediaUsable,contentRefs:context=>new Set(v.buildEditorialContentUnits(context).units.map(u=>u.id))};
}
async function backupGate(inputs){
 const receipt=await json(`${cache}/backup-receipt.json`);
 if(receipt.status!=='VERIFIED_COMPLETE'||receipt.project!==expected.project||receipt.branch!==expected.target.branch||!receipt.snapshot?.id)fail('BACKUP_RECEIPT_NOT_VERIFIED');
 const get=async path=>{const r=await fetch(`https://console.neon.tech/api/v2/projects/${expected.project}${path}`,{headers:{Authorization:`Bearer ${inputs.apiKey}`},redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)fail('BACKUP_RECHECK_HTTP_FAILURE');return r.json();};
 const snapshots=(await get('/snapshots')).snapshots;
 const snapshot=snapshots?.find(s=>s.id===receipt.snapshot.id);
 if(snapshot?.source_branch_id!==expected.target.branch||!snapshot.created_at||snapshot.expires_at&&Date.parse(snapshot.expires_at)<=Date.now())fail('BACKUP_RECHECK_FAILURE');
 for(const op of receipt.operations??[])if((await get(`/operations/${op.id}`)).operation?.status!=='finished')fail('BACKUP_OPERATION_INCOMPLETE');
 return {id:snapshot.id,branch:snapshot.source_branch_id,createdAt:snapshot.created_at,verifiedAt:new Date().toISOString()};
}
async function targetRows(db){
 const rows={};
 for(const table of tableAllowlist)rows[table]=(await db.query(`SELECT * FROM public.${quote(table)} ORDER BY 1`)).rows;
 return rows;
}
async function excludedFingerprints(db,snapshot){
 const result={};
 for(const table of Object.keys(snapshot.target.excluded)){
  const safe={user:['id','role','status','lockedAt','createdAt','updatedAt'],session:['id','userId','expiresAt','createdAt','updatedAt'],account:['id','userId','providerId','accountId','createdAt','updatedAt'],verification:['id','createdAt','updatedAt']}[table];
  const projection=safe?`jsonb_build_array(${safe.map(c=>'t.'+quote(c)).join(',')})::text`:'to_jsonb(t)::text';
  result[table]=(await db.query(`SELECT count(*)::int AS count,md5(coalesce(string_agg(md5(${projection}),'' ORDER BY md5(${projection})),'')) AS fingerprint FROM public.${quote(table)} t`)).rows[0];
 }
 return result;
}
try{
 const mode=process.argv[2];if(process.argv.length!==3||!['--dry-run','--apply','--verify','--report'].includes(mode))fail('INVALID_MODE');
 const inputs=readInputs(process.env);const identities=await verifyProvider(inputs);
 await mkdir(cache,{recursive:true});
 const selection=await json(`${cache}/selection.json`);
 const validators=await compileValidators();
 refresh();const snapshot=await json(`${cache}/inventory-private.json`);
 let plan=buildPlan(snapshot,selection,validators);
 const summary=()=>({checkedAt:new Date().toISOString(),mode,identities,status:plan.status,sourceCount:snapshot.source.rows.destination.length,eligibleCount:plan.rows.destination.length,visible:plan.rows.destination.filter(d=>d.visibility==='VISIBLE').length,hidden:plan.rows.destination.filter(d=>d.visibility==='HIDDEN').length,targetCount:snapshot.target.rows.destination.length,expectedInserts:Object.fromEntries(Object.entries(plan.inserts).map(([t,r])=>[t,r.length])),expectedUpdates:0,expectedDeletes:0,replays:Object.fromEntries(Object.entries(plan.replays).map(([t,r])=>[t,r.length])),issues:plan.issues,rightsWarnings:plan.warnings.length,deferred:plan.deferred,sourceHash:plan.sourceHash,planHash:plan.planHash});
 await save('latest-plan-private',plan);
 if(mode==='--dry-run'||mode==='--report'){
  await save('dry-run',summary());console.log(JSON.stringify(summary(),null,2));if(plan.status!=='PASS')process.exitCode=1;
 }else if(mode==='--verify'){
  let applied;try{applied=await json(`${cache}/applied.json`);}catch(e){if(e.code!=='ENOENT')throw e;applied=await json(`${cache}/prepared.json`);}
  const missing=Object.values(plan.inserts).reduce((n,r)=>n+r.length,0);
  if(plan.status!=='PASS'||missing||applied.sourceHash!==plan.sourceHash)fail('POST_IMPORT_CONTENT_VERIFICATION_FAILED');
  const preservation=Object.fromEntries(Object.entries(snapshot.target.excluded).map(([table,value])=>[table,hash(value)===hash(applied.excludedBefore[table])]));
  const result={...summary(),status:Object.values(preservation).every(Boolean)?'PASS':'BLOCKED',preservation,missingRows:missing,allCanonicalRowsEqual:true};
  await save('verification',result);console.log(JSON.stringify(result,null,2));if(result.status!=='PASS')process.exitCode=1;
 }else{
  if(plan.status!=='PASS')fail('PLAN_BLOCKED');
  const approved=await json(`${cache}/dry-run.json`);
  if(approved.status!=='PASS'||approved.planHash!==plan.planHash)fail('DRY_RUN_CHANGED');
  const mediaChecks=await json(`${cache}/media-checks.json`);
  if(Date.now()-Date.parse(mediaChecks.checkedAt)>3600000||plan.rows.content_media.some(m=>!mediaChecks.results.some(r=>r.id===m.id&&r.status===200&&r.image)))fail('MEDIA_CHECKS_NOT_VERIFIED');
  const backup=await backupGate(inputs);
  const db=new Client({connectionString:inputs.target.value,connectionTimeoutMillis:15000,application_name:'kltn-destination-sync-apply'});
  await db.connect();let committed=false;let record;
  const transactionDeadline=setTimeout(()=>{db.end().catch(()=>{});},60000);
  try{
   record=await transaction(db,async()=>{
    await db.query("SET LOCAL statement_timeout='30000ms'");await db.query("SET LOCAL lock_timeout='5000ms'");await db.query("SET LOCAL idle_in_transaction_session_timeout='30000ms'");
    if(!(await db.query('SELECT pg_try_advisory_xact_lock(751204,280018) AS acquired')).rows[0].acquired)fail('CONCURRENT_SYNC_REFUSED');
    await db.query(`LOCK TABLE ${[...tableAllowlist].sort().map(t=>'public.'+quote(t)).join(',')} IN SHARE ROW EXCLUSIVE MODE`);
    const ledger=(await db.query('SELECT migration_name,checksum,finished_at,rolled_back_at,applied_steps_count FROM public._prisma_migrations ORDER BY migration_name')).rows;
    if(hash(ledger)!==hash(snapshot.target.ledger))fail('TARGET_LEDGER_CHANGED');
    const current=await targetRows(db);
    const fresh=buildPlan({...snapshot,target:{...snapshot.target,rows:{...snapshot.target.rows,...current}}},selection,validators);
    if(fresh.status!=='PASS'||hash(fresh.inserts)!==hash(plan.inserts))fail('TARGET_CHANGED_BEFORE_WRITE');
    const excludedBefore=await excludedFingerprints(db,snapshot);
    await insertPlan(db,fresh);
    const after=await targetRows(db);
    const replay=buildPlan({...snapshot,target:{...snapshot.target,rows:{...snapshot.target.rows,...after}}},selection,validators);
    if(replay.status!=='PASS'||Object.values(replay.inserts).some(r=>r.length)){
     await save('integrity-failure-private',{issues:replay.issues,after,expected:plan.rows});
     fail('IN_TRANSACTION_INTEGRITY_FAILURE');
    }
    const excludedAfter=await excludedFingerprints(db,snapshot);
    if(hash(excludedBefore)!==hash(excludedAfter))fail('UNRELATED_TABLE_CHANGED');
    const prepared={preparedAt:new Date().toISOString(),sourceHash:plan.sourceHash,planHash:plan.planHash,backup,inserted:Object.fromEntries(Object.entries(fresh.inserts).map(([t,r])=>[t,r.length])),excludedBefore,excludedAfter,allCanonicalRowsEqual:true,excludedTablesUnchanged:true};
    let previous;try{previous=await json(`${cache}/prepared.json`);}catch(e){if(e.code!=='ENOENT')throw e;}
    if(previous&&previous.planHash!==plan.planHash)fail('PREVIOUS_ATTEMPT_PLAN_CHANGED');
    if(!previous)await save('prepared',prepared);
    return prepared;
   });committed=true;
  }finally{clearTimeout(transactionDeadline);await db.end();}
  if(committed){
   // A replay must not replace the first run's before-state evidence.
   let original;try{original=await json(`${cache}/applied.json`);}catch(e){if(e.code!=='ENOENT')throw e;}
   if(!original)await save('applied',{...await json(`${cache}/prepared.json`),confirmedAt:new Date().toISOString()});else await save('replay',record);
   console.log(JSON.stringify({status:'COMMITTED',inserted:record.inserted,allCanonicalRowsEqual:true,excludedTablesUnchanged:true,backup},null,2));
  }
 }
}catch(error){console.error(JSON.stringify({status:error.syncWriteOutcome==='UNKNOWN'?'UNKNOWN':'BLOCKED',code:/^[A-Z0-9_]+$/.test(error.message)?error.message:'SYNC_FAILURE_DETAILS_SUPPRESSED',sqlState:/^[A-Z0-9]{5}$/.test(error.code??'')?error.code:undefined,recovery:'RERUN_VERIFY_THEN_IDENTICAL_SELECTION_AND_PLAN_ONLY'}));process.exitCode=1;}
