import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { createPrismaClient } from "@KLTN/db";
import { getFavorites, removeFavorite } from "./favorite-service";

// Explicit opt-in only, with the accepted development endpoint guard.
test("development DB: FK/one-target/uniqueness/ownership/hidden history/relation-only delete", {skip:process.env.US16_DEV_DB !== "1"}, async()=>{
  assert.equal(process.env.NODE_ENV,"development");
  assert.ok(new URL(process.env.DATABASE_URL!).hostname.startsWith("ep-purple-pond-b3xujb8o"));
  const db=createPrismaClient({DATABASE_URL:process.env.DATABASE_URL!});
  const prefix=`us16-${randomUUID()}`;
  const ids={a:`${prefix}-a`,b:`${prefix}-b`,admin:`${prefix}-admin`,d:`${prefix}-d`,hd:`${prefix}-hd`,c:`${prefix}-c`,hc:`${prefix}-hc`};
  try {
    await db.user.createMany({data:[{id:ids.a,name:"US16 fixture A",email:`${ids.a}@example.invalid`},{id:ids.b,name:"US16 fixture B",email:`${ids.b}@example.invalid`},{id:ids.admin,name:"US16 fixture admin",email:`${ids.admin}@example.invalid`,role:"ADMIN"}]});
    for(const id of [ids.d,ids.hd]) await db.destination.create({data:{id,name:"US16 disposable fixture",description:"Fixture only",area:"fixture",category:"fixture",latitude:23,longitude:105,visibility:id===ids.d?"VISIBLE":"HIDDEN",openingDays:{create:(["MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY","SUNDAY"] as const).map(dayOfWeek=>({dayOfWeek,status:"UNKNOWN" as const}))}}});
    for(const id of [ids.c,ids.hc]) await db.cultureContent.create({data:{id,title:"US16 disposable culture",content:"SECRET body",visibility:id===ids.c?"VISIBLE":"HIDDEN"}});
    await assert.rejects(db.favorite.create({data:{userId:ids.a,targetType:"DESTINATION"}}));
    await assert.rejects(db.favorite.create({data:{userId:ids.a,targetType:"DESTINATION",destinationId:ids.d,cultureContentId:ids.c}}));
    await assert.rejects(db.favorite.create({data:{userId:ids.a,targetType:"DESTINATION"}}));
    await assert.rejects(db.favorite.create({data:{userId:ids.a,targetType:"DESTINATION",destinationId:"missing"}}));
    const own=await db.favorite.create({data:{userId:ids.a,targetType:"DESTINATION",destinationId:ids.d}});
    await assert.rejects(db.favorite.create({data:{userId:ids.a,targetType:"DESTINATION",destinationId:ids.d}}));
    const foreign=await db.favorite.create({data:{userId:ids.b,targetType:"DESTINATION",destinationId:ids.d}});
    await db.favorite.createMany({data:[{userId:ids.a,targetType:"DESTINATION",destinationId:ids.hd},{userId:ids.a,targetType:"CULTURE_CONTENT",cultureContentId:ids.c},{userId:ids.a,targetType:"CULTURE_CONTENT",cultureContentId:ids.hc}]});
    const deps={database:db,resolveSession:async()=>({user:{id:ids.a}})};
    const data=await getFavorites(new Headers(),deps);
    assert.equal(data.destinations.length,2);assert.equal(data.cultureContents.length,2);assert.ok(!JSON.stringify(data).includes("SECRET"));assert.ok(!JSON.stringify(data).includes(foreign.id));
    for(const item of [...data.destinations,...data.cultureContents].filter(x=>[ids.hd,ids.hc].includes(x.targetId))) {assert.equal(item.availability,"UNAVAILABLE");assert.equal(item.href,null);}
    const denied=await removeFavorite(new Headers(),foreign.id,`${prefix}-denied`,deps);assert.equal(denied.status,"FAILED");if(denied.status==="FAILED")assert.equal(denied.httpStatus,404);
    assert.equal((await removeFavorite(new Headers(),own.id,`${prefix}-remove`,deps)).status,"SUCCESS");
    assert.ok(await db.destination.findUnique({where:{id:ids.d}}));assert.ok(await db.cultureContent.findUnique({where:{id:ids.c}}));assert.ok(await db.favorite.findUnique({where:{id:foreign.id}}));
    const replay=await removeFavorite(new Headers(),own.id,`${prefix}-remove`,deps);assert.equal(replay.status,"SUCCESS");if(replay.status==="SUCCESS")assert.equal(replay.replayed,true);
    for(const id of [ids.admin,null])await assert.rejects(getFavorites(new Headers(),{database:db,resolveSession:async()=>id?{user:{id}}:null}),{status:id?403:401});
  }finally{
    await db.favorite.deleteMany({where:{userId:{in:[ids.a,ids.b]}}});
    await db.idempotencyRecord.deleteMany({where:{scope:JSON.stringify([ids.a,"favorite:remove"])}});
    await db.user.deleteMany({where:{id:{in:[ids.a,ids.b,ids.admin]}}});
    await db.destination.deleteMany({where:{id:{in:[ids.d,ids.hd]}}});await db.cultureContent.deleteMany({where:{id:{in:[ids.c,ids.hc]}}});await db.$disconnect();
  }
});
