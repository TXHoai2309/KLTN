// Isolated actual React components; provider HTTP and map rendering are fixtures.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve('playwright', { paths: [process.env.PLAYWRIGHT_MODULE_DIR ?? 'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'] }));
const web = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const bundle = await build({ absWorkingDir: web, stdin: { resolveDir: web, loader: 'tsx', contents: `
import React,{useState} from 'react'; import {createRoot} from 'react-dom/client';
import Editor from './src/components/trip-origin/trip-journey-editor';
import Modal from './src/components/trip-origin/trip-journey-edit-modal';
const initial={origin:{label:'Hà Nội',latitude:21.0285,longitude:105.8,source:'MANUAL',confirmed:true},departureMinute:360,returnDeadlineMinute:1260,returnDepartureMinute:420};
function App(){const [journey,setJourney]=useState(initial),[open,setOpen]=useState(true);return <>{location.pathname==='/modal'?<Modal isOpen={open} tripId="test-trip" baseRevision="2026-11-01T00:00:00.000Z" initialJourney={initial} onClose={()=>setOpen(false)} onSaved={()=>{window.saved=true}}/>:<><Editor journey={journey} onChange={setJourney}/><pre id="state">{JSON.stringify(journey)}</pre></>}</>};createRoot(document.getElementById('app')).render(<App/>);` }, bundle:true, write:false, outdir:'.cache/origin-fixes', jsx:'automatic', define:{'process.env.NODE_ENV':'"development"'}, plugins:[{name:'offline',setup(b){
 b.onResolve({filter:/modules\/map\/map-config$/},()=>({path:'map',namespace:'fixture'}));
 b.onResolve({filter:/components\/trip-planner\/planner-presentation$/},()=>({path:'presentation',namespace:'fixture'}));
 b.onResolve({filter:/^next-themes$/},()=>({path:'theme',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'js',contents:args.path==='map'?'export const mapStyle=()=>""; export const loadMapLibre=()=>Promise.reject(Error("fixture map unavailable"));':args.path==='theme'?'export const useTheme=()=>({resolvedTheme:"light"});':'export const durationText=n=>n+" phút";'}));
 }}] });
const js=bundle.outputFiles.find(f=>f.path.endsWith('.js')).text;
const css=bundle.outputFiles.find(f=>f.path.endsWith('.css'))?.text??'';
const server=createServer((req,res)=>{if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(js);}else if(req.url==='/app.css'){res.setHeader('Content-Type','text/css');res.end(css);}else{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:system-ui;margin:16px}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><link rel="stylesheet" href="/app.css"><div id="app"></div><script src="/app.js"></script></html>');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try {
 browser=await chromium.launch({headless:true,channel:'msedge'});
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let searches=0,applyCount=0;const applies=[];
 await page.route('**/api/trip-origins/search',async route=>{searches++;await route.fulfill({json:{success:true,data:{status:'RESULTS',cached:false,results:[{label:'TEST Huế',latitude:16.46,longitude:107.59,source:'NOMINATIM',confirmed:false}]}}});});
 await page.route('**/api/trip-origins/validate',route=>route.fulfill({json:{success:true,data:{revision:'origin-v1',origin:route.request().postDataJSON().origin,coverage:{status:'SUPPORTED',name:'VN',license:'fixture'}}}}));
 await page.goto(`http://127.0.0.1:${server.address().port}/`);
 const label=page.getByLabel('Tên địa điểm xuất phát',{exact:true});
 await label.fill('');assert.equal(JSON.parse(await page.locator('#state').textContent()).origin,null);
 await label.fill('Huế');assert.equal(searches,0);
 await page.getByRole('button',{name:'Tìm địa điểm',exact:true}).click();
 await page.getByRole('button',{name:'TEST Huế',exact:true}).click();
 await page.getByRole('button',{name:'Xác nhận điểm xuất phát',exact:true}).click();
 await page.waitForFunction(()=>JSON.parse(document.querySelector('#state').textContent).origin?.confirmed===true);
 assert.equal(searches,1);assert.equal(JSON.parse(await page.locator('#state').textContent()).origin.source,'NOMINATIM');
 const returnClock=page.getByLabel('Giờ bắt đầu về ngày cuối chỉ di chuyển',{exact:true});
 await returnClock.fill('08:30');assert.equal(JSON.parse(await page.locator('#state').textContent()).returnDepartureMinute,510);
 await page.setViewportSize({width:390,height:844});assert.ok(await label.isVisible());
 await mkdir(new URL('../.cache/origin-review-fixes/',import.meta.url),{recursive:true});
 await page.screenshot({path:new URL('../.cache/origin-review-fixes/editor-mobile.png',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'),fullPage:true});
 const candidate={startDate:'2026-11-20',durationDays:2,transport:'CAR',journey:{origin:{label:'Hà Nội',latitude:21.0285,longitude:105.8,source:'MANUAL',confirmed:true},departureMinute:360,returnDeadlineMinute:1260,returnDepartureMinute:420},days:[]};
 await page.route('**/journey/preview',route=>route.fulfill({json:{success:true,data:{baseRevision:'2026-11-01T00:00:00.000Z',candidate,journeyPlan:null,eligibleForConfirmation:true}}}));
 await page.route('**/journey/apply',async route=>{applyCount++;applies.push({body:route.request().postData(),key:route.request().headers()['idempotency-key']});await route.fulfill({status:applyCount===1?503:200,json:applyCount===1?{success:false,operationStatus:'UNKNOWN',error:{message:'TEST UNKNOWN'}}:{success:true,operationStatus:'SUCCESS',data:{tripId:'test-trip'}}});});
 await page.goto(`http://127.0.0.1:${server.address().port}/modal`);
 await page.getByRole('button',{name:'Xem trước phương án',exact:true}).click();
 await page.getByRole('button',{name:'Xác nhận & Cập nhật',exact:true}).click();
 await page.getByRole('button',{name:'Thử lại xác nhận',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Hủy bỏ',exact:true}).isDisabled(),true);
 assert.equal(await page.getByLabel('Tên địa điểm xuất phát',{exact:true}).isDisabled(),true);
 await page.getByRole('button',{name:'Thử lại xác nhận',exact:true}).click();
 await page.waitForFunction(()=>window.saved===true);
 assert.deepEqual(applies[0],applies[1]);assert.equal(applyCount,2);assert.deepEqual(errors,[]);
 process.stdout.write('PASS: clear-label, explicit search/select/confirm, return-only clock, mobile controls, UNKNOWN locks and identical retry.\n');
} finally {await browser?.close();await new Promise(r=>server.close(r));}
