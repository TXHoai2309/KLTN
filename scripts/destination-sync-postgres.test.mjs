import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fixture} from './destination-sync-core.test.mjs';
import {buildPlan,hash,tableAllowlist,quote,insertPlan,transaction} from './destination-sync-core.mjs';
const {Client,types}=createRequire(import.meta.url)('pg');
types.setTypeParser(1114,value=>value);types.setTypeParser(1184,value=>value);
process.env.TZ='Asia/Ho_Chi_Minh';
const port=Number(process.env.SYNC_FIXTURE_PORT);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('EXPLICIT_LOOPBACK_FIXTURE_PORT_REQUIRED');
const options={host:'127.0.0.1',port,user:'postgres',database:'destination_sync_fixture',connectionTimeoutMillis:5000};
let db;
before(async()=>{
 const setup=new Client({...options,database:'postgres'});await setup.connect();await setup.query('CREATE DATABASE destination_sync_fixture');await setup.end();
 db=new Client(options);await db.connect();
 await db.query(`
 CREATE TABLE content_area(id text PRIMARY KEY,name text UNIQUE,kind text);
 CREATE TABLE destination(id text PRIMARY KEY,name text,description text,latitude double precision,longitude double precision,visibility text, "contentRevision" int,"createdAt" timestamp(3),"updatedAt" timestamp(3),aliases text[]);
 CREATE TABLE opening_day(id text PRIMARY KEY,"destinationId" text REFERENCES destination(id),"dayOfWeek" text,status text, UNIQUE("destinationId","dayOfWeek"));
 CREATE TABLE opening_interval(id text PRIMARY KEY,"openingDayId" text REFERENCES opening_day(id),"opensAtMinute" int,"closesAtMinute" int,CHECK("opensAtMinute"<"closesAtMinute"));
 CREATE TABLE content_source(id text PRIMARY KEY,"destinationId" text REFERENCES destination(id),"cultureId" text,title text,"websiteRights" text,"indexingRights" text,"openAiRights" text,"reviewedBy" text,"reviewedAt" timestamptz(3),"rightsEvidence" text);
 CREATE TABLE content_media(id text PRIMARY KEY,"destinationId" text REFERENCES destination(id),"cultureId" text,url text,"websiteRights" text,"isCover" boolean,"storageReference" text);
 CREATE TABLE "_AreaToDestination"("A" text REFERENCES content_area(id),"B" text REFERENCES destination(id),PRIMARY KEY("A","B"));
 CREATE TABLE destination_editorial("destinationId" text PRIMARY KEY REFERENCES destination(id),"schemaVersion" int,"draftRevision" int,"publishedRevision" int,"updatedBy" text,"publishedBy" text,draft jsonb,published jsonb,"previousPublished" jsonb);
 CREATE TABLE culture_content(id text PRIMARY KEY);
 CREATE TABLE culture_destination("cultureId" text REFERENCES culture_content(id),"destinationId" text REFERENCES destination(id),PRIMARY KEY("cultureId","destinationId"));
 CREATE TABLE "user"(id text PRIMARY KEY,role text,status text);
 INSERT INTO "user" VALUES('synthetic-admin','ADMIN','ACTIVE');
 `);
});
after(async()=>{await db?.end();});
test('real PostgreSQL mapping, FK ordering, JSON/arrays/timestamps, rights and replay',async()=>{
 const {snapshot,selection}=fixture();const plan=buildPlan(snapshot,selection);
 await transaction(db,()=>insertPlan(db,plan));
 for(const table of tableAllowlist)snapshot.target.rows[table]=(await db.query(`SELECT * FROM public.${quote(table)} ORDER BY 1`)).rows;
 const replay=buildPlan(snapshot,selection);assert.equal(replay.status,'PASS');assert.equal(Object.values(replay.inserts).flat().length,0);
 assert.equal(snapshot.target.rows.destination[0].createdAt,'2026-01-01 00:00:00.123');
 await transaction(db,()=>insertPlan(db,replay));
 assert.equal((await db.query('SELECT count(*)::int AS n FROM destination')).rows[0].n,1);
 assert.deepEqual((await db.query('SELECT * FROM "user"')).rows,[{id:'synthetic-admin',role:'ADMIN',status:'ACTIVE'}]);
});
test('real PostgreSQL late FK failure rolls back all earlier inserts and leaves unrelated user unchanged',async()=>{
 const {snapshot,selection}=fixture();const plan=buildPlan(snapshot,selection);
 // Empty all but a fresh Destination then fail at the final allowed relation.
 for(const table of tableAllowlist)plan.inserts[table]=[];
 plan.inserts.destination=[{...snapshot.source.rows.destination[0],id:'rollback-destination'}];
 plan.inserts.culture_destination=[{cultureId:'missing-culture',destinationId:'rollback-destination'}];
 const before=hash((await db.query('SELECT * FROM "user"')).rows);
 await assert.rejects(transaction(db,()=>insertPlan(db,plan)),e=>e.code==='23503');
 assert.equal((await db.query("SELECT count(*)::int AS n FROM destination WHERE id='rollback-destination'")).rows[0].n,0);
 assert.equal(hash((await db.query('SELECT * FROM "user"')).rows),before);
});
test('real PostgreSQL advisory transaction lock refuses concurrent sync and releases on rollback',async()=>{
 const other=new Client(options);await other.connect();
 try{
  await db.query('BEGIN');await other.query('BEGIN');
  assert.equal((await db.query('SELECT pg_try_advisory_xact_lock(751204,280018) AS acquired')).rows[0].acquired,true);
  assert.equal((await other.query('SELECT pg_try_advisory_xact_lock(751204,280018) AS acquired')).rows[0].acquired,false);
  await db.query('ROLLBACK');
  assert.equal((await other.query('SELECT pg_try_advisory_xact_lock(751204,280018) AS acquired')).rows[0].acquired,true);
  await other.query('ROLLBACK');
 }finally{await other.end();}
});
