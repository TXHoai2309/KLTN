import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFile } from "node:fs/promises";
import type { Database } from "@KLTN/db";
import { cultureExcerpt, listPublicCulture, publicCultureResponse, parsePublicCultureQuery, publicCultureListSelect } from "./public-culture-list";
import { visibleCultureWhere } from "./culture-eligibility";
import { visibleDestinationWhere } from "../destination/destination-eligibility";
import { loadPublicSection, culturePageHref } from "../../app/explore/public-section";
import { exploreViewHref } from "../map/map-model";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
require.extensions[".css"] = () => {};
const Loading = require("../../app/explore/loading").default;
const visible = { id: "culture-a", title: "Văn hóa Hà Giang", content: "Nội dung văn hóa", sourceTitle: "Nguồn", sourceUrl: "https://example.org/source", visibility: "VISIBLE", destinations: [{ destination: { id: "d-visible", name: "Công khai", visibility: "VISIBLE" } }, { destination: { id: "d-hidden", name: "Ẩn", visibility: "HIDDEN" } }] };
function fixture() {
  const rows = [structuredClone(visible), { ...structuredClone(visible), id: "culture-hidden", visibility: "HIDDEN" }]; let query: any;
  const database = { cultureContent: { findMany: async (input: any) => { query = input; return rows.filter(row => row.visibility === input.where.visibility).slice(input.skip, input.skip + input.take).map(row => ({ id: row.id, title: row.title, content: row.content, sourceTitle: row.sourceTitle, sourceUrl: row.sourceUrl, destinations: row.destinations.filter(link => link.destination.visibility === input.select.destinations.where.destination.visibility).slice(0, input.select.destinations.take).map(link => ({ destination: { id: link.destination.id, name: link.destination.name } })) })); } } } as unknown as Pick<Database, "cultureContent">;
  return { rows, database, query: () => query };
}
for (const role of ["Guest", "Traveler", "Admin"]) test(`${role} only sees visible Culture and visible relations with strict public DTO`, async () => {
  const f = fixture(); const response = await publicCultureResponse(new Request("http://localhost/api/culture", { headers: { "X-Role": role } }), f.database);
  assert.equal(response.status, 200); assert.equal(response.headers.get("Cache-Control"), "no-store");
  const { data } = await response.json(); assert.deepEqual(data.items.map((item: any) => item.id), ["culture-a"]);
  assert.deepEqual(data.items[0].relatedDestinations, [{ id: "d-visible", name: "Công khai" }]);
  assert.deepEqual(Object.keys(data.items[0]).sort(), ["id", "title", "excerpt", "sourceTitle", "sourceUrl", "relatedDestinations"].sort());
  assert.deepEqual(f.query().where, visibleCultureWhere); assert.deepEqual(f.query().select, publicCultureListSelect);
  assert.deepEqual(f.query().select.destinations.where.destination, visibleDestinationWhere);
  assert.deepEqual(f.query().orderBy, [{ title: "asc" }, { id: "asc" }]);
});
test("hide/show fresh reads preserve Culture links and exclude hidden destinations", async () => {
  const f = fixture(); f.rows[0]!.visibility = "HIDDEN"; assert.equal((await listPublicCulture(1, f.database)).items.length, 0);
  f.rows[0]!.visibility = "VISIBLE"; const page = await listPublicCulture(1, f.database); assert.equal(page.items.length, 1); assert.equal(f.rows[0]!.destinations.length, 2);
  assert.equal(page.items[0]!.relatedDestinations.length, 1);
});
test("visible Culture remains readable when every linked destination is hidden", async () => {
  const f = fixture(); f.rows[0]!.destinations[0]!.destination.visibility = "HIDDEN";
  const page = await listPublicCulture(1, f.database); assert.equal(page.items.length, 1); assert.deepEqual(page.items[0]!.relatedDestinations, []);
});
test("bounded25+lookahead, stable ordering and independent pagination", async () => {
  const f = fixture(); f.rows.splice(0); for (let i=0;i<27;i++) f.rows.push({ ...structuredClone(visible), id: `culture-${i}` });
  const first = await listPublicCulture(1, f.database); assert.equal(first.items.length,25); assert.equal(first.hasMore,true);
  assert.equal(f.query().take,26); assert.equal(f.query().select.destinations.take,20);
  const second = await listPublicCulture(2, f.database); assert.equal(second.items.length,2); assert.equal(second.hasMore,false); assert.equal(f.query().skip,25);
  const params = new URLSearchParams("page=3&view=map&culturePage=2"); const href=culturePageHref(params,3);
  assert.equal(new URL(href,"http://localhost").searchParams.get("page"),"3");
  assert.equal(new URL(href,"http://localhost").searchParams.get("view"),"map");
  assert.equal(new URL(exploreViewHref(params,"list"),"http://localhost").searchParams.get("culturePage"),"2");
});
test("public culture query validates bounds/duplicates and rejects forged fields/search", () => {
  assert.equal(parsePublicCultureQuery(new URLSearchParams()),1); assert.equal(parsePublicCultureQuery(new URLSearchParams("page=10000")),10000);
  for (const query of ["page=0","page=10001","page=1&page=2","role=ADMIN","q=x","view=map"]) assert.throws(()=>parsePublicCultureQuery(new URLSearchParams(query)));
});
test("excerpt NFC/whitespace and whole graphemes within280; text is never interpreted as HTML", () => {
  assert.equal(cultureExcerpt("  Hà   Giang\n"),"Hà Giang");
  const text = cultureExcerpt("a".repeat(279)+"👩‍👩‍👧‍👦"); assert.equal(text,"a".repeat(279));
  assert.equal(cultureExcerpt("<script>alert(1)</script>"),"<script>alert(1)</script>");
});
test("missing sources omitted naturally, unsafe legacy URL never becomes a link", async () => {
  const f=fixture(); f.rows[0]!.sourceUrl="javascript:alert(1)"; assert.equal((await listPublicCulture(1,f.database)).items[0]!.sourceUrl,null);
  f.rows[0]!.sourceUrl=null as any; f.rows[0]!.sourceTitle=null as any; const item=(await listPublicCulture(1,f.database)).items[0]!; assert.equal(item.sourceTitle,null); assert.equal(item.sourceUrl,null);
});
test("DB failure is sanitized500/no-store; empty is successful distinct data", async () => {
  const failed={cultureContent:{findMany:async()=>{throw new Error("private connection");}}} as any;
  const response=await publicCultureResponse(new Request("http://localhost/api/culture"),failed); assert.equal(response.status,500); assert.equal(response.headers.get("Cache-Control"),"no-store"); assert.doesNotMatch(await response.text(),/private connection/);
  const f=fixture(); f.rows.splice(0); assert.deepEqual(await listPublicCulture(1,f.database),{items:[],page:1,hasMore:false});
});
for (const failing of ["Destination","Culture"]) test(`${failing} failure does not prevent other public section resolving`, async () => {
  const [a,b]=await Promise.all([loadPublicSection(async()=>{if(failing==="Destination")throw Error("private");return ["Destination"];},"Destination failed"),loadPublicSection(async()=>{if(failing==="Culture")throw Error("private");return ["Culture"];},"Culture failed")]);
  assert.deepEqual(failing==="Destination"?a:b,{error:`${failing} failed`}); assert.deepEqual(failing==="Destination"?b:a,{data:[failing==="Destination"?"Culture":"Destination"]});
});
test("loading markup covers both domains, semantic headings, no blank page", () => {
  const html=renderToStaticMarkup(<Loading/>); assert.match(html,/Đang tải điểm đến/); assert.match(html,/Đang tải nội dung văn hóa/); assert.equal((html.match(/aria-busy="true"/g)||[]).length,2);
});
test("Home is product UI; Explore streams independently and exposes no dead Culture/AI/Trip controls", async () => {
  const home=await readFile(new URL("../../app/page.tsx",import.meta.url),"utf8"); assert.match(home,/Khám phá Hà Giang theo cách của bạn/); assert.match(home,/href="\/explore"/); assert.doesNotMatch(home,/TITLE_TEXT|API Status|BETTER|\/trips|\/assistant/);
  const page=await readFile(new URL("../../app/explore/page.tsx",import.meta.url),"utf8"); assert.equal((page.match(/<Suspense/g)||[]).length,2); assert.match(page,/params.delete\("culturePage"\)/);
  const culture=await readFile(new URL("../../app/explore/culture-results.tsx",import.meta.url),"utf8"); assert.match(culture,/Chưa có nội dung văn hóa công khai/); assert.match(culture,/router.refresh/); assert.match(culture,/noopener noreferrer/); assert.doesNotMatch(culture,/href=.*\/culture\/|dangerouslySetInnerHTML|fetch\(/);
  const destination=await readFile(new URL("../../app/explore/explore-results.tsx",import.meta.url),"utf8"); assert.match(destination,/Chưa có điểm đến công khai/); assert.match(destination,/destinations=\{data.items\}/);
  const route=await readFile(new URL("../../app/api/culture/route.ts",import.meta.url),"utf8"); assert.match(route,/publicCultureResponse/); assert.doesNotMatch(route,/requireActor|findMany|admin/);
});
