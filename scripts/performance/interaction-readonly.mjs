import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
const [modulePath="playwright",output="docs/performance/evidence/interaction-local-after.json"]=process.argv.slice(2);
const {chromium}=createRequire(import.meta.url)(modulePath),browser=await chromium.launch({headless:true});
const observations=[];
try{
  for(const width of [390,768,1440]){
    const context=await browser.newContext({viewport:{width,height:900},reducedMotion:"reduce",serviceWorkers:"block"});
    await context.route("**/*",r=>["GET","HEAD"].includes(r.request().method())?r.continue():r.abort("blockedbyclient"));
    const page=await context.newPage(),cdp=await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate",{rate:width===390?4:1});
    await page.addInitScript(()=>{
      window.__eventSample={supported:PerformanceObserver.supportedEntryTypes.includes("event"),entries:[]};
      if(window.__eventSample.supported)new PerformanceObserver(list=>{
        for(const e of list.getEntries())if(e.interactionId&&window.__eventSample.entries.length<100)window.__eventSample.entries.push({name:e.name,durationMs:e.duration,interactionId:e.interactionId,inputDelayMs:e.processingStart-e.startTime,processingMs:e.processingEnd-e.processingStart,presentationDelayMs:Math.max(0,e.startTime+e.duration-e.processingEnd)});
      }).observe({type:"event",buffered:true,durationThreshold:16});
    });
    const response=await page.goto("http://localhost:3098",{waitUntil:"load",timeout:30000});
    const theme=page.getByRole("button",{name:"Chuyển giao diện sáng/tối"}).first();
    await theme.click();await page.waitForTimeout(100);await page.keyboard.press("Escape");await page.waitForTimeout(150);
    const sample=await page.evaluate(()=>window.__eventSample);
    observations.push({width,status:response?.status(),cpuSlowdown:width===390?4:1,...sample,sampledMaxEventDurationMs:sample.entries.length?Math.max(...sample.entries.map(e=>e.durationMs)):null,interpretation:sample.entries.length?"Synthetic maximum event duration for theme click/Escape; NOT field INP, no before/after win claim":"No events reported above16ms threshold; NOT a claim of zero INP"});
    await context.close();
  }
}finally{await browser.close();}
await writeFile(output,JSON.stringify({checkedAt:new Date().toISOString(),scope:"post-fix loopback Guest; controlled theme-menu click + Escape; no DB/model/routing writes",fieldInp:null,observations},null,2)+"\n");
console.log(JSON.stringify(observations,null,2));
