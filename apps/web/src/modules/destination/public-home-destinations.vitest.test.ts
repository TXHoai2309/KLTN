import { expect, it, vi } from "vitest";
import type { Database } from "@KLTN/db";
import { listPublicHomeDestinations } from "./public-home-destinations";
import { listPublicLocations } from "./public-destination-list";

function fixture() {
  const rows = [
    { id:"visible",name:"Visible",description:"  Verified\n text  ",area:"north",category:"heritage",visibility:"VISIBLE",latitude:23,longitude:105,media:[] },
    { id:"hidden",name:"Hidden",description:"Private text",area:"secret",category:"private",visibility:"HIDDEN",latitude:23,longitude:105,media:[] },
  ];
  const findMany=vi.fn(async({where,select}:any)=>rows.filter(r=>r.visibility===where.visibility&&(!where.category||r.category===where.category)).map(r=>Object.fromEntries(Object.keys(select).map(k=>[k,(r as any)[k]]))));
  return {rows,findMany,db:{destination:{findMany}} as unknown as Pick<Database,"destination">};
}
it("Home does one persistence call and never projects private/prose/admin columns into locations",async()=>{
  const f=fixture(),data=await listPublicHomeDestinations(f.db);
  expect(f.findMany).toHaveBeenCalledTimes(1);
  expect(data.destinations.map(d=>d.id)).toEqual(["visible"]);
  expect(data.destinations[0]).not.toHaveProperty("description");
  expect(data.destinations[0]).not.toHaveProperty("visibility");
  expect(data.descriptions).toEqual({visible:"Verified text"});
});
it("request-fresh create/edit/hide/show flows have no stale or role-scoped cache",async()=>{
  const f=fixture();
  for(const _role of ["GUEST","TRAVELER","ADMIN"])expect((await listPublicHomeDestinations(f.db)).destinations.map(d=>d.id)).toEqual(["visible"]);
  f.rows[0]!.description="Updated description";
  expect((await listPublicHomeDestinations(f.db)).descriptions.visible).toBe("Updated description");
  f.rows[0]!.visibility="HIDDEN";
  expect((await listPublicHomeDestinations(f.db))).toEqual({destinations:[],descriptions:{}});
  f.rows[1]!.visibility="VISIBLE";
  expect((await listPublicHomeDestinations(f.db)).destinations.map(d=>d.id)).toEqual(["hidden"]);
  f.rows.push({...f.rows[0]!,id:"new",visibility:"VISIBLE",name:"New"});
  expect((await listPublicHomeDestinations(f.db)).destinations.map(d=>d.id)).toEqual(["hidden","new"]);
});
it("thumbnail provenance, invalid coordinates and bounded descriptions retain canonical rules",async()=>{
  const f=fixture();f.rows[0]!.latitude=999;f.rows[0]!.description="x".repeat(200);
  (f.rows[0]!.media as any[]).push({url:"https://example.com/image.png",alt:"denied",websiteRights:"DENIED",storageReference:null});
  const data=await listPublicHomeDestinations(f.db);
  expect(data.destinations[0]!.latitude).toBeNull();expect(data.destinations[0]!.image).toBeNull();
  expect(data.descriptions.visible).toHaveLength(130);
});
it("unfiltered list derives global options but filtered empty results retain all public options",async()=>{
  const f=fixture();const all=await listPublicLocations({},f.db);
  expect(f.findMany).toHaveBeenCalledTimes(1);expect(all.filters.categories).toEqual(["heritage"]);
  f.findMany.mockClear();const missing=await listPublicLocations({category:"missing"},f.db);
  expect(f.findMany).toHaveBeenCalledTimes(2);expect(missing.items).toEqual([]);expect(missing.filters).toEqual(all.filters);
});
it("data failures remain errors; caller owns the existing readable fallback",async()=>{
  const f=fixture();f.findMany.mockRejectedValueOnce(new Error("fixture outage"));
  await expect(listPublicHomeDestinations(f.db)).rejects.toThrow("fixture outage");
});
