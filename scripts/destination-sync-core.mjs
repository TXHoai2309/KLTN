import { createHash } from 'node:crypto';
export const quote = name => '"'+name.replaceAll('"','""')+'"';
export const canonical = value => JSON.stringify(value, function(key,item){
 if(item && typeof item==='object' && !Array.isArray(item)) return Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b)));
 return item;
});
export const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
export const identity = (table,row) => table==='destination_editorial'?row.destinationId:table==='_AreaToDestination'?`${row.A}/${row.B}`:table==='culture_destination'?`${row.cultureId}/${row.destinationId}`:row.id;
export const tableAllowlist = ['content_area','destination','opening_day','opening_interval','content_source','content_media','_AreaToDestination','destination_editorial','culture_destination'];
const fail = code => {throw new Error(code);};
export function buildPlan(snapshot,selection,validators={}) {
 if(!selection?.ownerApproved || !Array.isArray(selection.includeIds) || !Array.isArray(selection.excludeIds)) fail('OWNER_SELECTION_REQUIRED');
 const source=snapshot.source.rows,target=snapshot.target.rows;
 const include=new Set(selection.includeIds),excluded=new Set(selection.excludeIds);
 if(include.size!==selection.includeIds.length || [...include].some(id=>excluded.has(id)))fail('INVALID_SELECTION');
 if(source.destination.some(d=>!include.has(d.id)&&!excluded.has(d.id)) || [...include].some(id=>!source.destination.some(d=>d.id===id)))fail('UNCLASSIFIED_DESTINATIONS');
 if(snapshot.source.schemaHash!==snapshot.target.schemaHash)fail('SCHEMA_PARITY_FAILURE');
 const joinFks=snapshot.source.constraints.filter(c=>c.contype==='f' && c.table_name.replaceAll('"','')==='_AreaToDestination');
 if(!joinFks.some(c=>c.foreign_table==='content_area'&&c.definition.startsWith('FOREIGN KEY ("A")')) || !joinFks.some(c=>c.foreign_table==='destination'&&c.definition.startsWith('FOREIGN KEY ("B")')))fail('AREA_JOIN_CATALOG_MISMATCH');
 const rows={destination:source.destination.filter(r=>include.has(r.id)),opening_day:source.opening_day.filter(r=>include.has(r.destinationId)),content_source:source.content_source.filter(r=>include.has(r.destinationId)),content_media:source.content_media.filter(r=>include.has(r.destinationId)),destination_editorial:source.destination_editorial.filter(r=>include.has(r.destinationId)),_AreaToDestination:source._AreaToDestination.filter(r=>include.has(r.B))};
 const days=new Set(rows.opening_day.map(r=>r.id)),areas=new Set(rows._AreaToDestination.map(r=>r.A));
 rows.opening_interval=source.opening_interval.filter(r=>days.has(r.openingDayId));
 rows.content_area=source.content_area.filter(r=>areas.has(r.id));
 rows.culture_destination=[];
 const warnings=[],deferred=[],issues=[];
 const weekdays=['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'];
 for(const d of rows.destination){
  if(/(?:\btest\b|fixture|nghiệm thu)/iu.test(d.name+' '+d.description))issues.push({code:'POSSIBLE_FIXTURE_SELECTED',id:d.id});
  if(!['VISIBLE','HIDDEN'].includes(d.visibility))issues.push({code:'BAD_VISIBILITY',id:d.id});
  if(!Number.isFinite(d.latitude)||!Number.isFinite(d.longitude)||Math.abs(d.latitude)>90||Math.abs(d.longitude)>180)issues.push({code:'INVALID_COORDINATES',id:d.id});
  const opening=rows.opening_day.filter(r=>r.destinationId===d.id);
  if(opening.length!==7||new Set(opening.map(r=>r.dayOfWeek)).size!==7||opening.some(r=>!weekdays.includes(r.dayOfWeek)))issues.push({code:'INVALID_WEEK',id:d.id});
  for(const day of opening){
   const intervals=rows.opening_interval.filter(r=>r.openingDayId===day.id).sort((a,b)=>a.opensAtMinute-b.opensAtMinute);
   if(!['OPEN','CLOSED','UNKNOWN'].includes(day.status)||(day.status==='OPEN'?intervals.length===0:intervals.length!==0)||intervals.some((r,i)=>!Number.isInteger(r.opensAtMinute)||!Number.isInteger(r.closesAtMinute)||r.opensAtMinute<0||r.closesAtMinute>1440||r.opensAtMinute>=r.closesAtMinute||i>0&&intervals[i-1].closesAtMinute>r.opensAtMinute))issues.push({code:'INVALID_INTERVALS',id:day.id});
  }
  const media=rows.content_media.filter(r=>r.destinationId===d.id),sources=rows.content_source.filter(r=>r.destinationId===d.id);
  if(media.filter(r=>r.isCover).length>1)issues.push({code:'DUPLICATE_COVER',id:d.id});
  for(const row of [...media,...sources]){
   if(row.cultureId!==null)issues.push({code:'CROSS_OWNER_CONTENT',id:row.id});
   for(const key of ['websiteRights','indexingRights','openAiRights'].filter(k=>k in row)){
    if(!['APPROVED','UNKNOWN','REJECTED'].includes(row[key]))issues.push({code:'INVALID_RIGHTS',id:row.id,key});
    if(row[key]==='APPROVED'&&(!row.rightsEvidence||!row.reviewedBy||!row.reviewedAt))issues.push({code:'APPROVED_WITHOUT_EVIDENCE',id:row.id,key});
    if(row[key]!=='APPROVED')warnings.push({code:'RIGHTS_PRESERVED',id:row.id,key,status:row[key]});
   }
  }
  for(const m of media){
   let marker;try{marker=JSON.parse(m.storageReference);}catch{}
   if(marker?.websiteUse==='ADMIN_UPLOAD_V1' && (!validators.mediaUsable?.(m,d.id)||marker.destinationId!==d.id))issues.push({code:'INVALID_UPLOAD_MARKER',id:m.id});
  }
  const e=rows.destination_editorial.find(r=>r.destinationId===d.id);
  for(const field of ['draft','published','previousPublished']) if(e?.[field]) {
   if(validators.editorialValid && !validators.editorialValid(e[field]))issues.push({code:'INVALID_EDITORIAL_LAYOUT',id:d.id,field});
   const visit=node=>{
    if(!node||typeof node!=='object')return;
    for(const [key,value] of Object.entries(node)){
     const wanted=key==='mediaIds'?media:key==='sourceIds'?sources:null;
     if(wanted&&(!Array.isArray(value)||value.some(id=>!wanted.some(r=>r.id===id))))issues.push({code:'DANGLING_EDITORIAL_REFERENCE',id:d.id,field,key});
     if(key==='destinationId'&&value!==d.id)issues.push({code:'CROSS_DESTINATION_EDITORIAL_REFERENCE',id:d.id,field});
     if(key==='contentRef'&&typeof value==='string'){
      if(validators.contentRefs && !validators.contentRefs({...d,media,sources}).has(value)){
       // Historical layouts can reference an older description AST. Preserve
       // that immutable provenance and report it; current draft/public layouts
       // must resolve against the current canonical Destination content.
       (field==='previousPublished'?warnings:issues).push({code:field==='previousPublished'?'HISTORICAL_AST_REFERENCE_UNRESOLVED':'DANGLING_AST_REFERENCE',id:d.id,field,value});
      }
     }
     visit(value);
    }
   };visit(e[field]);
  }
 }
 for(const link of source.culture_destination.filter(r=>include.has(r.destinationId)))deferred.push({table:'culture_destination',destinationId:link.destinationId,reason:'CULTURE_OUTSIDE_TRANSFER_SCOPE',cultureId:link.cultureId});
 for(const link of source.rag_domain_origin.filter(r=>include.has(r.destinationId)))deferred.push({table:'rag_domain_origin',destinationId:link.destinationId,reason:'RAG_OUTSIDE_TRANSFER_SCOPE'});
 const incomingNames=new Map();
 for(const d of rows.destination){const key=d.name.normalize('NFC').trim().toLocaleLowerCase('vi');if(incomingNames.has(key))warnings.push({code:'OWNER_APPROVED_DUPLICATE_NAME',ids:[incomingNames.get(key),d.id]});incomingNames.set(key,d.id);}
 const inserts={},replays={};
 for(const table of tableAllowlist){
  inserts[table]=[];replays[table]=[];
  const existing=new Map((target[table]??[]).map(r=>[identity(table,r),r]));
  for(const row of rows[table]??[]){
   const id=identity(table,row),old=existing.get(id);
   if(old){if(hash(old)!==hash(row))issues.push({code:'ID_CONTENT_CONFLICT',table,id});else replays[table].push(id);}
   else {
    if(table==='content_area'&&(target.content_area??[]).some(r=>r.name===row.name))issues.push({code:'AREA_NAME_CONFLICT',id});
    if(table==='destination'&&(target.destination??[]).some(r=>r.name.normalize('NFC').trim().toLocaleLowerCase('vi')===row.name.normalize('NFC').trim().toLocaleLowerCase('vi')))issues.push({code:'TARGET_NAME_CONFLICT',id});
    inserts[table].push(row);
   }
  }
 }
 const allowedIds=new Set(rows.destination.map(r=>r.id));
 if((target.destination??[]).some(d=>!allowedIds.has(d.id)))issues.push({code:'UNEXPECTED_TARGET_DESTINATION'});
 const plan={status:issues.length?'BLOCKED':'PASS',rows,inserts,replays,issues,warnings,deferred,expectedUpdates:0,expectedDeletes:0};
 plan.sourceHash=hash(rows);plan.planHash=hash({sourceHash:plan.sourceHash,selection,schemaHash:snapshot.source.schemaHash});
 return plan;
}
export async function insertPlan(db,plan){
 if(plan.status!=='PASS')fail('PLAN_BLOCKED');
 for(const table of tableAllowlist) for(const row of plan.inserts[table]??[]) {
  // Complete named fields, JSON/arrays/enums and timestamps are cast by the
  // actual table composite type. No defaults, upsert, update or delete path.
  await db.query(`INSERT INTO public.${quote(table)} SELECT * FROM jsonb_populate_record(NULL::public.${quote(table)},$1::jsonb)`,[JSON.stringify(row)]);
 }
}
export async function transaction(db,work){
 await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
 let phase='WORK';
 try {const value=await work();phase='COMMIT';await db.query('COMMIT');return value;}
 catch(error){try{await db.query('ROLLBACK');}catch{} if(phase==='COMMIT')error.syncWriteOutcome='UNKNOWN';throw error;}
}
