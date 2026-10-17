/** Offline browser evidence only: synthetic repository/routes, never live acceptance. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(require.resolve('playwright',{paths:[join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules')]}));
const output=fileURLToPath(new URL('../../../docs/implementation/us28-stadia-v2-evidence/',import.meta.url));
const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
let decoded;await page.route('**/api/trip-proposals',async route=>{const real=await route.fetch();const bytes=await real.body();decoded=JSON.parse(bytes.toString('utf8'));await route.fulfill({response:real,body:bytes});});
page.setDefaultTimeout(15000);const result={kind:'OFFLINE_SYNTHETIC_COMPONENT_SERVICE_BROWSER; NOT FULL-STACK',passed:[],failed:[]};
async function scenario(value,days=1,date='2027-01-01'){
 console.log('STEP '+value+' start');await context.request.get('http://127.0.0.1:3012/fixture-scenario?value='+value);await page.goto('http://127.0.0.1:3012',{waitUntil:'domcontentloaded',timeout:15000});console.log('STEP '+value+' form');
 await page.locator('#trip-duration').fill(String(days));if(date)await page.locator('#trip-start-date').fill(date);await page.getByLabel('Xe máy',{exact:false}).check();
 await page.locator('.trip-form button[type=submit]').click();console.log('STEP '+value+' review');await page.getByLabel('Tôi đã kiểm tra các thông tin trên').check();await page.getByRole('button',{name:'Xác nhận nhu cầu',exact:true}).click();
 console.log('STEP '+value+' generate');const pending=page.waitForResponse(r=>r.url().endsWith('/api/trip-proposals'));await page.getByRole('button',{name:'Tạo lịch trình đề xuất',exact:true}).click();await pending;const data=decoded;console.log('STEP '+value+' response');return data;
}
async function check(name,fn){try{await fn();result.passed.push(name);console.log('PASS '+name);}catch(error){result.failed.push({name,error:error.message.slice(0,350)});process.exitCode=1;}}
try{
 await check('Missing key remains NOT_CONFIGURED, missing clocks and no confirmation',async()=>{const p=(await scenario('NOT_CONFIGURED')).data;assert.equal(p.days[0].stops[1].inbound.reason,'NOT_CONFIGURED');assert.equal(p.eligibleForFinalConfirmation,false);await page.getByText('Chưa xác định',{exact:true}).first().waitFor();});
 await check('Unavailable route remains insufficient, never zero guessed travel',async()=>{const p=(await scenario('MISSING_ROUTE')).data;assert.equal(p.days[0].stops[1].inbound.reason,'NO_ROUTE');assert.equal(p.days[0].distanceMeters,null);assert.equal(p.eligibleForFinalConfirmation,false);await page.getByText('Chưa có thời gian di chuyển đã xác minh',{exact:true}).first().waitFor();});
 await check('Empty Destination source shows real empty state without fake destinations',async()=>{const p=(await scenario('EMPTY')).data;assert.equal(p.reasonCodes.includes('NO_ELIGIBLE_CANDIDATES'),true);assert.equal(p.eligibleForFinalConfirmation,false);await page.getByText('Chưa đủ điểm đến phù hợp',{exact:true}).waitFor();});
 await check('Technical error shows retry and remains separate from missing data',async()=>{await scenario('ERROR');await page.getByRole('button',{name:'Thử lại cùng yêu cầu',exact:true}).waitFor();assert.equal(await page.locator('.planner-timeline').count(),0);});
 await check('14 relative-day tabs retain keyboard navigation and mobile bounds',async()=>{const p=(await scenario('FULL',14,null)).data;assert.equal(p.days.length,14);assert.equal(p.eligibleForFinalConfirmation,false);const tabs=page.getByRole('tab');await tabs.nth(13).waitFor();assert.equal(await tabs.count(),14);await tabs.first().focus();await page.keyboard.press('ArrowRight');assert.equal(await tabs.nth(1).getAttribute('aria-selected'),'true');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:resolve(output,'offline-mobile-relative.png'),fullPage:true});});
}finally{await browser.close();await writeFile(resolve(output,'offline-browser-results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({pass:result.passed.length,fail:result.failed.length}));}
