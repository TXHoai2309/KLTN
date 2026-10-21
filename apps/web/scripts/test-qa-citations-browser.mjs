/** Offline production-component verification. No application API or external article is contacted. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile,mkdtemp } from "node:fs/promises";
import { tmpdir,homedir } from "node:os";
import { resolve,join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
const require=createRequire(import.meta.url);
const {chromium}=require(require.resolve("playwright",{paths:[join(homedir(),".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules")]}));
const root=fileURLToPath(new URL("..",import.meta.url));
const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{AssistantAnswer}from'./src/components/assistant/assistant-chat';import{citationFixture}from'./development/assistant-citation-fixtures';const turn=citationFixture('LONG');turn.citations.find(c=>c.id==='fixture_c3').sourceUrl='https://example.com/';createRoot(document.getElementById('root')).render(<AssistantAnswer turn={turn}/>);`,resolveDir:root,loader:"tsx"},bundle:true,write:false,platform:"browser",jsx:"automatic",define:{"process.env.NODE_ENV":'"production"'},loader:{".css":"empty"}});
const css=(await Promise.all(["assistant.css","assistant-citations.css"].map(file=>readFile(resolve(root,"src/components/assistant",file),"utf8")))).join("\n");
const server=createServer((req,res)=>{res.setHeader("Content-Type",req.url==="/bundle.js"?"text/javascript":"text/html; charset=utf-8");res.end(req.url==="/bundle.js"?bundle.outputFiles[0].text:`<!doctype html><html lang="vi"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}body{margin:0;padding:16px;font-family:Arial,sans-serif}main{max-width:760px;margin:auto;overflow:auto;min-height:100vh}.dark body{background:#121c16}*{box-sizing:border-box}</style></head><body><main class="assistant-page"><article class="assistant-message assistant-answer"><div id="root"></div></article></main><script src="/bundle.js"></script></body></html>`);});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const browser=await chromium.launch({channel:"chrome",headless:true});
const output=await mkdtemp(join(tmpdir(),"kltn-citation-browser-"));
const passed=[];
try{
 const page=await browser.newPage();const errors=[];page.on("pageerror",error=>errors.push(error.message));
 await page.route("**/*",route=>new URL(route.request().url()).hostname==="127.0.0.1"?route.continue():route.abort());
 for(const width of [360,1440]){
  await page.setViewportSize({width,height:900});await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator(".assistant-citation-ref").first().waitFor();
  assert.equal(await page.locator(".assistant-answer-sources").count(),1);
  assert.equal(await page.locator(".assistant-source-list > li").count(),2); // shared original URL deduplicated
  const fallback=page.locator('.assistant-citation-ref[href^="#"]').first();await fallback.focus();await page.keyboard.press("Enter");
  assert.equal(await page.locator(".assistant-answer-sources").getAttribute("open"),"");
  assert.equal(await page.evaluate(()=>document.activeElement?.id),(await fallback.getAttribute("href")).slice(1));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const link=page.locator('.assistant-citation-ref[target="_blank"]').first();
  assert.equal(await link.getAttribute("href"),"https://example.com/");assert.equal(await link.getAttribute("rel"),"noopener noreferrer");
  assert.match(await link.getAttribute("aria-label"),/tab mới/u);
  const box=await link.boundingBox();assert.ok(box.width>=24&&box.height>=24);
  await page.screenshot({path:join(output,`${width}-light.png`),fullPage:true});
  await page.evaluate(()=>document.documentElement.classList.add("dark"));
  await page.screenshot({path:join(output,`${width}-dark.png`),fullPage:true});
  passed.push(`${width}px: dedup, fallback Enter/focus, title wrapping, link semantics, target size, light/dark`);
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed,screenshots:output}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
