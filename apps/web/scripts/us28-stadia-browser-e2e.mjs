/** Actual Next.js + Better Auth + verified Development PostgreSQL + bounded live routing.
 * Synthetic business fixtures use coordinates copied from two verified real Destinations.
 * Never changes a real Destination, a real account or Production. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile,unlink} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {developmentConnection,verifyDevelopment} from './admin-users-test-db.mjs';
const require=createRequire(import.meta.url),{Client}=require('pg');
const {chromium}=require(require.resolve('playwright',{paths:[join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules')]}));
const root=fileURLToPath(new URL('../../../',import.meta.url)),base=process.env.US28_BROWSER_ORIGIN??'http://localhost:3010';
assert.ok(/^http:\/\/localhost:301[0-9]$/.test(base),'Loopback only');
const output=resolve(root,'docs/implementation/us28-stadia-v2-evidence');await mkdir(output,{recursive:true});
const db=new Client({connectionString:await developmentConnection()}),users=[],destinations=[];
const result={passed:[],failed:[],cleanup:false,origin:base,fixturePolicy:'Temporary synthetic hours/durations; coordinates copied from verified existing Destination rows. Existing rows unchanged.',livePlannerCalls:0};
let browser,traveler,admin,proposal;
const prefix='us28-'+randomUUID();
await writeFile(resolve(root,'.us28-browser-owned.json'),JSON.stringify({prefix,users,destinations}));
const check=async(name,fn)=>{try{await fn();result.passed.push(name);console.log('PASS '+name);}catch(error){result.failed.push({name,error:error.message.slice(0,500)});console.error('FAIL '+name+': '+error.message.slice(0,300));process.exitCode=1;}};
const api=async(context,path,method='GET',data,key=randomUUID())=>{const r=await context.request.fetch(base+path,{method,data,headers:{Origin:base,'Idempotency-Key':key},timeout:45000});return {status:r.status(),body:await r.json(),headers:r.headers()};};
async function flow(actor,transport,date='2027-01-01'){
 const page=actor.page;let decoded;
 await page.unroute('**/api/trip-proposals');
 await page.route('**/api/trip-proposals',async route=>{const real=await route.fetch();const bytes=await real.body();decoded=JSON.parse(bytes.toString('utf8'));await route.fulfill({response:real,body:bytes});});
 await page.goto(base+'/trips/new');
 await page.locator('#trip-duration').fill('1'); if(date)await page.locator('#trip-start-date').fill(date);
 await page.getByLabel(transport==='CAR'?'Ô tô':'Xe máy',{exact:false}).check();
 const pace=page.locator('input[type=radio][value=RELAXED]');if(await pace.count())await pace.check();
 await page.locator('.trip-form button[type=submit]').click();
 await page.getByLabel('Tôi đã kiểm tra các thông tin trên').check();
 const checked=page.waitForResponse(r=>r.url().endsWith('/api/trip-requirements/check')&&r.request().method()==='POST');
 await page.getByRole('button',{name:'Xác nhận nhu cầu',exact:true}).click();assert.equal((await checked).status(),200);
 const pending=page.waitForResponse(r=>r.url().endsWith('/api/trip-proposals')&&r.request().method()==='POST',{timeout:45000});
 await page.getByRole('button',{name:'Tạo lịch trình đề xuất',exact:true}).click();
 const response=await pending;assert.equal(response.status(),200);const data=decoded.data;
 await page.locator('.planner-timeline').waitFor();result.livePlannerCalls+=data.days.flatMap(d=>d.stops).filter(s=>s.inbound).length;
 return data;
}
try{
 await db.connect();await verifyDevelopment(db);
 const rows=(await db.query('SELECT id,latitude,longitude FROM destination WHERE visibility=\'VISIBLE\' AND "locationVerified"=true ORDER BY id LIMIT 2')).rows;
 assert.equal(rows.length,2,'Two verified source coordinates required');result.coordinateSources=rows.map(r=>r.id);
 const env=await readFile(resolve(root,'apps/web/.env'),'utf8');assert.ok(env.match(/^STADIA_MAPS_API_KEY\s*=\s*["']?[^\r\n"']+/m),'Existing key required for this live harness');
 for(let i=0;i<2;i++){
  const id='000-'+prefix+'-'+i;destinations.push(id);
  await db.query(`INSERT INTO destination(id,name,description,area,category,latitude,longitude,visibility,"locationVerified","locationEvidence","minimumDurationMinutes","suggestedDurationMinutes","updatedAt") VALUES($1,$2,'Synthetic routing test; not tourism evidence','TEST','TEST',$3,$4,'VISIBLE',true,$5,30,60,CURRENT_TIMESTAMP)`,[id,'TEST US28 '+i,rows[i].latitude,rows[i].longitude,'TEST coordinate copy from verified Destination '+rows[i].id]);
  for(const day of ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY']){const opening=randomUUID();await db.query('INSERT INTO opening_day(id,"destinationId","dayOfWeek",status) VALUES($1,$2,$3::"Weekday",\'OPEN\')',[opening,id,day]);await db.query('INSERT INTO opening_interval(id,"openingDayId","opensAtMinute","closesAtMinute") VALUES($1,$2,0,1440)',[randomUUID(),opening]);}
 }
 browser=await chromium.launch({channel:'chrome',headless:true});
 for(const role of ['TRAVELER','ADMIN']){
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'vi-VN'});context.setDefaultTimeout(25000);context.setDefaultNavigationTimeout(60000);
  const email=prefix+'-'+role.toLowerCase()+'@example.invalid',password='Fixture-'+randomUUID()+'!';
  const signup=await context.request.post(base+'/api/auth/sign-up/email',{data:{name:'TEST US28 '+role,email,password},headers:{Origin:base}});assert.equal(signup.status(),200);
  const id=(await signup.json()).user.id;users.push(id);await writeFile(resolve(root,'.us28-browser-owned.json'),JSON.stringify({prefix,users,destinations}));if(role==='ADMIN')await db.query('UPDATE "user" SET role=\'ADMIN\' WHERE id=$1',[id]);
  await context.clearCookies();const page=await context.newPage();await page.goto(base+'/login');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Mật khẩu',{exact:true}).fill(password);await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.waitForURL(u=>u.pathname!=='/login');
  const actor={id,page,context};if(role==='ADMIN')admin=actor;else traveler=actor;
 }
 await check('TRAVELER real UI CAR workflow uses live Stadia normalized evidence',async()=>{
  proposal=await flow(traveler,'CAR');const leg=proposal.days[0].stops[1]?.inbound;
  assert.equal(leg?.provider,'STADIA_MAPS','Live provider must actually be configured and successful');assert.equal(leg.status,'VERIFIED');assert.ok(leg.durationSeconds>0&&leg.distanceMeters>0);
  assert.equal(proposal.eligibleForFinalConfirmation,true);assert.ok(proposal.checks.every(c=>c.status==='PASS'));assert.equal(await traveler.page.getByText('Google Maps',{exact:false}).count(),0);
  await traveler.page.locator('.planner-stop-select').nth(1).click();await traveler.page.locator('.planner-preview').waitFor();
  await traveler.page.locator('.planner-map-marker').nth(1).waitFor({state:'attached'});assert.ok(await traveler.page.locator('.planner-map-marker').count()>=2);assert.equal(await traveler.page.locator('.maplibregl-map').count(),1);
  await traveler.page.screenshot({path:resolve(output,'desktop-light.png'),fullPage:true});
 });
 await check('ADMIN inherited Planner MOTORCYCLE, real route and dark mobile layout',async()=>{
  const p=await flow(admin,'MOTORCYCLE');assert.equal(p.requirement.transport,'MOTORCYCLE');assert.equal(p.days[0].stops[1]?.inbound?.provider,'STADIA_MAPS');assert.equal(p.eligibleForFinalConfirmation,true);
  await admin.page.evaluate(()=>{document.documentElement.classList.add('dark');localStorage.setItem('theme','dark');});await admin.page.setViewportSize({width:390,height:844});
  assert.ok(await admin.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await admin.page.screenshot({path:resolve(output,'mobile-dark.png'),fullPage:true});
 });
 await check('Back/edit preserves review and relative days never confirm',async()=>{
  await traveler.page.getByRole('button',{name:'Quay lại chỉnh nhu cầu',exact:true}).click();
  await traveler.page.getByLabel('Tôi đã kiểm tra các thông tin trên').waitFor();
  const p=await flow(traveler,'CAR',null);assert.equal(p.requirement.startDate,null);assert.ok(p.days.every(d=>d.date===null));assert.equal(p.eligibleForFinalConfirmation,false);
 });
 await check('Regenerate retains relative-day UI; save replay is verified separately',async()=>{
  await traveler.page.getByRole('button',{name:'Tạo lại lịch trình',exact:true}).click();
  await traveler.page.locator('.planner-page[aria-busy=false]').waitFor();
  // Relative-day proposal still cannot become a confirmed trip.
  assert.ok(await traveler.page.getByText('Ngày tương đối',{exact:true}).count());
 });
 await check('US30 fresh route validation, actual save/replay/read/favorite and ownership',async()=>{
  assert.ok(proposal?.eligibleForFinalConfirmation,'A verified proposal is required');
  const payload={confirm:true,proposal:{startDate:proposal.requirement.startDate,durationDays:1,transport:'CAR',days:proposal.days.map(d=>({dayIndex:d.day,visits:d.stops.map(s=>({destinationId:s.destination.id,startMinute:s.arrivalMinute,plannedDurationMinutes:s.visitDurationMinutes,order:s.order}))}))}};
  const key=randomUUID(),saved=await api(traveler.context,'/api/trips','POST',payload,key);assert.equal(saved.status,200);assert.equal(saved.body.operationStatus,'SUCCESS');const id=saved.body.data.tripId;
  const replay=await api(traveler.context,'/api/trips','POST',payload,key);assert.equal(replay.body.data.tripId,id);assert.equal(replay.headers['idempotency-replayed'],'true');
  assert.equal((await db.query('SELECT count(*)::int n FROM trip WHERE "userId"=$1',[traveler.id])).rows[0].n,1);
  await traveler.page.goto(base+'/trips/'+id);await traveler.page.getByText('TEST US28 0',{exact:true}).waitFor();
  await traveler.page.getByRole('button',{name:'Thêm chuyến đi vào yêu thích',exact:true}).click();await traveler.page.getByRole('button',{name:'Bỏ chuyến đi khỏi yêu thích',exact:true}).waitFor();
  assert.equal((await api(admin.context,'/api/trips/'+id)).status,404);
 });
 await check('Guest, locked account and forged role cannot call private Planner',async()=>{
  const guest=await browser.newContext();const body={requirement:{durationDays:1,startDate:null,transport:'CAR'}};
  assert.equal((await api(guest,'/api/trip-proposals','POST',body)).status,401);
  await db.query('UPDATE "user" SET status=\'LOCKED\' WHERE id=$1',[traveler.id]);
  assert.equal((await api(traveler.context,'/api/trip-proposals','POST',body)).status,403);
  await db.query('UPDATE "user" SET status=\'ACTIVE\',role=\'TRAVELER\' WHERE id=$1',[traveler.id]);
  assert.equal((await api(traveler.context,'/api/admin/users')).status,403);await guest.close();
 });
}catch(error){result.failed.push({name:'harness setup/execution',error:error.message.slice(0,500)});console.error('Browser setup/execution failed: '+error.message.slice(0,300));process.exitCode=1;}
finally{
 if(browser)await browser.close();
 if(db._connected){
  for(const id of users){await db.query('DELETE FROM idempotency_record WHERE scope LIKE $1',['["'+id+'",%']);await db.query('DELETE FROM favorite WHERE "userId"=$1',[id]);await db.query('DELETE FROM trip WHERE "userId"=$1',[id]);await db.query('DELETE FROM "user" WHERE id=$1',[id]);}
  for(const id of destinations)await db.query('DELETE FROM destination WHERE id=$1',[id]);
  result.cleanup=(await db.query('SELECT count(*)::int n FROM "user" WHERE id=ANY($1::text[])',[users])).rows[0].n===0&&(await db.query('SELECT count(*)::int n FROM destination WHERE id=ANY($1::text[])',[destinations])).rows[0].n===0;
  await db.end();
  if(result.cleanup)await unlink(resolve(root,'.us28-browser-owned.json')).catch(()=>{});
 }
 await writeFile(resolve(output,'browser-results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({pass:result.passed.length,fail:result.failed.length,cleanup:result.cleanup}));
}
