/** Local TEST fixture only. Real UI/service/engine, synthetic repository/routing; no DB/provider. */
import { build } from "esbuild";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createPlannerService } from "../src/modules/trip-planner/planner-service";
import { candidates, fakeRoutes, referenceTime } from "../src/modules/trip-planner/__fixtures__/planner-fixtures";
import { tripRequirementInputSchema } from "../src/modules/trip-requirement/trip-requirement-contract";
import { evaluateTripRequirement } from "../src/modules/trip-requirement/trip-requirement-readiness";
import { checkTripRequirement } from "../src/modules/trip-requirement/trip-requirement-check";
import { deriveClarificationsFromCheck } from "../src/modules/trip-requirement/trip-clarification-rules";
import { missingLeg, createStadiaRoutesProvider } from "../src/modules/trip-planner/planner-routes";
if (process.env.NODE_ENV === "production") throw new Error("Local test fixture only");
const web = fileURLToPath(new URL("../", import.meta.url));
let scenario = "FULL";
let requests = 0;
let service = makeService();
function makeService() { return createPlannerService({ repository: { candidates: async () => { if (scenario === "ERROR") throw new Error("synthetic failure"); return scenario === "EMPTY" ? [] : candidates; }, recheck: async () => true }, routes: { route: async (pair, signal) => scenario === "NOT_CONFIGURED" ? createStadiaRoutesProvider({apiKey:()=>undefined}).route(pair,signal) : scenario === "MISSING_ROUTE" ? missingLeg(pair,"NO_ROUTE") : fakeRoutes.route(pair,signal) }, now: () => referenceTime }); }
const bundle = await build({ absWorkingDir: web, stdin: { contents: `import React from "react";import {createRoot} from "react-dom/client";import Form from "./src/app/trips/new/trip-requirement-form";import "./src/app/trips/new/trip-form.css";import "maplibre-gl/dist/maplibre-gl.css";const root=createRoot(document.getElementById("app"));root.render(<div className="trip-shell"><Form/></div>);`, loader: "tsx", resolveDir: web }, bundle: true, write: false, outfile: "fixture.js", platform: "browser", format: "iife", jsx: "automatic", tsconfig: "tsconfig.json", define: { "process.env.NODE_ENV": '"development"' }, plugins: [{ name: "offline-map-style-only", setup(builder) { builder.onResolve({filter: /modules\/map\/map-config$/},()=>({path:"map-config",namespace:"test-map"}));builder.onLoad({filter:/.*/,namespace:"test-map"},()=>({resolveDir:web,loader:"js",contents:'export const mapStyle=()=>"/test-map-style.json";export async function loadMapLibre(){const m=await import("maplibre-gl");m.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");return m;}'})); } }] });
const js = bundle.outputFiles.find(file=>file.path.endsWith(".js"))!.contents;
const css = bundle.outputFiles.filter(file=>file.path.endsWith(".css")).map(file=>file.text).join("\n");
const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>US28 TEST · Offline component fixture</title><link rel="stylesheet" href="/fixture.css"><style>body{margin:0;font-family:Arial,sans-serif;background:#f7f9f7}.fixture-banner{padding:10px 16px;background:#173f32;color:white;display:flex;gap:15px;flex-wrap:wrap;font-size:12px}.fixture-banner button{min-height:35px;padding:7px 10px;background:white;color:#173f32;border-radius:7px;border:none}.trip-submit-button{background:#087f5b;color:white;border:0;border-radius:10px}.trip-secondary-button{border:1px solid #89b8a5;border-radius:10px;background:white;color:#087f5b}</style></head><body><div class="fixture-banner"><strong>KLTN · US28 TEST — données synthétiques / dữ liệu kiểm thử — no live providers</strong><button onclick="change('FULL')">Fixture đủ dữ liệu</button><button onclick="change('MISSING_ROUTE')">Fixture thiếu route</button><button onclick="change('EMPTY')">Fixture không có điểm</button><button onclick="change('ERROR')">Fixture lỗi hệ thống</button><output id="scenario">FULL</output></div><div id="app"></div><script>async function change(s){await fetch('/fixture-scenario?value='+s);document.getElementById('scenario').textContent=s;}</script><script src="/fixture.js"></script></body></html>`;
const server = createServer(async(request,response)=>{
  response.setHeader("Cache-Control","no-store");
  const url=new URL(request.url??"/","http://127.0.0.1:3012");
  const send=(value:unknown,status=200)=>{response.writeHead(status,{"Content-Type":"application/json"});response.end(JSON.stringify(value));};
  if(request.method==="GET"){
    if(url.pathname==="/"){response.setHeader("Content-Type","text/html;charset=utf-8");response.end(html.replace('<output id="scenario">FULL</output>',`<output id="scenario">${scenario}</output>`));return;}
    if(url.pathname==="/fixture.js"){response.setHeader("Content-Type","text/javascript");response.end(js);return;}
    if(url.pathname==="/fixture.css"){response.setHeader("Content-Type","text/css");response.end(css);return;}
    if(url.pathname==="/test-map-style.json"){send({version:8,sources:{},layers:[{id:"background",type:"background",paint:{"background-color":"#dce9dc"}}]});return;}
    if(url.pathname==="/fixture-scenario"){const next=url.searchParams.get("value");if(next&&["FULL","NOT_CONFIGURED","MISSING_ROUTE","EMPTY","ERROR"].includes(next)){scenario=next;service=makeService();}send({scenario});return;}
    if(url.pathname==="/fixture-stats"){send({scenario,requests});return;}
    if(["/maplibre/maplibre-gl-worker.mjs","/maplibre/maplibre-gl-shared.mjs"].includes(url.pathname)){try{response.setHeader("Content-Type","text/javascript");response.end(await readFile(new URL(`../public${url.pathname}`,import.meta.url)));}catch{response.writeHead(404);response.end();}return;}
  }
  if(request.method==="POST"){
    let raw="";for await(const chunk of request){raw+=chunk;if(raw.length>8192){send({success:false},400);return;}}
    try {const body=JSON.parse(raw);
      if(url.pathname==="/api/trip-requirements/evaluate"){const requirement=tripRequirementInputSchema.parse(body);send({success:true,data:{requirement,readiness:evaluateTripRequirement(requirement,referenceTime)}});return;}
      if(url.pathname==="/api/trip-requirements/check"){const checked=checkTripRequirement(body,referenceTime);send({success:true,data:{...checked,clarificationRequests:deriveClarificationsFromCheck(checked)}});return;}
      if(url.pathname==="/api/trip-proposals"){requests++;const result=await service.propose("fixture-traveler",String(request.headers["idempotency-key"]??""),body.requirement);send({success:true,data:result});return;}
    }catch{send({success:false,error:{code:"PLANNER_UNAVAILABLE",message:"Synthetic test failure"}},503);return;}
  }
  response.writeHead(404);response.end();
});
server.listen(3012,"127.0.0.1",()=>console.log("US28_OFFLINE_FIXTURE=http://127.0.0.1:3012; synthetic adapters only, no DB/external routing"));
