import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { canonical,sha,decodeVector,connection,PIN,TABLES } from "./rag-sync-lib.mjs";
import { validateReusable,selectedRows,conflictPlan } from "./rag-sync-validate.mjs";
import { assertManifest,manifestHash,atomicImport } from "./rag-sync-transaction.mjs";
import { backupPolicy,APPROVED_DOCUMENTS,APPROVED_COUNTS,assertTargetRowsForDirectApply } from "./rag-sync-backup-policy.mjs";
// PGlite's Date parser uses the host timezone; fixture-only normalization.
process.env.TZ="UTC";
const require=createRequire(import.meta.url), p=require("../.cache/rag-sync/processing.cjs");
const empty=()=>Object.fromEntries(TABLES.map(table=>[table,[]]));
function binary(values){const b=Buffer.alloc(4+values.length*4);b.writeUInt16BE(values.length,0);values.forEach((v,i)=>b.writeFloatBE(v,4+i*4));return b.toString('base64');}
async function fixture(){
  const rows=empty(), originals={};const timestamp="2026-10-18 00:00:00.000";
  for(let i=0;i<3;i++){
    const id=`synthetic_doc_${i}`,bytes=Buffer.from(`Invented migration fixture ${i}. This is not travel advice.`);originals[id]=bytes;
    const ext=(await p.extractDocument({format:"TXT",bytes:new Uint8Array(bytes)})).document;
    const chunk=p.chunkDocument(ext).chunks[0];const vector=Array.from({length:1536},(_,j)=>j===i?1:0);
    const versionInput={ragDocumentId:id,originalBytesHash:ext.originalBytesHash,normalizedContentHash:ext.normalizedContentHash,extractorVersion:ext.extractorVersion,normalizationVersion:ext.normalizationVersion};
    const version={id:`version_${i}`,...versionInput,identityHash:p.contentVersionIdentity(versionInput),createdAt:timestamp};
    const embeddingInput={chunkIndex:0,inputHash:chunk.textHash,vector,tokenCount:p.countEmbeddingTokens(chunk.text),provenance:p.EMBEDDING_PROVENANCE};
    const genInput={ragDocumentId:id,contentVersionId:version.id,chunkerVersion:chunk.chunkerVersion,chunkOptions:{maxChunkUtf16Units:1600,overlapUtf16Units:200},provenance:p.EMBEDDING_PROVENANCE,chunks:[chunk],embeddings:[embeddingInput]};
    const gen={id:`generation_${i}`,ragDocumentId:id,contentVersionId:version.id,generationKey:p.generationIdentity(genInput),chunkerVersion:chunk.chunkerVersion,chunkOptions:genInput.chunkOptions,embeddingProvider:"openai",embeddingModel:"text-embedding-3-small",embeddingDimensions:1536,tokenizer:"cl100k_base",tokenizerVersion:"js-tiktoken@1.0.21",expectedChunkCount:1,expectedTokenCount:embeddingInput.tokenCount,state:"READY",createdAt:timestamp,updatedAt:timestamp,readyAt:timestamp};
    rows.rag_document.push({id,originalFileName:`fixture_${i}.txt`,fileType:"TXT",mimeType:"text/plain",sizeBytes:bytes.length,storagePath:`rag/fixture/${i}.txt`,sourceTitle:"Synthetic fixture",sourceUrl:null,author:null,topic:null,locality:null,uploadedById:"development_actor_provenance",status:"INDEXED",publicQaApproved:true,createdAt:timestamp,updatedAt:timestamp});
    rows.rag_content_version.push(version);rows.rag_index_generation.push(gen);
    rows.rag_chunk.push({id:`chunk_${i}`,ragDocumentId:id,generationId:gen.id,...chunk,createdAt:timestamp});
    rows.rag_chunk_embedding.push({id:`embedding_${i}`,chunkId:`chunk_${i}`,inputHash:chunk.textHash,vectorHash:sha(canonical(vector)),tokenCount:embeddingInput.tokenCount,embedding:`[${vector.join(',')}]`,vectorBinary:binary(vector),createdAt:timestamp});
    rows.rag_index_publication.push({id:`publication_${i}`,ragDocumentId:id,generationId:gen.id,publishedAt:timestamp,updatedAt:timestamp});
  }
  const verified=[];for(const doc of rows.rag_document)verified.push(await validateReusable(doc,rows,originals[doc.id],p));
  const selected=selectedRows({rows},verified),manifest={status:"DRY_RUN_PASS",rows:selected,targetProtected:{},plan:conflictPlan(selected,empty())};manifest.planHash=manifestHash(manifest);
  return {rows,originals,verified,manifest};
}
test("correct pinned identity URLs only; swapped branches and inferred DATABASE_URL refused",()=>{
  const e={SYNC_SOURCE_DATABASE_URL:`postgresql://u:p@${PIN.source.endpoint}.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`};
  assert.equal(connection(e,"source").pathname,"/neondb");assert.throws(()=>connection(e,"target"));assert.throws(()=>connection({DATABASE_URL:e.SYNC_SOURCE_DATABASE_URL},"source"));
  assert.throws(()=>connection({...e,SYNC_SOURCE_DATABASE_URL:e.SYNC_SOURCE_DATABASE_URL.replace(PIN.source.endpoint,PIN.target.endpoint)},"source"));
});
test("binary vectors reject zero, wrong dimension and non-finite values",()=>{
  assert.throws(()=>decodeVector(binary(Array(1536).fill(0))));assert.throws(()=>decodeVector(binary([1,2])));
  const a=Array(1536).fill(0);a[0]=Infinity;assert.throws(()=>decodeVector(binary(a)));
});
test("complete published fixture verifies all hash/provenance links; approvals reset and actor preserved",async()=>{
  const f=await fixture();assert.equal(f.verified.length,3);assert.ok(f.manifest.rows.rag_document.every(d=>d.publicQaApproved===false&&d.uploadedById==='development_actor_provenance'));assert.equal(f.manifest.rows.rag_index_job.length,0);
});
const mutations={
  "missing embedding":f=>f.rows.rag_chunk_embedding.shift(),
  "partial generation":f=>f.rows.rag_index_generation[0].state="BUILDING",
  "broken publication":f=>f.rows.rag_index_publication[0].generationId="missing",
  "text hash mismatch":f=>f.rows.rag_chunk[0].text+="FORGED",
  "vector hash mismatch":f=>f.rows.rag_chunk_embedding[0].vectorHash="a".repeat(64),
  "input hash mismatch":f=>f.rows.rag_chunk_embedding[0].inputHash="b".repeat(64),
  "expected count mismatch":f=>f.rows.rag_index_generation[0].expectedChunkCount=2,
  "expected tokens mismatch":f=>f.rows.rag_index_generation[0].expectedTokenCount++,
  "model provenance mismatch":f=>f.rows.rag_index_generation[0].embeddingModel="different",
  "content version mismatch":f=>f.rows.rag_content_version[0].identityHash="c".repeat(64),
  "original byte mismatch":f=>f.originals[f.rows.rag_document[0].id][0]=90,
  "unfinished execution":f=>f.rows.rag_index_job.push({ragDocumentId:f.rows.rag_document[0].id,status:"UNKNOWN"}),
};
for(const [name,mutate] of Object.entries(mutations))test(name+" blocks reuse without repair",async()=>{const f=await fixture();mutate(f);await assert.rejects(validateReusable(f.rows.rag_document[0],f.rows,f.originals[f.rows.rag_document[0].id],p));});
test("conflicting ID is refused; identical rows replay without updates",async()=>{
  const f=await fixture();assert.equal(conflictPlan(f.manifest.rows,f.manifest.rows).expectedInserts,0);
  const t=structuredClone(f.manifest.rows);t.rag_document[0].sourceTitle="conflict";assert.equal(conflictPlan(f.manifest.rows,t).conflicts.length,1);
});
test("forged public approval and active jobs fail the manifest gate even with recomputed digest",async()=>{
  const f=await fixture();f.manifest.rows.rag_document[0].publicQaApproved=true;f.manifest.planHash=manifestHash(f.manifest);assert.throws(()=>assertManifest(f.manifest));
});
test("domain-origin links require separate relation review",async()=>{const f=await fixture();f.rows.rag_domain_origin.push({ragDocumentId:f.verified[0].documentId});assert.throws(()=>selectedRows({rows:f.rows},f.verified));});
test("active execution rows cannot enter manifest",async()=>{const f=await fixture();f.manifest.rows.rag_index_job.push({id:'queued',status:'QUEUED'});f.manifest.planHash=manifestHash(f.manifest);assert.throws(()=>assertManifest(f.manifest));});
test("manifest digest detects accidental edits",async()=>{const f=await fixture();f.manifest.rows.rag_document[0].sourceTitle='edited';assert.throws(()=>assertManifest(f.manifest));});

