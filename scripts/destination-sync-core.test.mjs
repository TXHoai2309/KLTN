import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildPlan,hash,insertPlan,transaction,tableAllowlist} from './destination-sync-core.mjs';
export function fixture(){
 const rows=Object.fromEntries([...tableAllowlist,'rag_domain_origin'].map(t=>[t,[]]));
 rows.destination=[{id:'d1',name:'Synthetic mountain',description:'Synthetic destination',latitude:23,longitude:105,visibility:'HIDDEN',contentRevision:7,createdAt:'2026-01-01 00:00:00.123',updatedAt:'2026-01-02 00:00:00.456',aliases:['Fixture alias']}];
 rows.opening_day=['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'].map((dayOfWeek,i)=>({id:'day'+i,destinationId:'d1',dayOfWeek,status:i===0?'OPEN':'UNKNOWN'}));
 rows.opening_interval=[{id:'i1',openingDayId:'day0',opensAtMinute:480,closesAtMinute:1080}];
 rows.content_source=[{id:'s1',destinationId:'d1',cultureId:null,title:'Synthetic source',websiteRights:'UNKNOWN',indexingRights:'REJECTED',openAiRights:'UNKNOWN',reviewedBy:null,reviewedAt:null,rightsEvidence:null}];
 rows.content_media=[{id:'m1',destinationId:'d1',cultureId:null,url:'https://example.org/photo.jpg',websiteRights:'REJECTED',isCover:true,storageReference:null}];
 rows.destination_editorial=[{destinationId:'d1',schemaVersion:1,draftRevision:5,publishedRevision:2,updatedBy:'dev-author',publishedBy:'dev-author',draft:{blocks:[{mediaIds:['m1'],sourceIds:['s1']}]},published:{blocks:[]},previousPublished:null}];
 const constraints=[{contype:'f',table_name:'"_AreaToDestination"',foreign_table:'content_area',definition:'FOREIGN KEY ("A") REFERENCES content_area(id)'},{contype:'f',table_name:'"_AreaToDestination"',foreign_table:'destination',definition:'FOREIGN KEY ("B") REFERENCES destination(id)'}];
 const source={rows,schemaHash:'matching',constraints};
 const target={rows:Object.fromEntries(Object.keys(rows).map(t=>[t,[]])),schemaHash:'matching'};
 return {snapshot:{source,target},selection:{ownerApproved:true,includeIds:['d1'],excludeIds:[]}};
}
test('field mapping, hidden state, rights, IDs and editorial actor provenance preserved without mutation',()=>{
 const {snapshot,selection}=fixture(),before=hash(snapshot);const plan=buildPlan(snapshot,selection);
 assert.equal(plan.status,'PASS');assert.equal(hash(snapshot),before);assert.deepEqual(plan.rows.destination,snapshot.source.rows.destination);
 assert.equal(plan.rows.content_source[0].indexingRights,'REJECTED');assert.equal(plan.rows.content_media[0].websiteRights,'REJECTED');assert.equal(plan.rows.destination_editorial[0].publishedBy,'dev-author');
 assert.equal(plan.expectedUpdates,0);assert.equal(plan.expectedDeletes,0);
});
test('dry-run is pure and idempotent replay has no inserts',()=>{
 const {snapshot,selection}=fixture();const p=buildPlan(snapshot,selection);snapshot.target.rows=structuredClone(p.rows);
 const replay=buildPlan(snapshot,selection);assert.equal(replay.status,'PASS');assert.equal(Object.values(replay.inserts).flat().length,0);
});
test('same ID with different content and unexpected target rows block rather than overwrite',()=>{
 const {snapshot,selection}=fixture();snapshot.target.rows.destination=[{...snapshot.source.rows.destination[0],name:'Changed'}];
 assert.ok(buildPlan(snapshot,selection).issues.some(i=>i.code==='ID_CONTENT_CONFLICT'));
 snapshot.target.rows.destination=[{...snapshot.source.rows.destination[0],id:'other'}];assert.ok(buildPlan(snapshot,selection).issues.some(i=>i.code==='UNEXPECTED_TARGET_DESTINATION'));
});
test('actual Area join catalog and explicit classification are required',()=>{
 const {snapshot,selection}=fixture();snapshot.source.constraints=[];assert.throws(()=>buildPlan(snapshot,selection),/CATALOG/);
 const f=fixture();f.selection.includeIds=[];assert.throws(()=>buildPlan(f.snapshot,f.selection),/UNCLASSIFIED/);
});
test('invalid hours and dangling media/source references block',()=>{
 const {snapshot,selection}=fixture();snapshot.source.rows.opening_interval[0].closesAtMinute=300;
 snapshot.source.rows.destination_editorial[0].draft.blocks[0].mediaIds=['missing'];const p=buildPlan(snapshot,selection);
 assert.ok(p.issues.some(i=>i.code==='INVALID_INTERVALS'));assert.ok(p.issues.some(i=>i.code==='DANGLING_EDITORIAL_REFERENCE'));
});
test('outside-scope Culture and RAG links deferred; no fake or private rows in insert plan',()=>{
 const {snapshot,selection}=fixture();snapshot.source.rows.culture_destination=[{cultureId:'c1',destinationId:'d1'}];snapshot.source.rows.rag_domain_origin=[{id:'r1',destinationId:'d1'}];
 const p=buildPlan(snapshot,selection);assert.equal(p.deferred.length,2);assert.equal(p.inserts.culture_destination.length,0);assert.equal(p.inserts.user,undefined);
});
test('bad upload markers block; historical AST warning preserves previousPublished JSON',()=>{
 const {snapshot,selection}=fixture();snapshot.source.rows.content_media[0].storageReference=JSON.stringify({websiteUse:'ADMIN_UPLOAD_V1',destinationId:'wrong'});
 snapshot.source.rows.destination_editorial[0].previousPublished={contentRef:'older-description'};
 const p=buildPlan(snapshot,selection,{mediaUsable:()=>false,contentRefs:()=>new Set()});
 assert.ok(p.issues.some(i=>i.code==='INVALID_UPLOAD_MARKER'));assert.ok(p.warnings.some(i=>i.code==='HISTORICAL_AST_REFERENCE_UNRESOLVED'));
 assert.deepEqual(p.rows.destination_editorial[0].previousPublished,{contentRef:'older-description'});
});
test('inserts use bound parameters and only fixed allowlisted tables; rollback on failure',async()=>{
 const {snapshot,selection}=fixture(),plan=buildPlan(snapshot,selection),queries=[];
 const db={query:async(sql,params)=>{queries.push({sql,params});if(sql.includes('"content_media"'))throw new Error('injected');}};
 await assert.rejects(transaction(db,()=>insertPlan(db,plan)),/injected/);assert.equal(queries.at(-1).sql,'ROLLBACK');assert.ok(!queries.some(q=>q.sql==='COMMIT'));
 assert.ok(queries.filter(q=>q.sql.startsWith('INSERT')).every(q=>q.sql.endsWith('$1::jsonb)')&&q.params.length===1));assert.ok(!queries.some(q=>/UPDATE |DELETE |TRUNCATE|"user"|"session"|"account"/.test(q.sql)));
});
test('lost COMMIT acknowledgement is UNKNOWN and must be reconciled by identical-plan verification',async()=>{
 const queries=[];const db={query:async sql=>{queries.push(sql);if(sql==='COMMIT')throw new Error('simulated lost acknowledgement');}};
 await assert.rejects(transaction(db,async()=>42),e=>e.syncWriteOutcome==='UNKNOWN');
 assert.deepEqual(queries,['BEGIN ISOLATION LEVEL SERIALIZABLE','COMMIT','ROLLBACK']);
});
