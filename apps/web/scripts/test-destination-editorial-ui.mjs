// Production editor/renderer, isolated transport and synthetic media only. No .env/provider/Neon.
import { build } from "esbuild";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import assert from "node:assert/strict";
import sharp from "sharp";
import { editorialFixture } from "../src/modules/destination-editorial/__fixtures__/editorial-fixture.ts";
import { autoLayout, resolveEditorial, validateLayoutReferences } from "../src/modules/destination-editorial/editorial-engine.ts";
import { editorialActionSchema, editorialLayoutSchema } from "../src/modules/destination-editorial/editorial-contract.ts";
import { AI_LAYOUT_PRESERVED } from "../src/modules/destination-editorial/editorial-display-policy.ts";
import { editorialBlockSchema } from "../src/modules/destination-editorial/editorial-contract.ts";
import { ADMIN_IMAGE_USE } from "../src/modules/destination/destination-media-eligibility.ts";
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve("playwright", { paths: ["C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules"] }));
const web = fileURLToPath(new URL("..", import.meta.url));
const directory = web + "/.cache/editorial-v3-3"; await mkdir(directory,{recursive:true});
// Exercise the real self-hosted production typefaces without external font traffic.
const fontCss = (await Promise.all((await readdir(`${web}/.next/static/chunks`)).filter(f=>f.endsWith(".css")).map(f=>readFile(`${web}/.next/static/chunks/${f}`,"utf8")))).flatMap(css=>css.match(/@font-face\s*\{[^}]+\}/g)??[]).join("\n").replaceAll("../media/","/font/");
assert(fontCss.includes("font-family:Lora"),"Build the app first to verify the Vietnamese Lora font");
let state = initial(), lost = false, aiMode = "fallback", photoFailure = false;
const journal = new Map();
const writes = [];
const aiRequests = [];
function initial() { const context = editorialFixture(); return {available:true,reason:null,context,draft:null,published:null,previousPublished:null,draftRevision:0,publishedRevision:0,updatedAt:null,publishedAt:null,contentChanged:false,aiConfigured:false}; }
const bundle = await build({absWorkingDir:web,stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import EditorialEditor from './src/app/admin/destinations/editorial-editor';import EditorialRenderer from './src/components/editorial/editorial-renderer';import DestinationDetail from './src/app/destinations/[id]/destination-detail';import './src/app/destinations/[id]/detail.css';import './src/components/published-content-profile.css';import {Toaster} from 'sonner';window.mount=(data)=>{window.root?.unmount();window.root=createRoot(document.getElementById('app'));window.root.render(data?<EditorialRenderer {...data}/>:<><EditorialEditor id="fixture"/><Toaster/></>)};window.mountPublic=(data)=>{window.root?.unmount();window.root=createRoot(document.getElementById('app'));window.root.render(<DestinationDetail {...data}/>)};window.mount();`,resolveDir:web,loader:"tsx"},plugins:[{name:"offline-next",setup(b){
  b.onResolve({filter:/lib\/auth-client$/},args=>({path:args.path,namespace:"guest"}));
  b.onLoad({filter:/.*/,namespace:"guest"},()=>({loader:"js",contents:"export const authClient={useSession:()=>({data:null,isPending:false,error:null})}"}));
  b.onResolve({filter:/^next\/link$/},args=>({path:args.path,namespace:"mock"}));
  b.onLoad({filter:/.*/,namespace:"mock"},()=>({loader:"js",resolveDir:web,contents:"import React from 'react';export default function Link(p){return React.createElement('a',p,p.children)}"}));
  b.onResolve({filter:/components\/map\/destination-map$/},args=>({path:args.path,namespace:"map"}));
  b.onLoad({filter:/.*/,namespace:"map"},()=>({loader:"js",resolveDir:web,contents:"import React from 'react';export default function Map(p){return React.createElement('div',{className:'destination-map',role:'img','aria-label':p.label,style:{height:300,background:'#b2cab6',display:'grid',placeItems:'center'}},'Bản đồ fixture · Không gọi provider')}"}));
}}],bundle:true,write:false,outdir:".cache/editorial-bundle",jsx:"automatic",define:{"process.env.NODE_ENV":'"development"'}});
const media = await Promise.all([0,1,2,3,4,5,6,7].map(async i=>{
  // Synthetic landscape photograph-like color composition, generated with Sharp; no remote image.
  const svg=`<svg width="1600" height="1000" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#${["91b7c0","b9cdb4","c9b48e","95b4ae"][i%4]}"/><stop offset="1" stop-color="#e9eed8"/></linearGradient></defs><rect width="1600" height="1000" fill="url(#sky)"/><path d="M0 650 L350 250 L700 640 L1050 170 L1600 720 V1000 H0Z" fill="#5a8069"/><path d="M0 820 L460 500 L820 850 L1250 430 L1600 740 V1000 H0Z" fill="#284e3b"/><path d="M0 950 Q700 650 1600 910 V1000 H0Z" fill="#799365"/></svg>`;
  return sharp(Buffer.from(svg)).jpeg().toBuffer();
}));
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,"http://localhost");const send=(body,status=200)=>{res.writeHead(status,{"Content-Type":"application/json"});res.end(JSON.stringify(body));};
  if(url.pathname==="/api/admin/destinations/fixture/editorial" && req.method==="GET") return send({success:true,data:state});
  if(url.pathname.endsWith("/propose")) {
    if(aiMode.startsWith("atomic-")) {
      let raw="";for await(const part of req)raw+=part.toString();const input=JSON.parse(raw);aiRequests.push(input);
      const mode=aiMode.slice(7),next=structuredClone(input.layout);
      if(mode.startsWith("http"))return send({success:false,error:{code:"PROVIDER_FAILED",message:"Fixture provider failure"}},Number(mode.slice(4)));
      if(mode==="fallback")return send({success:true,data:{status:"FALLBACK",outcome:"VALIDATION_FAILED",layout:autoLayout(state.context)}});
      if(mode==="schema")delete next.blocks;
      if(mode==="duplicate")next.blocks[1].id=next.blocks[0].id;
      if(mode==="media")next.blocks[0].mediaIds=["foreign"];
      if(mode==="prose")next.blocks[1].text+=" unsafe change";
      return send({success:true,data:{status:"PROPOSED",outcome:"PROPOSED",layout:next}});
    }
    if(aiMode==="success") {let raw="";for await(const part of req)raw+=part.toString();const input=JSON.parse(raw), current=input.layout;aiRequests.push(input);await new Promise(r=>setTimeout(r,300));return send({success:true,data:{status:"PROPOSED",reason:"Đề xuất AI fixture chưa lưu.",layout:{...current,...(input.direction==="AUTO"?{family:"HERITAGE_STORY",variant:"SPLIT"}:{}),design:{typography:"LITERARY",palette:"SLATE",rhythm:"IMMERSIVE"},blocks:[...current.blocks].reverse()}}});}
    return aiMode==="invalid" ? send({success:false,error:{message:"AI JSON không hợp lệ"}},502) : send({success:true,data:{status:"FALLBACK",reason:"AI chưa cấu hình; dùng đề xuất deterministic.",layout:autoLayout(state.context)}});
  }
  if(url.pathname==="/api/admin/destinations/fixture/editorial" && req.method==="PATCH") {
    let raw="";for await(const part of req) raw+=part;const key=req.headers["idempotency-key"];writes.push({key,raw});
    if(journal.has(key)) {const saved=journal.get(key);return saved.raw===raw?send(saved.response):send({success:false,operationStatus:"FAILED",error:{code:"KEY_REUSED",message:"Key reuse"}},409);}
    const parsed=editorialActionSchema.safeParse(JSON.parse(raw));if(!parsed.success)return send({success:false,operationStatus:"FAILED",error:{code:"VALIDATION",message:"Invalid layout"}},400);
    const input=parsed.data;if(input.expectedRevision!==state.draftRevision)return send({success:false,operationStatus:"FAILED",error:{code:"EDITORIAL_CHANGED",message:"Bản biên tập đã thay đổi. Đọc lại và đối chiếu."}},409);
    try {
      if(input.action==="SAVE"){validateLayoutReferences(input.layout,state.context,false);state.draft=input.layout;}
      if(input.action==="PUBLISH" || input.action==="ROLLBACK"){const layout=editorialLayoutSchema.parse(input.action==="ROLLBACK"?state.previousPublished:state.draft);validateLayoutReferences(layout,state.context,true);state.previousPublished=state.published;state.published=layout;state.publishedRevision++;state.publishedAt=new Date().toISOString();}
      if(input.action==="RESTORE_DRAFT")state.draft=state.published;
      state.draftRevision++;state.updatedAt=new Date().toISOString();const response={success:true,operationStatus:"SUCCESS",data:structuredClone(state)};journal.set(key,{raw,response});
      if(lost){lost=false;return send({success:false,operationStatus:"UNKNOWN",error:{code:"UNKNOWN",message:"TEST lost result"}},503);}return send(response);
    }catch{return send({success:false,operationStatus:"FAILED",error:{code:"REFERENCE",message:"Ảnh/nguồn chưa được duyệt"}},400);}
  }
  if(url.pathname.startsWith("/photo")){if(photoFailure){res.writeHead(500);return res.end();}res.writeHead(200,{"Content-Type":"image/jpeg"});return res.end(media[Number(url.pathname.split("/").at(-1))%8]);}
  if(/^\/font\/[\w.-]+\.woff2$/.test(url.pathname)){res.writeHead(200,{"Content-Type":"font/woff2"});return res.end(await readFile(`${web}/.next/static/media/${url.pathname.split("/").at(-1)}`));}
  res.setHeader("Content-Type",url.pathname==="/bundle.js"?"application/javascript":"text/html");res.end(url.pathname==="/bundle.js"?bundle.outputFiles.find(f=>f.path.endsWith(".js")).text:`<!DOCTYPE html><html lang="vi"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fontCss}:root{--font-editorial-serif:'Lora';--font-geist-sans:'Geist';--font-be-vietnam:'Be Vietnam Pro'}html,body{margin:0;font-family:var(--font-be-vietnam),system-ui}*{box-sizing:border-box}dialog{margin:0}button,input,textarea,select{font:inherit}${bundle.outputFiles.filter(f=>f.path.endsWith(".css")).map(f=>f.text).join("\n")}</style></head><body><div id="app"></div><script src="/bundle.js"></script></body></html>`);
});
await new Promise(r=>server.listen(0,"127.0.0.1",r));let browser;const checks=[];const pass=name=>{checks.push(name);console.log("PASS "+name);};
try{
  browser=await chromium.launch({channel:"chrome",headless:true});const page=await browser.newPage();const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("https://res.cloudinary.com/**",async route=>{const n=route.request().url().match(/photo-(\d+)/)?.[1]??0;await route.fulfill({status:photoFailure?500:200,contentType:"image/jpeg",body:photoFailure?Buffer.from(""):media[Number(n)%8]});});
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|res\.cloudinary\.com)/,r=>r.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.locator(".ed-page").waitFor();await page.evaluate(()=>document.fonts.ready);
  await page.getByRole("button",{name:"Tự động dàn trang",exact:true}).click();await page.getByRole("button",{name:"Lưu bản nháp",exact:true}).click();await page.getByText("Đã lưu bản nháp.",{exact:true}).first().waitFor();
  assert(state.draft);assert.equal(state.published,null);pass("Auto layout / save draft; draft remains separate from published");
  await page.reload();await page.locator(".ed-page").waitFor();assert.equal(await page.locator(".ed-block-list li").count(),state.draft.blocks.length);pass("Saved layout survives refresh");
  await page.setViewportSize({width:1440,height:1000});
  const beforeConfirmation=writes.length;
  await page.getByRole('navigation',{name:'Quy trình xuất bản',exact:true}).getByRole('button',{name:/Kiểm duyệt/}).click();await page.getByRole('dialog').waitFor();assert.equal(writes.length,beforeConfirmation);await page.getByRole('dialog').getByRole('button',{name:'Hủy',exact:true}).click();assert.equal(state.published,null);
  assert.equal(await page.locator('.ed-quality,.ed-publication,.ed-badge-family,.ed-published-checkbox').count(),0);assert.equal(await page.locator('.ed-actions .ed-action-flow').count(),0);

  for(const width of [390,768,1440])for(const theme of ['light','dark']){
    await page.setViewportSize({width,height:1000});await page.evaluate(t=>document.documentElement.classList.toggle('dark',t==='dark'),theme);

    await page.getByRole('button',{name:'Thao tác khác',exact:true}).click();await page.getByRole('menu').waitFor();
    assert(await page.getByRole('menu').evaluate(n=>{const r=n.getBoundingClientRect();return n.contains(document.elementFromPoint(r.x+r.width/2,r.bottom-10))}),'Action menu is not covered by the dock');const rect=await page.getByRole('menu').boundingBox();assert(rect.x>=0&&rect.y>=0&&rect.x+rect.width<=width+1&&rect.y+rect.height<=1001,'Action menu stays inside viewport');
    await page.locator('.ed-actions').screenshot({path:`${directory}/actions-${width}-${theme}.png`});await page.getByRole('menu').screenshot({path:`${directory}/actions-menu-${width}-${theme}.png`});
    await page.keyboard.press('Escape');assert(await page.getByRole('button',{name:'Thao tác khác',exact:true}).evaluate(n=>n===document.activeElement));assert.equal(await page.getByRole('menu').count(),0);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.getByRole('button',{name:'Xuất bản bố cục',exact:true}).click();await page.getByRole('dialog').waitFor();assert.equal(writes.length,beforeConfirmation);
    const dialogBox=await page.getByRole('dialog').boundingBox();assert(Math.abs(dialogBox.x+dialogBox.width/2-width/2)<=1 && Math.abs(dialogBox.y+dialogBox.height/2-500)<=1,'Publish dialog is centered despite global margin reset');assert(dialogBox.x>=0&&dialogBox.y>=0&&dialogBox.x+dialogBox.width<=width+1&&dialogBox.y+dialogBox.height<=1001);
    await page.getByRole('dialog').screenshot({path:`${directory}/publish-confirm-${width}-${theme}.png`});await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);assert.equal(writes.length,beforeConfirmation);assert(await page.getByRole('button',{name:'Xuất bản bố cục',exact:true}).evaluate(n=>n===document.activeElement));

  }
  await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>document.documentElement.classList.remove('dark'));pass('Compact top workflow / removed clutter / publish dialog: 390/768/1440 light-dark, cancel/Escape without writes, viewport centering, containment and focus return');
  const before=state.draft.blocks.map(b=>b.id);await page.getByRole("button",{name:"Đưa block 2 lên",exact:true}).click();await page.getByRole("button",{name:"Lưu bản nháp",exact:true}).click();await page.getByText("Đã lưu bản nháp.",{exact:true}).first().waitFor();assert.equal(state.draft.blocks[0].id,before[1]);
  await page.getByRole("button",{name:"Xuất bản bố cục",exact:true}).click();await page.getByRole("dialog").getByRole("button",{name:"Xác nhận",exact:true}).click();await page.getByText(/Đã xuất bản bố cục/).first().waitFor();assert.equal(state.publishedRevision,1);assert.equal(JSON.parse(writes.at(-1).raw).reviewed,true);const originalVariant=state.published.variant;pass("Reorder saved; explicit review then publish");
  await page.getByLabel("Biến thể",{exact:true}).selectOption("SPLIT");await page.getByRole("button",{name:"Lưu bản nháp",exact:true}).click();await page.getByText("Đã lưu bản nháp.",{exact:true}).first().waitFor();await page.getByRole("button",{name:"Xuất bản bố cục",exact:true}).click();await page.getByRole("dialog").getByRole("button",{name:"Xác nhận",exact:true}).click();await page.getByText(/Đã xuất bản bố cục/).first().waitFor();
  await page.getByRole("button",{name:"Thao tác khác",exact:true}).click();await page.getByRole("menuitem",{name:/^Khôi phục bản xuất bản trước/}).click();await page.getByRole("dialog").getByRole("button",{name:"Xác nhận",exact:true}).click();await page.getByText("Đã khôi phục phiên bản.",{exact:true}).first().waitFor();assert.equal(state.published.variant,originalVariant);pass("Published previous-version rollback works independently from draft");
  await page.getByRole("button",{name:"AI đề xuất bố cục",exact:true}).click();await page.getByText(AI_LAYOUT_PRESERVED,{exact:true}).waitFor();aiMode="invalid";await page.getByRole("button",{name:"AI đề xuất bố cục",exact:true}).click();await page.getByText(AI_LAYOUT_PRESERVED,{exact:true}).waitFor();pass("AI missing/invalid response keeps manual and deterministic editing available");
  await page.getByLabel("Biến thể",{exact:true}).selectOption("EDITORIAL");lost=true;await page.getByRole("button",{name:"Lưu bản nháp",exact:true}).click();await page.getByRole("button",{name:"Đọc lại và thử lại",exact:true}).waitFor();const uncertain=writes.at(-1);await page.getByRole("button",{name:"Đọc lại và thử lại",exact:true}).click();await page.getByText("Đã lưu bản nháp.",{exact:true}).first().waitFor();assert.deepEqual(writes.at(-1),uncertain);pass("UNKNOWN locks editor; identical body/key retry reconciles confirmed draft");
  for(const width of [360,390,768,1024,1440])for(const theme of ["light","dark"]){await page.setViewportSize({width,height:1000});await page.evaluate(t=>document.documentElement.classList.toggle("dark",t==="dark"),theme);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));await page.screenshot({ animations: "disabled",path:`${directory}/editor-${width}-${theme}.png`,fullPage:true});}
  await page.getByRole("button",{name:"Tự động dàn trang",exact:true}).focus();assert(await page.getByRole("button",{name:"Tự động dàn trang",exact:true}).evaluate(el=>el===document.activeElement));pass("Editor five viewport widths, light/dark, keyboard focus and no overflow");
  await page.getByLabel("Thêm block",{exact:true}).selectOption("QUOTE");await page.getByRole("button",{name:"Thêm",exact:true}).click();await page.locator("#editorial-text").fill("Đoạn trích chưa có nguồn");await page.getByRole("button",{name:"Hoàn tác",exact:true}).click();assert.equal(await page.locator("#editorial-text").inputValue(),"");await page.getByRole("button",{name:"Gỡ block",exact:true}).click();pass("Manual add/edit/undo/remove block without saving content upstream");
  await page.getByLabel("Biến thể",{exact:true}).selectOption("PANORAMA");state.draftRevision++;await page.getByRole("button",{name:"Lưu bản nháp",exact:true}).click();await page.getByText("Bản biên tập đã thay đổi. Đọc lại và đối chiếu.",{exact:true}).waitFor();pass("Optimistic concurrency conflict preserves unsaved layout and exposes read-again");
  await page.getByRole("button",{name:"Hủy thay đổi chưa lưu",exact:true}).click();await page.getByRole("button",{name:"Thao tác khác",exact:true}).click();await page.getByRole("menuitem",{name:/^Đọc lại/}).click();await page.waitForTimeout(200);state.available=false;state.reason="Cần owner áp dụng migration Editorial.";await page.reload();await page.getByText(/Cần owner áp dụng migration Editorial/).waitFor();assert(await page.getByRole("button",{name:"Lưu bản nháp",exact:true}).isDisabled());assert(await page.getByRole("button",{name:"Tự động dàn trang",exact:true}).isEnabled());pass("Missing migration blocker disables persistence only, keeps preview/auto layout available");
  state=initial();await page.reload();
  await page.getByLabel("Thêm block",{exact:true}).selectOption("TEXT_SECTION");await page.getByRole("button",{name:"Thêm",exact:true}).click();
  await page.locator("#editorial-text").fill("Fixture unsaved block preserved by AI.");
  const aiWritesBefore=writes.length, aiContextBefore=structuredClone(state.context), aiDraftBefore=structuredClone(state.draft);
  await page.getByLabel("Nhóm template",{exact:true}).selectOption("VILLAGE_CULTURE");await page.getByLabel("Biến thể",{exact:true}).selectOption("EDITORIAL");
  aiMode="success";await page.getByRole("button",{name:"AI đề xuất bố cục",exact:true}).click();await page.getByText("AI đang phối trang…",{exact:true}).waitFor();assert(await page.getByRole("button",{name:"Lưu bản nháp",exact:true}).isDisabled());await page.getByText("Đề xuất AI fixture chưa lưu.",{exact:true}).waitFor();
  assert.equal(await page.locator("#editorial-text").inputValue(),"Fixture unsaved block preserved by AI.");
  assert.equal(writes.length,aiWritesBefore);assert.deepEqual(state.context,aiContextBefore);assert.deepEqual(state.draft,aiDraftBefore);
  assert.equal(aiRequests.at(-1).direction,"KEEP");assert.equal(await page.getByLabel("Nhóm template",{exact:true}).inputValue(),"VILLAGE_CULTURE");assert.equal(await page.getByLabel("Biến thể",{exact:true}).inputValue(),"EDITORIAL");
  assert.equal(await page.locator(".emg").getAttribute("data-typography"),"LITERARY");
  await page.getByLabel("Để AI chọn lại nhóm và biến thể",{exact:true}).check();await page.getByRole("button",{name:"AI đề xuất bố cục",exact:true}).click();await page.getByText("Đề xuất AI fixture chưa lưu.",{exact:true}).waitFor();assert.equal(aiRequests.at(-1).direction,"AUTO");assert.equal(await page.getByLabel("Nhóm template",{exact:true}).inputValue(),"HERITAGE_STORY");
  await page.getByRole("button",{name:"Hoàn tác",exact:true}).click();assert.equal(await page.getByLabel("Nhóm template",{exact:true}).inputValue(),"VILLAGE_CULTURE");
  pass("AI busy state is explicit; KEEP respects selected family/variant, AUTO can change them; Undo restores the selection");
  await page.getByLabel("Kiểu chữ",{exact:true}).selectOption("MODERN");await page.getByLabel("Sắc độ",{exact:true}).selectOption("EARTH");await page.getByLabel("Nhịp trình bày",{exact:true}).selectOption("COMPACT");
  await page.getByRole("button",{name:"Lưu bản nháp",exact:true}).click();await page.getByText("Đã lưu bản nháp.",{exact:true}).first().waitFor();assert.deepEqual(state.draft.design,{typography:"MODERN",palette:"EARTH",rhythm:"COMPACT"});
  await page.reload();await page.locator(".emg[data-typography='MODERN']").waitFor();assert.equal(await page.getByLabel("Sắc độ",{exact:true}).inputValue(),"EARTH");
  await page.getByLabel("Kiểu chữ",{exact:true}).focus();await page.keyboard.press("ArrowDown");await page.keyboard.press("Enter");assert.equal(await page.getByLabel("Kiểu chữ",{exact:true}).inputValue(),"HUMANIST");
  await page.getByRole("button",{name:"Hủy thay đổi chưa lưu",exact:true}).click();await page.setViewportSize({width:1440,height:1100});await page.screenshot({path:`${directory}/art-direction-editor-desktop.png`,fullPage:true});
  await page.setViewportSize({width:390,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));await page.screenshot({path:`${directory}/art-direction-editor-mobile.png`,fullPage:true});await page.setViewportSize({width:1440,height:1000});
  pass("Manual font/palette/rhythm persist after Save and refresh; native font select keyboard and cancel work; editor is usable at 390px");
  aiMode="fallback";pass("AI success applies proposed layout while retaining unsaved block/prose; no Save/Publish or Destination write");
  const atomicBefore=await page.locator('.emg').evaluate(n=>n.outerHTML),atomicControls=await page.locator('.ed-direction-fields select').evaluateAll(nodes=>nodes.map(n=>n.value)),atomicBlocks=await page.locator('.ed-block-list > li').count(),atomicWrites=writes.length;
  let firstAttempt;
  for(const mode of ["fallback","schema","duplicate","media","prose","http401","http403","http429","http500"]) {
    aiMode=`atomic-${mode}`;await page.getByRole('button',{name:'AI đề xuất bố cục',exact:true}).click();await page.getByText(AI_LAYOUT_PRESERVED,{exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('.ed-toolbar[aria-busy="true"]'));
    firstAttempt??=structuredClone(aiRequests.at(-1).layout);assert.deepEqual(aiRequests.at(-1).layout,firstAttempt);
    assert.equal(await page.locator('.emg').evaluate(n=>n.outerHTML),atomicBefore);assert.deepEqual(await page.locator('.ed-direction-fields select').evaluateAll(nodes=>nodes.map(n=>n.value)),atomicControls);assert.equal(await page.locator('.ed-block-list > li').count(),atomicBlocks);assert.equal(writes.length,atomicWrites);
  }
  await page.evaluate(()=>{const original=window.fetch;window.fetch=(url,init)=>String(url).endsWith('/propose')?Promise.reject(new DOMException('Fixture timeout','TimeoutError')):original(url,init);window.__restoreFetch=()=>{window.fetch=original}});
  await page.getByRole('button',{name:'AI đề xuất bố cục',exact:true}).click();await page.getByText(AI_LAYOUT_PRESERVED,{exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('.ed-toolbar[aria-busy="true"]'));assert.equal(await page.locator('.emg').evaluate(n=>n.outerHTML),atomicBefore);await page.evaluate(()=>window.__restoreFetch());
  pass("Atomic fallback keeps exact layout/controls/count/no writes for FALLBACK, malformed success, duplicate IDs, foreign media, changed prose, 401/403/429/500 and timeout");
  aiMode="success";let cycleCount;
  for(let i=0;i<3;i++){await page.getByRole('button',{name:'Tự động dàn trang',exact:true}).click();await page.getByRole('button',{name:'AI đề xuất bố cục',exact:true}).click();await page.getByText('Đề xuất AI fixture chưa lưu.',{exact:true}).waitFor();const count=aiRequests.at(-1).layout.blocks.length;cycleCount??=count;assert.equal(count,cycleCount);assert.equal(new Set(aiRequests.at(-1).layout.blocks.map(b=>b.id)).size,count);}
  pass("Repeated auto/AI cycle retains manual prose without block growth");aiMode="fallback";

  const categories=["thiên nhiên – thắng cảnh","di tích lịch sử – kiến trúc","làng du lịch – bản làng","điểm tham quan"];
  await page.getByRole("button",{name:"Tự động dàn trang",exact:true}).click();
  await page.getByRole("button",{name:"Thư viện ảnh",exact:true}).click();
  await page.getByLabel("Ảnh phong cảnh fixture 4",{exact:true}).uncheck();
  await page.getByRole("button",{name:"Ảnh mở đầu",exact:true}).click();
  await page.getByLabel("Ảnh phong cảnh fixture 4",{exact:true}).check();
  assert.equal(await page.getByLabel("Ảnh phong cảnh fixture 1",{exact:true}).isChecked(),false);
  assert((await page.locator(".emg-hero img").getAttribute("src")).includes("photo-3"));
  await page.getByRole("button",{name:"Mobile",exact:true}).click();assert.equal(await page.locator(".ed-preview.is-mobile").count(),1);
  await page.getByRole("button",{name:"Desktop",exact:true}).click();assert.equal(await page.locator(".ed-preview.is-mobile").count(),0);
  pass("Manual hero replacement uses attached approved media; Desktop/Mobile preview controls work");
  state = initial();
  state.context.media[0].websiteRights = "UNKNOWN";
  state.context.media[0].storageReference = JSON.stringify({...JSON.parse(state.context.media[0].storageReference),format:"jpg",websiteUse:ADMIN_IMAGE_USE,destinationId:state.context.id});
  state.context.media[1].websiteRights = "REJECTED";
  state.context.media[2].websiteRights = "UNKNOWN";
  await page.reload();
  await page.getByRole("button",{name:"Ảnh mở đầu",exact:true}).click();
  assert(await page.getByLabel("Ảnh phong cảnh fixture 1",{exact:true}).isEnabled());
  assert(await page.getByLabel("Ảnh phong cảnh fixture 2 · Không dùng trên website",{exact:true}).isDisabled());
  assert(await page.getByLabel("Ảnh phong cảnh fixture 3 · Không dùng trên website",{exact:true}).isDisabled());
  assert((await page.locator(".emg-hero img").getAttribute("src")).includes("photo-0"));
  await page.locator(".ed-media-picker").screenshot({path:`${directory}/website-eligible-upload-picker.png`});
  pass("UNKNOWN server-upload photo is immediately selectable/auto-arranged; REJECTED and legacy UNKNOWN stay disabled");
  const featureContext=editorialFixture(undefined,4);featureContext.name="Cao nguyên đá Đồng Văn";
  for(const typography of ["LITERARY","MODERN","HUMANIST"]) {
    const featureLayout={...autoLayout(featureContext),design:{typography,palette:"SLATE",rhythm:"IMMERSIVE"}};
    await page.evaluate(data=>window.mount(data),{data:featureContext,editorial:resolveEditorial(featureLayout,featureContext)});await page.locator(".emg").waitFor();
    await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:`${directory}/feature-${typography}-desktop.png`,fullPage:true});
    await page.evaluate(()=>{document.getElementById('app').style.maxWidth='850px'});const size=await page.locator(".emg h1").evaluate(n=>parseFloat(getComputedStyle(n).fontSize));assert(size<70);await page.screenshot({path:`${directory}/feature-${typography}-preview.png`,fullPage:true});
    await page.setViewportSize({width:390,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));await page.emulateMedia({reducedMotion:"reduce"});await page.screenshot({path:`${directory}/feature-${typography}-mobile.png`,fullPage:true});await page.evaluate(()=>{document.getElementById('app').style.maxWidth=''});
  }
  pass("Three font directions, long Vietnamese title, article-relative heading scale and narrow reduced-motion rendering");
  const geometry=[];
  for(const category of categories)for(const variant of ["PANORAMA","SPLIT","EDITORIAL"]){const context=editorialFixture(category,8);const layout={...autoLayout(context),variant};const editorial=resolveEditorial(layout,context);await page.evaluate(data=>window.mount(data),{data:context,editorial});await page.locator(".emg").waitFor();
    for(const width of [360,390,768,1024,1440])for(const theme of ["light","dark"]){await page.setViewportSize({width,height:1000});await page.evaluate(t=>document.documentElement.classList.toggle("dark",t==="dark"),theme);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));assert.equal(await page.locator(".emg img").count(),8);await page.screenshot({ animations: "disabled",path:`${directory}/${layout.family}-${variant}-${width}-${theme}.png`,fullPage:true});}
    await page.setViewportSize({width:1440,height:1000});const boxes=await page.locator(".emg-hero > *").evaluateAll(nodes=>nodes.map(n=>({x:n.getBoundingClientRect().x,y:n.getBoundingClientRect().y,w:n.getBoundingClientRect().width})));geometry.push({family:layout.family,variant,boxes});
  }
  for(const family of ["NATURE_SHOWCASE","HERITAGE_STORY","VILLAGE_CULTURE","JOURNEY_EDITORIAL"]){const g=geometry.filter(v=>v.family===family);assert.equal(new Set(g.map(v=>JSON.stringify(v.boxes))).size,3);}pass("Twelve actual family/variant compositions, five widths x light/dark, eight photos no duplicates");
  for(const count of [0,1,2,4]){const context=editorialFixture(undefined,count);const editorial=resolveEditorial(autoLayout(context),context);await page.evaluate(data=>window.mount(data),{data:context,editorial});await page.locator(".emg").waitFor();assert.equal(await page.locator(".emg img").count(),count);for(const width of [360,390,768,1024,1440])for(const theme of ["light","dark"]){await page.setViewportSize({width,height:1000});await page.evaluate(t=>document.documentElement.classList.toggle("dark",t==="dark"),theme);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));await page.screenshot({ animations: "disabled",path:`${directory}/photos-${count}-${width}-${theme}.png`,fullPage:true});}}pass("Zero/one/two/four images: no empty image slots, no duplicated photos");
  photoFailure=true;const context=editorialFixture(undefined,1);context.media[0].url += "?failure-test=1";await page.evaluate(data=>window.mount(data),{data:context,editorial:resolveEditorial(autoLayout(context),context)});await page.getByText("Ảnh tạm không khả dụng",{exact:true}).waitFor();pass("Cloudinary image delivery failure retains safe fixed-ratio fallback");
  photoFailure=false;
  const publicContext=editorialFixture(undefined,4);
  const destination={id:publicContext.id,name:publicContext.name,description:publicContext.description,category:publicContext.category,area:publicContext.area,latitude:publicContext.latitude,longitude:publicContext.longitude,suggestedDurationMinutes:publicContext.suggestedDurationMinutes,openingDays:publicContext.openingDays,relatedCulture:[],profile:{shortDescription:"Hồ sơ public fixture",aliases:[],address:"Địa chỉ fixture",googleMapsUrl:null,locationVerified:false,ticketPrice:null,ticketVerification:"UNKNOWN",bestVisitTime:null,visitNotes:null,areas:[],sources:publicContext.sources.map(s=>({title:s.title,url:s.url,author:null,publisher:null,publishedOn:null})),media:publicContext.media.map(({url,alt,caption,author,sourceUrl,isCover})=>({url,alt,caption,author,sourceUrl,isCover}))}};
  state={...initial(),context:publicContext,draft:autoLayout(publicContext),draftRevision:1};
  await page.reload();await page.locator(".ed-page").waitFor();
  await page.locator(".ed-preview .emg").waitFor();
  const previewMarkup=await page.locator(".ed-preview .emg").evaluate(n=>n.outerHTML);
  const sharedEditorial=resolveEditorial(state.draft,state.context);
  await page.evaluate(data=>window.mount(data),{data:state.context,editorial:sharedEditorial});await page.locator(".emg").waitFor();
  const standaloneMarkup=await page.locator(".emg").evaluate(n=>n.outerHTML);
  assert.equal(standaloneMarkup,previewMarkup);
  pass("Admin Preview and standalone renderer produce identical article markup for the same resolved layout");
  for(const published of [false,true]) {
    const editorial=published?resolveEditorial(autoLayout(publicContext),publicContext):null;
    await page.evaluate(data=>window.mountPublic(data),{destination,editorial});await page.locator(".public-detail").waitFor();
    assert.equal(await page.locator(".emg").count(),published?1:0);
    if(published)assert.equal(await page.locator(".public-detail .emg").evaluate(n=>n.outerHTML),standaloneMarkup);
    await page.getByRole("link",{name:"Quay lại Khám phá"}).waitFor();
    assert.equal(await page.getByRole("link",{name:/Hỏi trợ lý AI/}).getAttribute("href"),"/assistant?destinationId=fixture");
    assert.equal(await page.getByRole("heading",{name:destination.name,exact:true}).count(),1);
    if(!published){await page.getByRole("heading",{name:"Vị trí",exact:true}).waitFor();await page.getByRole("heading",{name:"Thông tin hồ sơ",exact:true}).waitFor();}
    for(const width of [360,390,768,1024,1440])for(const theme of ["light","dark"]){await page.setViewportSize({width,height:1000});await page.evaluate(t=>document.documentElement.classList.toggle("dark",t==="dark"),theme);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));await page.screenshot({ animations: "disabled",path:`${directory}/public-${published?"published":"standard-fallback"}-${width}-${theme}.png`,fullPage:true});}
  }
  pass("Production public detail shell: standard fallback and published magazine, navigation/AI CTA preserved, five widths x light/dark");
  const emptyFolder=web+"/.cache/editorial-ai-empty/screenshots";await mkdir(emptyFolder,{recursive:true});
  const sparseContext={...editorialFixture(undefined,0),area:"",category:"",description:"",suggestedDurationMinutes:null,latitude:999,longitude:999,sources:[]};
  const sparseLayout={...autoLayout(sparseContext),blocks:[editorialBlockSchema.parse({id:"hero",type:"HERO",title:sparseContext.name}),...['INTRO','TEXT_SECTION','HIGHLIGHT_FACTS','VISIT_INFORMATION','MAP','SOURCES','IMAGE_GALLERY','IMAGE_TEXT_SPLIT'].map((type,i)=>editorialBlockSchema.parse({id:`empty-${i}`,type}))]};
  const partialContext={...sparseContext,area:"Hà Giang",openingDays:[{dayOfWeek:'SUNDAY',status:'CLOSED',intervals:[]},{dayOfWeek:'MONDAY',status:'UNKNOWN',intervals:[]}]};
  const namedContext={...editorialFixture(undefined,3),name:'Cao nguyên đá Đồng Văn'};
  const visualCases=[['dong-van-fixture',namedContext,autoLayout(namedContext)],['full',editorialFixture(),autoLayout(editorialFixture())],['sparse',sparseContext,sparseLayout],['partial',partialContext,sparseLayout],['no-photo',editorialFixture(undefined,0),autoLayout(editorialFixture(undefined,0))],['many-photo',editorialFixture(undefined,8),autoLayout(editorialFixture(undefined,8))]];
  try{const saved=JSON.parse(await readFile(web+'/.cache/editorial-ai-empty/owner-readonly-snapshot.json','utf8'));visualCases.push(['owner-readonly',saved.context,saved.layout])}catch{}
  const emptyMetrics=[];
  for(const [slug,context,layout] of visualCases){
    const canonicalBefore=JSON.stringify({context,layout});state={...initial(),context,draft:layout,draftRevision:1};await page.evaluate(()=>window.mount());await page.locator('.ed-preview .emg').waitFor();
    const adminMarkup=await page.locator('.ed-preview .emg').evaluate(n=>n.outerHTML),shared=resolveEditorial(layout,context);
    if(slug==='sparse'){assert(await page.getByRole('button',{name:/Tự ẩn/}).count()>0);await page.getByRole('button',{name:'Thông tin nổi bật · Tự ẩn',exact:true}).click();await page.getByText(/Tự ẩn · Chưa có nội dung hoặc tham chiếu đủ điều kiện/).waitFor();assert.equal(await page.getByLabel('Hiển thị block',{exact:true}).isChecked(),true)}
    for(const width of [390,768,1440])for(const theme of ['light','dark']){
      await page.setViewportSize({width,height:1000});await page.evaluate(t=>document.documentElement.classList.toggle('dark',t==='dark'),theme);await page.getByRole('button',{name:'Mobile',exact:true}).click();assert.equal(await page.locator('.ed-preview .emg').evaluate(n=>n.outerHTML),adminMarkup);await page.getByRole('button',{name:'Desktop',exact:true}).click();
    }
    await page.evaluate(value=>window.mountPublic(value),{destination:{...destination,...context,profile:undefined,relatedCulture:[]},editorial:shared});await page.locator('.public-detail .emg').waitFor();assert.equal(await page.locator('.public-detail .emg').evaluate(n=>n.outerHTML),adminMarkup);
    for(const width of [390,768,1440])for(const theme of ['light','dark']){
      await page.setViewportSize({width,height:1000});await page.evaluate(t=>document.documentElement.classList.toggle('dark',t==='dark'),theme);await page.evaluate(()=>document.fonts.ready);await page.locator('.emg img').evaluateAll(imgs=>Promise.all(imgs.map(img=>{img.loading='eager';return img.decode().catch(()=>{})})));
      const metrics=await page.locator('.emg').evaluate(root=>{
        const norm=t=>t.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();const paras=[...root.querySelectorAll('.emg-prose p')].map(n=>norm(n.textContent));const overlap=(a,b)=>{if(!a||!b)return false;const x=a.getBoundingClientRect(),y=b.getBoundingClientRect();return x.left<y.right-1&&x.right>y.left+1&&x.top<y.bottom-1&&x.bottom>y.top+1};
        return{overflow:document.documentElement.scrollWidth>innerWidth,textOverflow:[...root.querySelectorAll('h1,h2,p,dd,strong')].some(n=>n.scrollWidth>n.clientWidth+1),emptyHeading:[...root.querySelectorAll('h1,h2,h3')].some(n=>!n.textContent.trim()),emptyList:[...root.querySelectorAll('dl,ul,ol')].some(n=>!n.children.length),placeholder:[...root.querySelectorAll('p,dd,strong,li')].some(n=>/^(chưa có dữ liệu|đang cập nhật|không có thông tin|n\/?a|undefined|null)$/iu.test(n.textContent.trim())),duplicate:paras.some((p,i)=>p&&paras.indexOf(p)!==i),overlap:[...root.querySelectorAll('.emg-split:not(.emg-photo-only):not(.emg-image-full)')].some(n=>overlap(n.querySelector('.emg-prose'),n.querySelector('.emg-story-image'))),missingImage:[...root.querySelectorAll('img')].some(i=>!i.complete||!i.naturalWidth)};
      });for(const [key,value] of Object.entries(metrics))assert.equal(value,false,`${slug}/${width}/${theme}: ${key}`);emptyMetrics.push({slug,width,theme,...metrics});await page.screenshot({path:`${emptyFolder}/${slug}-${width}-${theme}.png`,fullPage:true});
    }
    if(slug==='sparse'){assert.equal(await page.locator('.emg > section').count(),0);assert.equal(await page.locator('.emg img').count(),0);await page.evaluate(value=>window.mountPublic(value),{destination:{...destination,...context,profile:undefined,relatedCulture:[]},editorial:null});await page.locator('.public-detail').waitFor();assert.equal(await page.locator('.public-detail-hours,.public-detail-facts-card,.public-detail-location').count(),0)}
    assert.equal(JSON.stringify({context,layout}),canonicalBefore);
  }
  await writeFile(web+'/.cache/editorial-ai-empty/visual-results.json',JSON.stringify(emptyMetrics,null,2));pass(`Smart-empty visual cases: ${visualCases.length} destinations x 390/768/1440 x light/dark; desktop/mobile Preview/Public parity, preserved drafts and no placeholders/empty blocks/duplicates/overflow/overlap`);
  assert.deepEqual(errors,[]);await writeFile(`${directory}/results.json`,JSON.stringify({checks,passed:checks.length,geometry,evidence:"Production editor/renderer; mock HTTP, media and map; no live provider/Neon"},null,2));console.log(JSON.stringify({passed:checks.length,screenshots:directory}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
