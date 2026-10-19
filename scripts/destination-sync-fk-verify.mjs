import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {readInputs,verifyProvider} from './preflight-destination-production-sync.mjs';
import {quote} from './destination-sync-core.mjs';
try{
 const inputs=readInputs(process.env);await verifyProvider(inputs);
 const {Client}=createRequire(import.meta.url)('pg');const db=new Client({connectionString:inputs.target.value,connectionTimeoutMillis:15000});await db.connect();
 try{
  await db.query('BEGIN READ ONLY');await db.query("SET LOCAL statement_timeout='15000ms'");
  const fks=(await db.query(`SELECT c.conname,cl.relname AS child,pr.relname AS parent,array_agg(ca.attname::text ORDER BY ck.i) AS child_columns,array_agg(pa.attname::text ORDER BY ck.i) AS parent_columns FROM pg_constraint c JOIN pg_class cl ON cl.oid=c.conrelid JOIN pg_class pr ON pr.oid=c.confrelid JOIN pg_namespace ns ON ns.oid=cl.relnamespace JOIN LATERAL unnest(c.conkey) WITH ORDINALITY ck(attnum,i) ON true JOIN pg_attribute ca ON ca.attrelid=c.conrelid AND ca.attnum=ck.attnum JOIN pg_attribute pa ON pa.attrelid=c.confrelid AND pa.attnum=c.confkey[ck.i] WHERE c.contype='f' AND ns.nspname='public' GROUP BY c.oid,cl.relname,pr.relname ORDER BY c.conname`)).rows;
  const results=[];
  for(const fk of fks){
   const where=fk.child_columns.map((c,i)=>`c.${quote(c)}=p.${quote(fk.parent_columns[i])}`).join(' AND '),nonnull=fk.child_columns.map(c=>`c.${quote(c)} IS NOT NULL`).join(' AND ');
   const count=(await db.query(`SELECT count(*)::int AS n FROM public.${quote(fk.child)} c WHERE ${nonnull} AND NOT EXISTS (SELECT 1 FROM public.${quote(fk.parent)} p WHERE ${where})`)).rows[0].n;
   results.push({constraint:fk.conname,dangling:count});
  }
  await db.query('COMMIT');const report={checkedAt:new Date().toISOString(),status:results.every(r=>r.dangling===0)?'PASS':'FAIL',foreignKeys:results.length,results};
  await writeFile('docs/implementation/destination-sync-evidence/foreign-keys.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,foreignKeys:report.foreignKeys}));if(report.status!=='PASS')process.exitCode=1;
 }finally{await db.end();}
}catch(error){console.error(JSON.stringify({status:'FK_VERIFICATION_FAILED_DETAILS_SUPPRESSED',sqlState:/^[A-Z0-9]{5}$/.test(error.code??'')?error.code:undefined}));process.exitCode=1;}
