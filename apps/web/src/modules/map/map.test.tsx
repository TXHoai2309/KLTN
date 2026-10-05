import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Database } from "@KLTN/db";
import { listPublicLocations, parsePublicListQuery, publicLocationSelect, publicLocationResponse, publicLocationSchema } from "../destination/public-destination-list";
import { visibleDestinationWhere } from "../destination/destination-eligibility";
import { destinationDetailHref, exploreView, exploreViewHref, haGiangViewport, projectMarkers } from "./map-model";
import DestinationMap from "../../components/map/destination-map";
import { mapStyle, stadiaStyles, verifyMapWorkerAssets } from "./map-config";
import { startMapSession } from "./map-session";
import { mountMapLibre } from "./maplibre-renderer";
import type * as MapLibre from "maplibre-gl";
import { toMapCoordinate } from "./map-model";

const a = { id: "a", name: "Đồng Văn A", area: "đồng văn", category: "văn hóa", latitude: 23.28, longitude: 105.36 };
const b = { ...a, id: "b", latitude: 23.16, longitude: 105.4 };
test("missing worker preflight fails safely and retry rechecks both npm assets", async () => {
  const original = globalThis.fetch; const calls: { url: string; options?: RequestInit }[] = [];
  let available = false;
  globalThis.fetch = (async (url: string | URL | Request, options?: RequestInit) => { calls.push({ url: String(url), options }); return new Response(null, { status: available ? 200 : 404 }); }) as typeof fetch;
  try {
    await assert.rejects(verifyMapWorkerAssets(), /unavailable/);
    available = true; await verifyMapWorkerAssets();
    assert.deepEqual(calls.map(call => call.url), ["/maplibre/maplibre-gl-worker.mjs", "/maplibre/maplibre-gl-worker.mjs", "/maplibre/maplibre-gl-shared.mjs"]);
    assert.ok(calls.every(call => call.options?.method === "HEAD" && call.options.cache === "no-store" && call.options.signal));
  } finally { globalThis.fetch = original; }
});
function fixture() {
  const rows = [{ ...a, visibility: "VISIBLE" }, { ...b, visibility: "VISIBLE" }, { ...b, id: "hidden", visibility: "HIDDEN" }];
  let last: any;
  const database = { destination: { findMany: async (query: any) => { if (query.select.id) last = query; return rows.filter(row => row.visibility === query.where.visibility).map(row => Object.fromEntries(Object.keys(query.select).map(key => [key, (row as any)[key]]))); } } } as unknown as Pick<Database, "destination">;
  return { database, rows, query: () => last };
}
for (const role of ["Guest", "Traveler", "Admin"]) test(`${role} public list/map source uses canonical visibility/allowlist, no role exception`, async () => {
  const f = fixture(); const response = await publicLocationResponse(new Request("http://localhost/api/destinations?view=map", { headers: { "X-Role": role } }), f.database);
  assert.equal(response.status, 200); assert.equal(response.headers.get("Cache-Control"), "no-store");
  const data = (await response.json()).data;
  assert.deepEqual(data.items.map((item: any) => item.id), ["a", "b"]);
  assert.deepEqual(projectMarkers(data.items).map(item => item.id), ["a", "b"]);
  assert.deepEqual(f.query().where, visibleDestinationWhere); assert.deepEqual(f.query().select, publicLocationSelect);
  assert.deepEqual(Object.keys(data.items[0]).sort(), ["id", "name", "area", "category", "latitude", "longitude"].sort());
});
test("public reads after hide/show exclude then restore same location", async () => {
  const f = fixture(); f.rows[0]!.visibility = "HIDDEN";
  assert.deepEqual((await listPublicLocations({}, f.database)).items.map(item => item.id), ["b"]);
  f.rows[0]!.visibility = "VISIBLE"; assert.deepEqual((await listPublicLocations({}, f.database)).items.map(item => item.id), ["a", "b"]);
});
test("invalid/missing/nonfinite/out-of-range coordinates never become markers; boundaries are valid", () => {
  const values = [null, undefined, NaN, Infinity, -Infinity, 91, -91, "23"];
  for (const latitude of values) assert.deepEqual(projectMarkers([{ ...a, latitude } as any]), []);
  for (const longitude of [null, undefined, NaN, Infinity, 181, -181, "105"]) assert.deepEqual(projectMarkers([{ ...a, longitude } as any]), []);
  assert.equal(projectMarkers([{ ...a, latitude: 90, longitude: -180 }]).length, 1);
  assert.equal(projectMarkers([a, b, { ...a, id: "missing", latitude: null }]).length, 2);
});
test("corrupt legacy coordinate preserves list record with null axis, never crashes entire dataset", async () => {
  const f = fixture(); f.rows[0]!.latitude = NaN;
  const data = await listPublicLocations({}, f.database); assert.equal(data.items.length, 2); assert.equal(data.items[0]!.latitude, null);
  assert.deepEqual(projectMarkers(data.items).map(item => item.id), ["b"]);
  assert.equal(publicLocationSchema.safeParse({ ...a, visibility: "VISIBLE" }).success, false);
});
test("MVP collection retains all50 rows and cannot select Admin metadata", async () => {
  let query: any;
  const database = { destination: { findMany: async (value: any) => { if (value.select.id) query = value; return Array.from({ length: 50 }, (_, index) => Object.fromEntries(Object.keys(value.select).map(key => [key, ({ ...a, id: `a-${index}` } as any)[key]]))); } } } as unknown as Pick<Database, "destination">;
  const data = await listPublicLocations({}, database); assert.equal(data.items.length, 50); assert.equal(query.skip, undefined); assert.equal(query.take, undefined);
  assert.deepEqual(query.orderBy, [{ name: "asc" }, { id: "asc" }]);
  await assert.rejects(listPublicLocations({ q: "a".repeat(201) }, database));
});
test("query parser accepts US-11 filters and existing view, rejects obsolete pagination/forged keys", () => {
  assert.deepEqual(parsePublicListQuery(new URLSearchParams("q=abc&view=map")), { q: "abc" });
  assert.deepEqual(parsePublicListQuery(new URLSearchParams()), {});
  for (const query of ["page=0", "page=2", "page=1&page=2", "view=evil", "area=x", "role=ADMIN"]) assert.throws(() => parsePublicListQuery(new URLSearchParams(query)));
});
test("public data error stays500/no-store, no false empty/provider error or internal message", async () => {
  const database = { destination: { findMany: async () => { throw Error("internal-map-fixture"); } } } as unknown as Pick<Database, "destination">;
  const old = console.error; console.error = () => {};
  try { const response = await publicLocationResponse(new Request("http://localhost/api/destinations"), database); assert.equal(response.status, 500); assert.equal(response.headers.get("Cache-Control"), "no-store"); assert.ok(!JSON.stringify(await response.json()).includes("internal-map-fixture")); }
  finally { console.error = old; }
  assert.equal((await publicLocationResponse(new Request("http://localhost/api/destinations?role=ADMIN"), fixture().database)).status, 400);
});
test("view changes preserve pathname/query filters/page, refresh/default map state and detail path", () => {
  const params = new URLSearchParams("q=đồng văn&area=đồng văn&category=văn hóa&page=2&view=list");
  const href = exploreViewHref(params, "map"); const next = new URL(href, "http://localhost");
  assert.equal(next.pathname, "/explore"); assert.equal(exploreView(next.searchParams), "map");
  for (const key of ["q", "area", "category", "page"]) assert.equal(next.searchParams.get(key), params.get(key));
  assert.equal(exploreView(new URLSearchParams()), "list"); assert.equal(exploreView(new URLSearchParams("view=unsafe")), "list");
  assert.equal(destinationDetailHref("abc"), "/destinations/abc"); assert.equal(destinationDetailHref("bad/id"), "/destinations/bad%2Fid");
});
test("SSR is safe: provider loading has accessible context, empty/invalid are distinct and no iframe/fake map", () => {
  const html = renderToStaticMarkup(<DestinationMap destinations={[a, b]} />);
  assert.match(html, /Đang tải bản đồ/); assert.match(html, /role="status"/); assert.match(html, /aria-busy="true"/); assert.match(html, /Bản đồ điểm đến Hà Giang/); assert.doesNotMatch(html, /<iframe|maps.googleapis.com|AIza/);
  assert.match(renderToStaticMarkup(<DestinationMap destinations={[]} />), /Không tìm thấy điểm đến phù hợp/);
  assert.match(renderToStaticMarkup(<DestinationMap destinations={[{ ...a, latitude: null }]} />), /chưa có tọa độ hợp lệ/);
  assert.equal(haGiangViewport.zoom, 9);
});