// Synthetic scope metadata only; real bytes/index integrity is validated separately.
async function waiverFixture(){
  const f=await fixture(),rows=empty(),verified=[];
  for(const [i,a]of APPROVED_DOCUMENTS.entries()){
    const doc={...f.manifest.rows.rag_document[i],id:a.id,originalFileName:a.name,fileType:"DOCX"};
    const version={...f.rows.rag_content_version[i],ragDocumentId:a.id,originalBytesHash:a.sha256};
    const gen={...f.rows.rag_index_generation[i],ragDocumentId:a.id,contentVersionId:version.id,expectedChunkCount:a.chunks};
    rows.rag_document.push(doc);rows.rag_content_version.push(version);rows.rag_index_generation.push(gen);
    for(let j=0;j<a.chunks;j++){const c={...f.rows.rag_chunk[i],id:`waiver_chunk_${i}_${j}`,ragDocumentId:a.id,generationId:gen.id,index:j};rows.rag_chunk.push(c);rows.rag_chunk_embedding.push({...f.rows.rag_chunk_embedding[i],id:`waiver_embedding_${i}_${j}`,chunkId:c.id});}
    rows.rag_index_publication.push({...f.rows.rag_index_publication[i],ragDocumentId:a.id,generationId:gen.id});
    verified.push({...f.verified[i],documentId:a.id,originalSha256:a.sha256,chunks:a.chunks,embeddings:a.chunks});
  }
  const manifest={checkedAt:new Date().toISOString(),status:"DRY_RUN_PASS",rows,verified,targetProtected:{},plan:conflictPlan(rows,empty())};manifest.planHash=manifestHash(manifest);
  const identities=["source","target"].map(side=>({side,project:PIN.project,...PIN[side],database:PIN.database,verified:true}));
  return {manifest,identities,expectedHash:manifest.planHash};
}
test("default backup policy refuses missing backup",async()=>{const f=await waiverFixture();assert.throws(()=>backupPolicy(f),/CURRENT_BACKUP_REQUIRED/);});
test("explicit scoped waiver records truthful exception without claiming backup verified",async()=>{const f=await waiverFixture();const r=backupPolicy({...f,acceptNoCurrentBackup:true});assert.equal(r.OWNER_BACKUP_WAIVER_ACCEPTED,true);assert.equal(r.backupVerified,false);assert.equal(r.CURRENT_PRODUCTION_BACKUP,'WAIVED_BY_OWNER');assert.equal(r.manifestHash,f.expectedHash);assert.equal(r.scope.length,3);});
test("waiver cannot bypass wrong Production target",async()=>{const f=await waiverFixture();f.identities[1].branch=PIN.source.branch;assert.throws(()=>backupPolicy({...f,acceptNoCurrentBackup:true}),/WRONG_TARGET/);});
test("waiver cannot bypass wrong manifest hash",async()=>{const f=await waiverFixture();assert.throws(()=>backupPolicy({...f,expectedHash:'wrong',acceptNoCurrentBackup:true}),/PLAN_HASH_MISMATCH/);});
for(const [name,mutate]of Object.entries({
  "fourth document":f=>f.manifest.rows.rag_document.push({...f.manifest.rows.rag_document[0],id:'fourth'}),
  "public QA true":f=>f.manifest.rows.rag_document[0].publicQaApproved=true,
  "updates requested":f=>f.manifest.plan.expectedUpdates=1,
  "deletes requested":f=>f.manifest.plan.expectedDeletes=1,
  "partial vectors":f=>f.manifest.rows.rag_chunk_embedding.pop(),
  "ID conflict":f=>f.manifest.plan.conflicts.push({id:'conflict'}),
})){test(`waiver refuses ${name}`,async()=>{const f=await waiverFixture();mutate(f);f.manifest.planHash=manifestHash(f.manifest);f.expectedHash=f.manifest.planHash;assert.throws(()=>backupPolicy({...f,acceptNoCurrentBackup:true}));});}
test("direct target counts accept only initial empty or full replay, not partial corpus",async()=>{const f=await waiverFixture();assert.equal(assertTargetRowsForDirectApply(f.manifest,empty()),'FIRST_APPLY');assert.equal(assertTargetRowsForDirectApply(f.manifest,f.manifest.rows),'EXACT_REPLAY_CANDIDATE');const partial=structuredClone(f.manifest.rows);partial.rag_chunk.pop();assert.throws(()=>assertTargetRowsForDirectApply(f.manifest,partial));assert.equal(Object.values(APPROVED_COUNTS).reduce((a,b)=>a+b,0),286);});

