/** Loopback-only visual fixture. Synthetic route shapes; no DB/auth/provider calls. */
import { build } from "esbuild";
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { createPlannerService } from "../src/modules/trip-planner/planner-service";
import { candidate, fakeRoutes, referenceTime, requirement } from "../src/modules/trip-planner/__fixtures__/planner-fixtures";
import { missingLeg } from "../src/modules/trip-planner/planner-routes";

if (process.env.NODE_ENV === "production") throw new Error("Local visual fixture only");
const web = fileURLToPath(new URL("../", import.meta.url));
const rows = [
  candidate("a", { name: "TEST Căng Bắc Mê", latitude: 22.7308573, longitude: 105.3745508 }),
  candidate("b", { name: "TEST Cổng trời Quản Bạ", latitude: 23.0645, longitude: 104.9928 }),
  candidate("c", { name: "TEST Dinh họ Vương", latitude: 23.2483, longitude: 105.2447 }),
  candidate("d", { name: "TEST Lũng Cú", latitude: 23.3619, longitude: 105.3186 }),
  candidate("e", { name: "TEST Phố cổ Đồng Văn", latitude: 23.2785, longitude: 105.3614 }),
  candidate("f", { name: "TEST Mã Pí Lèng", latitude: 23.2415, longitude: 105.4168 }),
  candidate("g", { name: "TEST Sông Nho Quế", latitude: 23.2201, longitude: 105.4332 }),
];
let scenario = "FULL", requests = 0;
const bundle = await build({ absWorkingDir: web, stdin: { contents: `
import React,{useState,useEffect} from 'react';import {createRoot} from 'react-dom/client';import {ThemeProvider,useTheme} from 'next-themes';
import {TripPlannerScreen} from './src/components/trip-planner/trip-planner-screen';
import './src/app/trips/new/trip-form.css';import './src/app/trips/new/trip-planning-layout.css';import 'maplibre-gl/dist/maplibre-gl.css';
function App(){const [proposal,setProposal]=useState(null);const {resolvedTheme,setTheme}=useTheme();async function load(value='FULL'){const r=await fetch('/proposal?scenario='+value);setProposal(await r.json());}useEffect(()=>{load();},[]);return <><div className="fixture-banner"><strong>Dữ liệu kiểm thử · Hình tuyến tổng hợp</strong><button onClick={()=>setTheme(resolvedTheme==='dark'?'light':'dark')}>Sáng / Tối</button>{[['FULL','Đầy đủ'],['NO_SHAPE','Thiếu hình tuyến'],['MISSING','Thiếu dữ liệu đường'],['EMPTY','Không có điểm']].map(([v,t])=><button key={v} onClick={()=>load(v)}>{t}</button>)}</div><div className="trip-shell">{proposal?<TripPlannerScreen proposal={proposal} embedded onBack={()=>{}} onRegenerate={()=>load()} onSaved={()=>{}}/>:<p role="status">Đang tải đề xuất…</p>}</div></>;}createRoot(document.getElementById('app')).render(<ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}><App/></ThemeProvider>);
`, loader: "tsx", resolveDir: web }, bundle: true, write: false, outfile: "fixture.js", platform: "browser", format: "iife", jsx: "automatic", tsconfig: "tsconfig.json", define: { "process.env.NODE_ENV": '"development"' }, plugins: [
  { name: "local-router", setup(b) { b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "router", namespace: "fixture" })); b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ loader: "js", contents: "export const useRouter=()=>({replace(){},push(){}});" })); } },
  { name: "local-map-style", setup(b) { b.onResolve({ filter: /modules\/map\/map-config$/ }, () => ({ path: "map", namespace: "fixture-map" })); b.onLoad({ filter: /.*/, namespace: "fixture-map" }, () => ({ resolveDir: web, loader: "js", contents: 'export const mapStyle=theme=>"/map-style.json?theme="+theme;export async function loadMapLibre(){const m=await import("maplibre-gl");m.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");return {...m,Map:class extends m.Map{constructor(options){super(options);(window.fixtureMaps??=[]).push(this);}}};}' })); } },
] });
const js = bundle.outputFiles.find(f => f.path.endsWith(".js"))!.contents;
const componentCss = bundle.outputFiles.filter(f => f.path.endsWith(".css")).map(f => f.text).join("\n");
const globalPath = fileURLToPath(new URL("../../../packages/ui/src/styles/globals.css", import.meta.url));
const globalCss = await postcss([tailwind({ base: web })]).process(await readFile(globalPath, "utf8"), { from: globalPath });
let fonts = "";
for (const name of await readdir(new URL("../.next/static/chunks/", import.meta.url))) {
  if (!name.endsWith(".css")) continue;
  const file = await readFile(new URL(`../.next/static/chunks/${name}`, import.meta.url), "utf8");
  for (const match of file.matchAll(/@font-face\{[^}]+\}/g)) if (/Be Vietnam Pro|Noto Serif|Lora/.test(match[0])) fonts += match[0] + "\n";
}
const css = globalCss.css + fonts.replaceAll("../media/", "/_next/static/media/") + componentCss;
const server = createServer(async (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  const url = new URL(request.url ?? "/", "http://127.0.0.1:3016");
  const json = (value: unknown) => { response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify(value)); };
  if (url.pathname === "/proposal") {
    scenario = url.searchParams.get("scenario") ?? "FULL"; requests++;
    const service = createPlannerService({ repository: { candidates: async () => scenario === "EMPTY" ? [] : rows, recheck: async () => true }, routes: { route: async (pair, signal) => {
      if (scenario === "MISSING") return missingLeg(pair, "NO_ROUTE");
      const leg = await fakeRoutes.route(pair, signal);
      if (scenario === "NO_SHAPE") return leg;
      return { ...leg, geometry: { type: "LineString", coordinates: [
        [pair.from.longitude, pair.from.latitude],
        [(pair.from.longitude + pair.to.longitude) / 2 + 0.025, (pair.from.latitude + pair.to.latitude) / 2],
        [pair.to.longitude, pair.to.latitude],
      ] } };
    } }, now: () => referenceTime });
    json(await service.propose("fixture-owner", `fixture-${requests}`, { ...requirement, startDate: null, durationDays: 3, interests: [] })); return;
  }
  if (url.pathname === "/stats") { json({ scenario, requests }); return; }
  if (url.pathname === "/map-style.json") { json({ version: 8, sources: {}, layers: [{ id: "ground", type: "background", paint: { "background-color": url.searchParams.get("theme") === "dark" ? "#16271e" : "#e8eee6" } }] }); return; }
  if (url.pathname === "/fixture.js") { response.setHeader("Content-Type", "text/javascript"); response.end(js); return; }
  if (url.pathname === "/fixture.css") { response.setHeader("Content-Type", "text/css"); response.end(css); return; }
  if (url.pathname.startsWith("/_next/static/media/") || /^\/maplibre\/maplibre-gl-(worker|shared)\.mjs$/.test(url.pathname)) {
    const media = url.pathname.startsWith("/_next"), name = url.pathname.split("/").at(-1)!;
    if (!/^[a-zA-Z0-9_.-]+$/.test(name)) { response.writeHead(404).end(); return; }
    try { response.setHeader("Content-Type", media ? "font/woff2" : "text/javascript"); response.end(await readFile(new URL(media ? `../.next/static/media/${name}` : `../public/maplibre/${name}`, import.meta.url))); } catch { response.writeHead(404).end(); } return;
  }
  response.setHeader("Content-Type", "text/html;charset=utf-8");
  response.end(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bản đồ hành trình · Kiểm thử</title><link rel="stylesheet" href="/fixture.css"><style>body{margin:0;font-family:"Be Vietnam Pro",sans-serif}.trip-shell{--font-trip-body:"Be Vietnam Pro";--font-be-vietnam:"Be Vietnam Pro";--font-trip-heading:"Noto Serif";--font-editorial-serif:"Lora";padding:24px;max-width:1440px;margin:auto}.fixture-banner{display:flex;align-items:center;gap:12px;flex-wrap:wrap;background:#193b2b;color:white;padding:16px;font-size:12px}.fixture-banner button{background:white;color:#193b2b;border:0;border-radius:6px;padding:8px;min-height:36px;cursor:pointer}.fixture-title{font-size:18px;margin:20px 24px}@media(max-width:600px){.trip-shell{padding:16px}}</style></head><body><h1 class="fixture-title">Hà Giang · Hành trình kiểm thử</h1><div id="app"></div><script src="/fixture.js"></script></body></html>`);
});
server.listen(3016, "127.0.0.1", () => console.log("ITINERARY_ROUTES_FIXTURE=http://127.0.0.1:3016 (synthetic routes, no external services)"));