test("canonical styles/coordinate order, no key; shared provider wiring and retained result set", async () => {
 assert.equal(mapStyle("dark"), stadiaStyles.dark); assert.equal(mapStyle("light"), stadiaStyles.light);
 assert.deepEqual(toMapCoordinate(a), [105.36,23.28]); assert.deepEqual(toMapCoordinate(haGiangViewport.center), [104.9836,22.8233]);
 assert.ok(Object.values(stadiaStyles).every(url=>!url.includes("api_key")));
 const renderer=await readFile(new URL("./maplibre-renderer.ts",import.meta.url),"utf8");
 for(const pattern of [/library.Marker/,/library.Popup/,/setDOMContent/,/textContent = point.name/,/focusAfterOpen: true/,/map.remove\(\)/,/map.on\("error"/,/map.on\("load"/,/NavigationControl/,/fitBounds/]) assert.match(renderer,pattern);
 assert.doesNotMatch(renderer,/innerHTML|geolocation|Directions/);
 const explore=await readFile(new URL("../../app/explore/explore-results.tsx",import.meta.url),"utf8"); assert.match(explore,/destinations=\{data.items\}/); assert.match(explore,/data.items.map/); assert.match(explore,/window.history.pushState/); assert.match(explore,/aria-pressed/);
 const detail=await readFile(new URL("../../app/destinations/[id]/destination-detail.tsx",import.meta.url),"utf8"); assert.match(detail,/DestinationMap/); assert.match(detail,/latitude: d.latitude, longitude: d.longitude/); assert.match(detail,/d.relatedCulture/);
});
for(const scenario of ["ready","load-error","timeout","style-error","unmount","mount-error"]) test(`mock provider lifecycle ${scenario}, no late success`,async()=>{
 let resolve!:(value:number)=>void;let reject!:(error:Error)=>void;let timeout=()=>{};let providerFail=()=>{};let ready=()=>{};let mounted=0;let disposed=0;const states:string[]=[];
 const promise=new Promise<number>((res,rej)=>{resolve=res;reject=rej;});
 const stop=startMapSession({load:()=>promise,onState:state=>states.push(state),schedule:callback=>{timeout=callback;return 1 as unknown as ReturnType<typeof setTimeout>;},cancel:()=>{},mount:(_lib,onReady,fail)=>{mounted++;providerFail=fail;ready=onReady;if(scenario==="mount-error")throw Error("fixture");return()=>{disposed++;};}});
 if(scenario==="timeout")timeout();if(scenario==="unmount")stop();if(scenario==="load-error")reject(Error("fixture"));else resolve(1);
 await new Promise<void>(done=>setImmediate(done));if(scenario==="style-error")providerFail();ready();
 assert.deepEqual(states,scenario==="ready"?["loading","ready"]:scenario==="unmount"?["loading"]:["loading","error"]);
 if(["timeout","unmount","load-error"].includes(scenario))assert.equal(mounted,0);if(scenario!=="unmount")stop();if(scenario==="ready")assert.equal(disposed,1);
});
for(const count of [0,1,2]) test(`mock MapLibre ${count} markers, viewport/CTA/cleanup`,()=>{
 const globals=globalThis as any;const old=globals.document;const markers:any[]=[];const popups:any[]=[];let map:any;
 globals.document={createElement:(tag:string)=>({tag,textContent:"",href:"",children:[] as any[],setAttribute(){},append(...items:any[]){this.children.push(...items);}})};
 const library={Map:class{options:any;center:any;bounds:any;removed=false;events:Record<string,()=>void>={};constructor(options:any){this.options=options;map=this;}on(name:string,fn:()=>void){this.events[name]=fn;}off(name:string){delete this.events[name];}addControl(){}jumpTo(value:any){this.center=value;}fitBounds(value:any){this.bounds=value;}remove(){this.removed=true;}},NavigationControl:class{},LngLatBounds:class{points:any[]=[];extend(value:any){this.points.push(value);}},Popup:class{options:any;content:any;removed=false;constructor(options:any){this.options=options;popups.push(this);}setDOMContent(value:any){this.content=value;return this;}remove(){this.removed=true;}},Marker:class{position:any;removed=false;element:any;constructor(options:any){this.element=options.element;markers.push(this);}setLngLat(value:any){this.position=value;return this;}setPopup(){return this;}addTo(){return this;}remove(){this.removed=true;}}} as unknown as typeof MapLibre;
 try{let ready=0,errors=0;const dispose=mountMapLibre({} as HTMLDivElement,library,[a,b].slice(0,count),stadiaStyles.light,false,()=>ready++,()=>errors++);
 assert.equal(markers.length,count);if(count){assert.deepEqual(markers[0].position,[105.36,23.28]);assert.equal(markers[0].element.type,"button");assert.equal(popups[0].options.focusAfterOpen,true);assert.equal(popups[0].content.children[2].href,"/destinations/a");}
 if(count===0)assert.deepEqual(map.options.center,[104.9836,22.8233]);if(count===1)assert.deepEqual(map.center,{center:[105.36,23.28],zoom:12});if(count===2)assert.equal(map.bounds.points.length,2);
 map.events.load();map.events.error();assert.equal(ready,1);assert.equal(errors,1);dispose();dispose();assert.equal(map.removed,true);assert.ok(markers.every(item=>item.removed));assert.ok(popups.every(item=>item.removed));
 }finally{globals.document=old;}
});
test("retry initializes a fresh provider and clears error on success",async()=>{
 let mounts=0;const states:string[]=[];for(const failing of [true,false]){const stop=startMapSession({load:async()=>1,onState:s=>states.push(s),mount:(_lib,ready,fail)=>{mounts++;if(failing)fail();else ready();return()=>{};}});await new Promise<void>(done=>setImmediate(done));stop();}
 assert.equal(mounts,2);assert.deepEqual(states,["loading","error","loading","ready"]);
});
