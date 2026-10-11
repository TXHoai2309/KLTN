import { build } from "esbuild";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { readFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const require=createRequire(import.meta.url);
const { chromium }=require(require.resolve("playwright",{paths:process.env.PLAYWRIGHT_MODULE_DIR?[process.env.PLAYWRIGHT_MODULE_DIR]:undefined}));
const web=fileURLToPath(new URL("../",import.meta.url));
const result=await build({absWorkingDir:web,stdin:{contents:'import React from "react";import {createRoot} from "react-dom/client";import {RagIndexPanel} from "./src/app/admin/rag/rag-index-panel";window.mount=(status)=>{window.root?.unmount();window.root=createRoot(document.getElementById("app"));window.root.render(<div className="destination-page"><RagIndexPanel documentId="synthetic-document" status={status} onCompleted={()=>window.completed=(window.completed||0)+1}/></div>);};window.mount("APPROVED");',resolveDir:web,loader:"tsx"},bundle:true,write:false,platform:"browser",format:"iife",tsconfig:"tsconfig.json",define:{"process.env.NODE_ENV":'"development"'}});
const css=await readFile(new URL("../src/app/admin/destinations/destinations.css",import.meta.url),"utf8")+await readFile(new URL("../src/app/admin/rag/rag-index-panel.css",import.meta.url),"utf8");
const server=createServer((req,res)=>{res.setHeader("Content-Type",req.url==="/bundle.js"?"application/javascript":"text/html");res.end(req.url==="/bundle.js"?result.outputFiles[0].text:'<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font-family:Arial}'+css+'</style></head><body><div id="app"></div><script src="/bundle.js"></script></body></html>');});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
let browser;try{browser=await chromium.launch({channel:"chrome",headless:true});const page=await browser.newPage();
let job=null,postMode="success",getMode="ok",getDelay=0;const posts=[];let reads=0,activeReads=0,peakReads=0;
const sample=(status="RUNNING",phase="EMBEDDING")=>({jobId:"synthetic-job",status,phase,attemptCount:1,failureCode:null,warningCodes:null,chunksPersisted:4,embeddingsPersisted:2,totalChunks:4,updatedAt:new Date().toISOString(),completedAt:null,recoveryRequired:false});
await page.route("**/api/admin/rag-documents/**/index",async route=>{
 if(route.request().method()==="POST"){posts.push({body:route.request().postData(),key:route.request().headers()["idempotency-key"]});if(postMode==="unknown")return route.abort();await new Promise(r=>setTimeout(r,100));return route.fulfill({json:{success:true,operationStatus:"SUCCESS",data:{jobId:"synthetic-job"}}});}
 reads++;activeReads++;peakReads=Math.max(peakReads,activeReads);const snapshot=job;await new Promise(r=>setTimeout(r,getDelay));activeReads--;return route.fulfill({status:getMode==="error"?503:200,json:getMode==="error"?{success:false}:{success:true,data:{job:snapshot}}});});
const url="http://127.0.0.1:"+server.address().port;
await page.goto(url);await page.getByRole("button",{name:"Lập chỉ mục",exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector("button").disabled);
assert.equal(await page.getByRole("button",{name:"Lập chỉ mục",exact:true}).isEnabled(),true);
await page.evaluate(()=>{const b=document.querySelector("button");b.click();b.click();});await page.waitForTimeout(250);assert.equal(posts.length,1);
job=sample();await page.getByRole("button",{name:"Đọc lại trạng thái"}).click();await page.waitForTimeout(150);assert.equal(await page.getByRole("button",{name:"Lập chỉ mục",exact:true}).isEnabled(),false);assert.match(await page.locator("body").innerText(),/50% embeddings/);
job=sample("UNKNOWN");await page.getByRole("button",{name:"Đọc lại trạng thái"}).click();await page.waitForTimeout(150);assert.match(await page.locator("body").innerText(),/Không tự thử lại embeddings/);assert.equal(await page.getByRole("button",{name:"Lập chỉ mục",exact:true}).isEnabled(),false);
job=sample("FAILED");await page.getByRole("button",{name:"Đọc lại trạng thái"}).click();await page.waitForTimeout(150);await page.getByRole("button",{name:"Thử lập chỉ mục lại"}).click();await page.waitForTimeout(250);assert.equal(JSON.parse(posts.at(-1).body).action,"RETRY");assert.notEqual(posts[0].key,posts.at(-1).key);
job=null;postMode="unknown";await page.evaluate(()=>window.mount("APPROVED"));await page.waitForTimeout(150);await page.getByRole("button",{name:"Lập chỉ mục",exact:true}).click();await page.getByRole("button",{name:"Đối soát cùng yêu cầu"}).waitFor();const lost=posts.at(-1);await page.getByRole("button",{name:"Đối soát cùng yêu cầu"}).click();await page.waitForTimeout(150);assert.deepEqual(posts.at(-1),lost);
job={...sample("QUEUED","QUEUED"),recoveryRequired:true};postMode="success";await page.evaluate(()=>window.mount("INDEXED"));await page.waitForTimeout(150);await page.getByRole("button",{name:"Tiếp tục tác vụ"}).click();await page.waitForTimeout(250);assert.equal(JSON.parse(posts.at(-1).body).action,"RESUME");
job={...sample("COMPLETED","COMPLETED"),embeddingsPersisted:4,completedAt:new Date().toISOString()};await page.getByRole("button",{name:"Đọc lại trạng thái"}).click();await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>window.completed),1);assert.match(await page.locator("body").innerText(),/Đã công bố chỉ mục thành công/);
getMode="error";await page.getByRole("button",{name:"Đọc lại trạng thái"}).click();await page.waitForTimeout(150);assert.match(await page.locator("body").innerText(),/chưa phải lỗi xử lý/);getMode="ok";
getDelay=2300;job=sample();await page.getByRole("button",{name:"Đọc lại trạng thái"}).click();await page.waitForTimeout(4700);assert.equal(peakReads,1);getDelay=0;
const before=reads;await page.evaluate(()=>window.root.unmount());await page.waitForTimeout(2500);assert.equal(reads,before);
// A response from a discarded panel must not replace the next panel's state.
getDelay=500;job=sample("FAILED");await page.evaluate(()=>window.mount("APPROVED"));await page.waitForTimeout(100);
job=null;getDelay=0;await page.evaluate(()=>window.mount("INDEXED"));await page.waitForTimeout(700);
assert.equal(await page.getByRole("button",{name:"Lập chỉ mục lại",exact:true}).isEnabled(),true);
assert.doesNotMatch(await page.locator("body").innerText(),/Thất bại/);
await mkdir(new URL("../.cache/rag-index-ui/",import.meta.url),{recursive:true});job=null;await page.evaluate(()=>window.mount("INDEXED"));await page.waitForTimeout(150);
for(const width of [1440,360])for(const dark of [false,true]){await page.setViewportSize({width,height:900});await page.evaluate(d=>document.documentElement.classList.toggle("dark",d),dark);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:web+"/.cache/rag-index-ui/"+width+"-"+(dark?"dark":"light")+".png",fullPage:true});}
job=sample();await page.getByRole("button",{name:"Đọc lại trạng thái"}).click();await page.waitForTimeout(150);await page.screenshot({path:web+"/.cache/rag-index-ui/360-dark-progress.png",fullPage:true});
job=null;await page.getByRole("button",{name:"Đọc lại trạng thái"}).click();await page.waitForTimeout(150);
await page.getByRole("button",{name:"Lập chỉ mục lại",exact:true}).focus();await page.keyboard.press("Tab");
assert.equal(await page.getByRole("button",{name:"Đọc lại trạng thái"}).evaluate(el=>el===document.activeElement),true);
const keyboardReads=reads;await page.keyboard.press("Enter");await page.waitForTimeout(150);assert.ok(reads>keyboardReads);
console.log("UI_BROWSER=PASS: admission/double-submit, persisted progress, UNKNOWN guard, retry key, same-key reconciliation, resume, completed refresh, read error, serial polling, unmount, mobile/theme/keyboard.");
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