test("isolated PGlite PostgreSQL/pgvector: exact vectors, insert/replay, conflict, rollback and FK integrity",async(t)=>{
  const {PGlite}=require('../.cache/rag-sync/test-runtime/node_modules/@electric-sql/pglite');
  const {vector}=require('../.cache/rag-sync/test-runtime/node_modules/@electric-sql/pglite-pgvector');
  const db=new PGlite({extensions:{vector}});await db.exec('CREATE EXTENSION vector');
  const migrations=['20261008120000_add_rag_document','20261009120000_add_rag_index_generations','20261010120000_add_rag_index_jobs','20261017150000_add_rag_public_qa_permission'];
  for(const migration of migrations)await db.exec(await readFile(`packages/db/prisma/migrations/${migration}/migration.sql`,'utf8'));
  await db.exec('CREATE TABLE rag_domain_origin (id text PRIMARY KEY); CREATE TABLE protected_fixture (id text PRIMARY KEY, value text); INSERT INTO protected_fixture VALUES (\'preserve\',\'unchanged\')');
  const client={query:async(sql,args)=>{const r=await db.query(sql,args);return {...r,rowCount:r.affectedRows??r.rows.length};}};
  const readCurrent=async()=>{const rows=empty();for(const table of TABLES){const fields=table==='rag_chunk_embedding'?`*,encode(vector_send(embedding),'base64') AS "vectorBinary"`:'*';const result=await client.query(`SELECT ${fields} FROM "${table}" ORDER BY id`);rows[table]=result.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,v instanceof Date?v.toISOString().replace('T',' ').replace('Z',''):v])));}return rows;};
  const readProtected=async()=>({protected_fixture:(await client.query('SELECT count(*)::int AS count,md5(jsonb_agg(to_jsonb(t))::text) AS fingerprint FROM protected_fixture t')).rows[0]});
  const f=await fixture();f.manifest.targetProtected=await readProtected();f.manifest.planHash=manifestHash(f.manifest);
  try{
    await t.test('transaction rollback after injected partial insert',async()=>{
      await assert.rejects(atomicImport(client,f.manifest,readCurrent,readProtected,({inserted})=>{if(inserted===4)throw Error('INJECTED_TEST_FAILURE');}));assert.equal((await readCurrent()).rag_document.length,0);
    });
    await t.test('successful commit preserves actual binary vectors and public approval false',async()=>{
      const r=await atomicImport(client,f.manifest,readCurrent,readProtected);assert.equal(r.inserted,18);const now=await readCurrent();assert.deepEqual(Buffer.from(now.rag_chunk_embedding[0].vectorBinary,'base64'),Buffer.from(f.rows.rag_chunk_embedding[0].vectorBinary,'base64'));assert.ok(now.rag_document.every(d=>d.publicQaApproved===false));
    });
    await t.test('identical replay inserts zero',async()=>{const r=await atomicImport(client,f.manifest,readCurrent,readProtected);assert.equal(r.inserted,0);assert.equal(r.replayedRows,18);});
    await t.test('ID conflict rolls back and leaves original rows',async()=>{const bad=structuredClone(f.manifest);bad.rows.rag_document[0].sourceTitle='different';bad.planHash=manifestHash(bad);await assert.rejects(atomicImport(client,bad,readCurrent,readProtected),/TARGET_ID_CONFLICT/);assert.equal((await readCurrent()).rag_document[0].sourceTitle,'Synthetic fixture');});
    await t.test('changed protected rows refuse before import',async()=>{await client.query("UPDATE protected_fixture SET value='concurrent change'");await assert.rejects(atomicImport(client,f.manifest,readCurrent,readProtected),/PRODUCTION_CHANGED/);assert.equal((await readCurrent()).rag_document.length,3);});
    await t.test('PostgreSQL foreign key blocks a broken publication',async()=>{await assert.rejects(client.query('INSERT INTO rag_index_publication(id,"ragDocumentId","generationId","updatedAt") VALUES($1,$2,$3,$4)',['invalid','missing','missing','2026-10-18 00:00:00']));});
    await t.test('concurrent-import lock refusal happens before writes',async()=>{
      let inserts=0;const blocked={query:async(sql,args)=>{if(sql.includes('pg_try_advisory_xact_lock'))return {rows:[{acquired:false}]};if(sql.startsWith('INSERT'))inserts++;return client.query(sql,args);}};
      await assert.rejects(atomicImport(blocked,f.manifest,readCurrent,readProtected),/MIGRATION_ALREADY_RUNNING/);assert.equal(inserts,0);
    });
  }finally{await db.close();}
});
