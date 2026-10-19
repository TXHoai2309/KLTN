import { createRequire } from 'node:module';
import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readInputs, verifyProvider } from './preflight-destination-production-sync.mjs';
const { Client, types } = createRequire(import.meta.url)('pg');
// Keep PostgreSQL wall-clock timestamps and sub-millisecond precision exact.
// Parsing timestamp-without-time-zone through a JS Date can shift its value.
types.setTypeParser(1114,value=>value);
types.setTypeParser(1184,value=>value);
const quote = value => '"' + value.replaceAll('"', '""') + '"';
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const inputs = readInputs(process.env);
try {
 const identities = await verifyProvider(inputs);
 const localLedger = [];
 for (const name of (await readdir('packages/db/prisma/migrations')).filter(n => /^\d{14}_/.test(n)).sort()) {
  const sql=await readFile(`packages/db/prisma/migrations/${name}/migration.sql`,'utf8');
  localLedger.push({name,checksum:createHash('sha256').update(sql).digest('hex'),lfChecksum:createHash('sha256').update(sql.replaceAll('\r\n','\n')).digest('hex')});
 }
 const all = {checkedAt:new Date().toISOString(),identities,localLedger};
 for (const side of ['source','target']) {
  const db = new Client({connectionString:inputs[side].value,connectionTimeoutMillis:15000,application_name:'kltn-destination-sync-readonly'});
  await db.connect();
  try {
   await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   await db.query("SET LOCAL statement_timeout = '20000ms'");
   const ledger = (await db.query('SELECT migration_name,checksum,finished_at,rolled_back_at,applied_steps_count FROM public._prisma_migrations ORDER BY migration_name')).rows;
   const ledgerIssues=ledger.filter((r,i)=>r.migration_name!==localLedger[i]?.name || ![localLedger[i]?.checksum,localLedger[i]?.lfChecksum].includes(r.checksum) || !r.finished_at || r.rolled_back_at).map(r=>({name:r.migration_name,finished:Boolean(r.finished_at),rolledBack:Boolean(r.rolled_back_at),matchesLocalChecksum:localLedger.some(l=>l.name===r.migration_name && [l.checksum,l.lfChecksum].includes(r.checksum))}));
   if (ledger.length !== localLedger.length || ledgerIssues.length) { console.log(JSON.stringify({side,ledgerCount:ledger.length,repositoryCount:localLedger.length,ledgerIssues})); throw new Error('LEDGER_PARITY_FAILURE'); }
   const columns=(await db.query("SELECT table_name,column_name,ordinal_position,data_type,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position")).rows;
   const constraints=(await db.query("SELECT c.conrelid::regclass::text AS table_name,c.conname,c.contype,c.confrelid::regclass::text AS foreign_table,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' ORDER BY 1,2")).rows;
   const indexes=(await db.query("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY 1,2")).rows;
   const triggers=(await db.query("SELECT t.tgrelid::regclass::text AS table_name,t.tgname,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY 1,2")).rows;
   const rows={};
   for (const table of ['destination','opening_day','opening_interval','content_source','content_media','destination_editorial','content_area','culture_destination','rag_domain_origin']) {
    let where='';
    if (['content_source','content_media','rag_domain_origin'].includes(table)) where=' WHERE "destinationId" IS NOT NULL';
    rows[table]=(await db.query(`SELECT * FROM public.${quote(table)}${where} ORDER BY 1`)).rows;
   }
   const joins=[...new Set(constraints.filter(c=>c.contype==='f' && /(?:^|\.)destination$/.test(c.foreign_table)).map(c=>c.table_name.replaceAll('"','')))].filter(t=>t.startsWith('_'));
   for(const table of joins) rows[table]=(await db.query(`SELECT * FROM public.${quote(table)} ORDER BY 1,2`)).rows;
   const excluded={};
   for (const table of [...new Set(columns.map(c=>c.table_name))].filter(t=>!Object.hasOwn(rows,t))) {
    // Hash only explicit noncredential columns for auth tables. Other tables are
    // hashed wholly in PostgreSQL; no raw excluded rows leave the server.
    const safe={user:['id','role','status','lockedAt','createdAt','updatedAt'],session:['id','userId','expiresAt','createdAt','updatedAt'],account:['id','userId','providerId','accountId','createdAt','updatedAt'],verification:['id','createdAt','updatedAt']}[table];
    const projection=safe ? `jsonb_build_array(${safe.map(c=>'t.'+quote(c)).join(',')})::text` : 'to_jsonb(t)::text';
    excluded[table]=(await db.query(`SELECT count(*)::int AS count, md5(coalesce(string_agg(md5(${projection}),'' ORDER BY md5(${projection})),'')) AS fingerprint FROM public.${quote(table)} t`)).rows[0];
   }
   const activeAdminCount=(await db.query('SELECT count(*)::int AS count FROM public."user" WHERE role=\'ADMIN\' AND status=\'ACTIVE\'')).rows[0].count;
   await db.query('COMMIT');
   all[side]={ledger,columns,constraints,indexes,triggers,schemaHash:digest({columns,constraints,indexes,triggers}),rows,excluded,activeAdminCount};
  } finally { await db.end(); }
 }
 await mkdir('.cache/destination-sync',{recursive:true});
 await writeFile('.cache/destination-sync/inventory-private.json',JSON.stringify(all,null,2)+'\n');
 const summary={checkedAt:all.checkedAt,identities,schemaParity:all.source.schemaHash===all.target.schemaHash,sourceMigrations:all.source.ledger.length,targetMigrations:all.target.ledger.length,
 sourceCounts:Object.fromEntries(Object.entries(all.source.rows).map(([k,v])=>[k,v.length])),targetCounts:Object.fromEntries(Object.entries(all.target.rows).map(([k,v])=>[k,v.length])),targetActiveAdmins:all.target.activeAdminCount,
 sourceDestinations:all.source.rows.destination.map(d=>({id:d.id,name:d.name,visibility:d.visibility,locationVerified:d.locationVerified})),targetExcluded:all.target.excluded};
 console.log(JSON.stringify(summary,null,2));
 await writeFile('.cache/destination-sync/inventory-summary.json',JSON.stringify(summary,null,2)+'\n');
} catch(error) { console.error(JSON.stringify({status:'BLOCKED',code:/^[A-Z_]+$/.test(error.message)?error.message:'INVENTORY_FAILED_DETAILS_SUPPRESSED',sqlState:/^[A-Z0-9]{5}$/.test(error.code??'')?error.code:undefined}));process.exitCode=1; }
