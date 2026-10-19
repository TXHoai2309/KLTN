import { createRequire } from "node:module";
import { writeFile,mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { safeOrigin } from "./metrics.mjs";
const [originInput="http://localhost:3098",modulePath="playwright",output="docs/performance/evidence/browser-regression.json",productionFlag]=process.argv.slice(2);
const origin=safeOrigin(originInput);
const production=origin==="https://kltn-rho.vercel.app"&&productionFlag==="--allow-production-read-only";
if(!production&&!["localhost","127.0.0.1"].includes(new URL(origin).hostname))throw Error("Loopback or explicit fixed Production read-only smoke required");
const {chromium}=createRequire(import.meta.url)(modulePath);
const browser=await chromium.launch({headless:true});
const observations=[],writesBlocked=[];
try {
  const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:"block",reducedMotion:"reduce"});
  await context.route("**/*",route=>{
    if(!["GET","HEAD"].includes(route.request().method())){writesBlocked.push({method:route.request().method(),path:new URL(route.request().url()).pathname});return route.abort("blockedbyclient");}
    return route.continue();
  });
  const page=await context.newPage();
  const list=await (await fetch(origin+"/api/destinations")).json();const ids=list.data.items.map(d=>d.id);
  if(ids.length!==3)throw Error("Expected verified three-destination cohort");
  for(const width of [390,768,1440]){
    await page.setViewportSize({width,height:900});
    for(const route of ["/","/explore?view=map",`/destinations/${ids[0]}`]){
      const response=await page.goto(origin+route,{waitUntil:"load",timeout:30000});
      let markersReady=null;
      if(route!=="/")try{await page.waitForFunction(n=>document.querySelectorAll(".maplibregl-marker").length===n,route.startsWith("/explore")?3:1,{timeout:20000});markersReady=true;}catch{markersReady=false;}
      const state=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,mapMarkers:document.querySelectorAll(".maplibregl-marker").length,mapUnavailable:document.body.innerText.includes("Bản đồ hiện không khả dụng")}));
      const result={route,width,status:response?.status(),markersReady,...state};observations.push(result);
      console.log(JSON.stringify(result));
      if(route==="/"){
        const theme=page.getByRole("button",{name:"Chuyển giao diện sáng/tối"}).first();
        await theme.click();await page.keyboard.press("Escape");
        observations.push({route:"/",width,check:"theme-menu-keyboard-open-escape",pass:await theme.isVisible()});
      }
    }
  }
  for(const route of ["/login","/favorites","/trips/new","/trips","/admin/destinations","/admin/rag"]){
    const response=await page.goto(origin+route,{waitUntil:"load",timeout:30000});await page.waitForTimeout(300);
    observations.push({route,width:1440,status:response?.status(),finalPath:new URL(page.url()).pathname,role:"GUEST",authorizedWorkloadVerified:false});
  }
  const api=[];for(const route of ["/api/favorites","/api/trips","/api/admin/destinations","/api/admin/rag-documents"]){const r=await fetch(origin+route);api.push({route,status:r.status,expected:401});}
  const failures=observations.filter(o=>o.overflow||o.markersReady===false||o.mapUnavailable||o.status>=500||o.pass===false).length+api.filter(a=>a.status!==a.expected).length;
  const report={checkedAt:new Date().toISOString(),origin,mode:"independent Guest browser; no credentials; all non-GET/HEAD blocked; no app mutations; normal network, no CPU throttle; map readiness allowed20s",observations,api,writesBlocked,failures,traveler:"NOT_TESTED_IN_THIS_GUEST_SMOKE",admin:"NOT_TESTED_IN_THIS_GUEST_SMOKE",status:failures?"FAIL":production?"PASS_PRODUCTION_GUEST_SCOPE_ONLY":"PASS_LOCAL_GUEST_SCOPE_ONLY"};
  await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+"\n");if(failures)process.exitCode=1;
}finally{await browser.close();}
