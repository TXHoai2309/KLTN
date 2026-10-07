import assert from "node:assert/strict";
import { test } from "node:test";
import type { Database } from "@KLTN/db";
import { getFavorites, removeFavorite, type FavoriteDependencies } from "./favorite-service";
import { favoritesResponse, removeFavoriteResponse } from "./favorite-http";

function fixture(role = "TRAVELER", authenticated = true) {
  const destinations = [{ id: "d", name: "Public", visibility: "VISIBLE" }, { id: "hd", name: "Hidden", visibility: "HIDDEN", description: "SECRET" }];
  const cultures = [{ id: "c", title: "Culture", visibility: "VISIBLE" }, { id: "hc", title: "Hidden culture", visibility: "HIDDEN", content: "SECRET" }];
  let rows = [
    { id: "fd", userId: "a", destination: destinations[0], cultureContent: null },
    { id: "fhd", userId: "a", destination: destinations[1], cultureContent: null },
    { id: "fc", userId: "a", destination: null, cultureContent: cultures[0] },
    { id: "fhc", userId: "a", destination: null, cultureContent: cultures[1] },
    { id: "foreign", userId: "b", destination: destinations[0], cultureContent: null },
  ];
  let queries = 0; let deletes = 0;
  const records = new Map<string, { requestHash: string; responseJson: string }>();
  const database = {
    user: { findUnique: async () => ({ id: "a", role }) },
    favorite: {
      findMany: async ({ where, select }: { where: { userId: string }; select: Record<string, unknown> }) => {
        queries++; assert.deepEqual(where, { userId: "a" }); assert.ok(select.destination); assert.ok(select.cultureContent);
        return rows.filter(row => row.userId === where.userId);
      },
      deleteMany: async ({ where }: { where: { id: string; userId: string } }) => {
        assert.equal(where.userId, "a"); const before = rows.length;
        rows = rows.filter(row => !(row.id === where.id && row.userId === where.userId));
        deletes += before - rows.length; return { count: before - rows.length };
      },
    },
    idempotencyRecord: {
      findUnique: async ({ where }: { where: { scope_key: object } }) => records.get(JSON.stringify(where.scope_key)) ?? null,
      create: async ({ data }: { data: { scope: string; key: string; requestHash: string; responseJson: string } }) => records.set(JSON.stringify({ scope: data.scope, key: data.key }), data),
      update: async ({ where, data }: { where: { scope_key: object }; data: { responseJson: string } }) => Object.assign(records.get(JSON.stringify(where.scope_key))!, data),
    },
    $transaction: async (execute: (tx: unknown) => Promise<unknown>) => {
      const backupRows = [...rows]; const backupRecords = new Map(records);
      try { return await execute(database); } catch (error) { rows = backupRows; records.clear(); backupRecords.forEach((v,k) => records.set(k,v)); throw error; }
    },
  };
  const deps: FavoriteDependencies = { database: database as unknown as Database, resolveSession: async () => authenticated ? { user: { id: "a" } } : null };
  return { deps, destinations, cultures, setRole: (next:string)=>{role=next;}, clear: () => { rows = []; }, rows: () => rows, queries: () => queries, deletes: () => deletes };
}
test("own groups only; hidden targets remain title-only unavailable without original links", async () => {
  const data = await getFavorites(new Headers({ "x-user-id": "b" }), fixture().deps);
  assert.deepEqual(data.destinations.map(x => x.favoriteId), ["fd", "fhd"]);
  assert.deepEqual(data.cultureContents.map(x => x.favoriteId), ["fc", "fhc"]);
  assert.equal(data.destinations[0]?.href, "/destinations/d"); assert.equal(data.cultureContents[0]?.href, "/culture/c");
  for (const item of [data.destinations[1]!, data.cultureContents[1]!]) { assert.equal(item.availability, "UNAVAILABLE"); assert.equal(item.href, null); }
  assert.ok(!JSON.stringify(data).includes("SECRET"));
});
test("empty groups are successful data", async () => { const f=fixture(); f.clear(); assert.deepEqual(await getFavorites(new Headers(),f.deps),{destinations:[],cultureContents:[]}); });
for (const [role, authenticated, status] of [["TRAVELER",false,401],["ADMIN",true,403]] as const) test(`${role}/${authenticated} cannot read or delete`, async () => {
  const f=fixture(role,authenticated); await assert.rejects(getFavorites(new Headers(),f.deps),{status}); await assert.rejects(removeFavorite(new Headers(),"fd","key",f.deps),{status}); assert.equal(f.queries(),0); assert.equal(f.deletes(),0);
});
test("delete scopes relation by both IDs, preserves targets/other user's relation, replay has no second write", async () => {
  const f=fixture(); assert.equal((await removeFavorite(new Headers(),"fd","key",f.deps)).status,"SUCCESS");
  assert.equal(f.rows().some(x=>x.id==="fd"),false); assert.equal(f.rows().some(x=>x.id==="foreign"),true);
  assert.equal(f.destinations.length,2); assert.equal(f.cultures.length,2);
  const replay=await removeFavorite(new Headers(),"fd","key",f.deps); assert.equal(replay.status,"SUCCESS"); if(replay.status==="SUCCESS") assert.equal(replay.replayed,true); assert.equal(f.deletes(),1);
});
test("foreign and missing IDs have identical 404 failures; hidden relation removable", async () => {
  for(const id of ["foreign","absent"]) { const f=fixture(); const r=await removeFavorite(new Headers(),id,"key",f.deps); assert.equal(r.status,"FAILED"); if(r.status==="FAILED") {assert.equal(r.httpStatus,404);assert.equal(r.error.code,"NOT_FOUND");} assert.equal(f.deletes(),0); }
  assert.equal((await removeFavorite(new Headers(),"fhd","key",fixture().deps)).status,"SUCCESS");
});
test("API private envelope, rejects query identity and unsafe mutation origin, honors idempotency header", async () => {
  const f=fixture(); const response=await favoritesResponse(new Request("http://localhost/api/favorites"),f.deps);
  assert.equal(response.status,200); assert.equal(response.headers.get("Cache-Control"),"private, no-store"); assert.equal((await response.json()).success,true);
  assert.equal((await favoritesResponse(new Request("http://localhost/api/favorites?userId=b"),f.deps)).status,400);
  assert.equal((await removeFavoriteResponse(new Request("http://localhost/api/favorites/fd",{method:"DELETE"}),"fd",f.deps)).status,403);
  const request=new Request("http://localhost/api/favorites/fd",{method:"DELETE",headers:{origin:"http://localhost","Idempotency-Key":"key"}});
  assert.equal((await (await removeFavoriteResponse(request,"fd",f.deps)).json()).operationStatus,"SUCCESS");
});
test("API Guest/Admin denial returns private failure without favorite data",async()=>{
  for(const [role,authenticated,status] of [["TRAVELER",false,401],["ADMIN",true,403]] as const) {
    const f=fixture(role,authenticated);
    const response=await favoritesResponse(new Request("http://localhost/api/favorites"),f.deps);
    assert.equal(response.status,status);const body=await response.json();assert.equal(body.success,false);assert.equal(body.data,undefined);
    const deletion=await removeFavoriteResponse(new Request("http://localhost/api/favorites/fd",{method:"DELETE",headers:{origin:"http://localhost","Idempotency-Key":"key"}}),"fd",f.deps);
    assert.equal(deletion.status,status);assert.equal((await deletion.json()).operationStatus,"FAILED");assert.equal(f.deletes(),0);
  }
});
test("missing key/body/query rejected before mutation; malformed IDs masked404",async()=>{
  const f=fixture();
  for(const [suffix,headers,body,status] of [["",{origin:"http://localhost"},undefined,400],["?userId=b",{origin:"http://localhost","Idempotency-Key":"key"},undefined,400],["",{origin:"http://localhost","Idempotency-Key":"key"},"forged",400]] as const) {
    assert.equal((await removeFavoriteResponse(new Request(`http://localhost/api/favorites/fd${suffix}`,{method:"DELETE",headers,body}),"fd",f.deps)).status,status);
  }
  await assert.rejects(removeFavorite(new Headers(),"../foreign","key",f.deps),{status:404});assert.equal(f.deletes(),0);
});
test("different target with reused key conflicts; persisted role rechecked inside transaction",async()=>{
  const f=fixture();await removeFavorite(new Headers(),"fd","key",f.deps);
  const conflict=await removeFavorite(new Headers(),"fc","key",f.deps);assert.equal(conflict.status,"FAILED");if(conflict.status==="FAILED")assert.equal(conflict.httpStatus,409);
  const g=fixture(); const transaction=g.deps.database.$transaction;
  g.deps.database.$transaction=(async(execute:Parameters<typeof transaction>[0])=>{g.setRole("ADMIN");return transaction(execute as never);}) as typeof transaction;
  const denied=await removeFavorite(new Headers(),"fd","key",g.deps);assert.equal(denied.status,"FAILED");if(denied.status==="FAILED")assert.equal(denied.httpStatus,403);assert.equal(g.deletes(),0);
});
test("technical read sanitized500; uncertain write uses shared UNKNOWN",async()=>{
  const f=fixture();const original=console.error;console.error=()=>{};
  try {
    Object.assign(f.deps.database.favorite,{findMany:async()=>{throw new Error("DATABASE_SECRET");}});
    const response=await favoritesResponse(new Request("http://localhost/api/favorites"),f.deps);assert.equal(response.status,500);assert.ok(!(await response.text()).includes("DATABASE_SECRET"));
    Object.assign(f.deps.database.idempotencyRecord,{findUnique:async()=>{throw new Error("DATABASE_SECRET");}});
    const result=await removeFavorite(new Headers(),"fd","key",f.deps);assert.equal(result.status,"UNKNOWN");assert.equal(f.deletes(),0);
  }finally{console.error=original;}
});
