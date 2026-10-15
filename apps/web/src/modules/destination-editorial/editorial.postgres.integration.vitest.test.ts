import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../../../packages/db/prisma/generated/client";
import type { Database } from "@KLTN/db";
import { getEditorial, writeEditorial, readPublicEditorial } from "./editorial-service";
import { autoLayout } from "./editorial-engine";
import { writeDestination, type DestinationDependencies } from "../destination/destination-service";
import { unknownSchedule } from "../destination/destination-contract";
const url = process.env.US19_TASK184_TEST_DATABASE_URL;
(url ? describe : describe.skip)("Editorial real disposable PostgreSQL", () => {
  let db: PrismaClient, deps: DestinationDependencies, id: string;
  const headers = new Headers();
  beforeAll(async () => {
    const target = new URL(url!);
    if (!["localhost","127.0.0.1","[::1]"].includes(target.hostname) || target.username !== "task184_test" || target.pathname !== "/task184_test" || process.env.US19_TASK184_TEST_DISPOSABLE !== "I_UNDERSTAND_THIS_IS_A_DISPOSABLE_TEST_DATABASE") throw Error("Disposable required");
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const actor = randomUUID(); await db.user.create({ data: { id:actor,name:"TEST Admin",email:`${actor}@example.invalid`,role:"ADMIN" } });
    deps = { database:db as Database,resolveSession:async()=>({user:{id:actor}}) };
  });
  beforeEach(async()=>{
    const created = await writeDestination(headers,{name:"Editorial fixture",description:"Intro paragraph.\n\nSecond paragraph.",category:"di tích lịch sử – kiến trúc",area:"area",latitude:23,longitude:105,suggestedDurationMinutes:90,minimumDurationMinutes:30,openingDays:unknownSchedule()},randomUUID(),null,deps);
    if(created.status !== "SUCCESS") throw Error(); id=created.data.id;
    await db.contentMedia.create({data:{destinationId:id,url:"https://example.org/approved.jpg",alt:"Approved",websiteRights:"APPROVED",rightsEvidence:"TEST owner grant",reviewedBy:"test",reviewedAt:new Date(),isCover:true}});
  });
  afterAll(async()=>{await db?.$disconnect();});
  const read=()=>getEditorial(headers,id,deps);
  const action=async (body:unknown,key=randomUUID())=>writeEditorial(headers,body,key,id,deps);
  it("legacy destination falls back; guest and persisted Traveler cannot create editorial rows",async()=>{
    expect((await read()).draft).toBeNull();
    await db.destination.update({where:{id},data:{visibility:"VISIBLE"}});
    expect(await readPublicEditorial(id,db as Database)).toBeNull();
    const traveler=randomUUID();await db.user.create({data:{id:traveler,name:"TEST Traveler",email:`${traveler}@example.invalid`,role:"TRAVELER"}});
    const layout=autoLayout((await read()).context);
    for(const [user,status] of [[null,401],[traveler,403]] as const){
      const denied={...deps,resolveSession:async()=>user?{user:{id:user}}:null};
      await expect(getEditorial(headers,id,denied)).rejects.toMatchObject({status});
      await expect(writeEditorial(headers,{action:"SAVE",expectedRevision:0,layout},randomUUID(),id,denied)).rejects.toMatchObject({status});
    }
    expect(await db.destinationEditorial.count({where:{destinationId:id}})).toBe(0);
  });
  it("draft is durable and private, publication separate, destination/media remain unchanged",async()=>{
    const snapshot=await db.destination.findUniqueOrThrow({where:{id},include:{media:true,openingDays:{include:{intervals:true}}}});
    const s=await read(); const layout=autoLayout(s.context);
    expect((await action({action:"SAVE",expectedRevision:0,layout})).status).toBe("SUCCESS");
    expect((await read()).draft).toEqual(layout);expect(await readPublicEditorial(id,db as Database)).toBeNull();
    await db.destination.update({where:{id},data:{visibility:"VISIBLE"}});
    expect(await readPublicEditorial(id,db as Database)).toBeNull();
    expect((await action({action:"PUBLISH",expectedRevision:1,reviewed:true})).status).toBe("SUCCESS");
    expect((await readPublicEditorial(id,db as Database))?.layout).toEqual(layout);
    const after=await db.destination.findUniqueOrThrow({where:{id},include:{media:true,openingDays:{include:{intervals:true}}}});
    expect(after.description).toBe(snapshot.description);expect(after.media).toEqual(snapshot.media);expect(after.openingDays).toEqual(snapshot.openingDays);expect(after.contentRevision).toBe(snapshot.contentRevision);
    const next={...layout,variant:"SPLIT" as const};await action({action:"SAVE",expectedRevision:2,layout:next});
    expect((await readPublicEditorial(id,db as Database))?.layout).toEqual(layout);
  });
  it("same key replays; concurrent draft revisions admit one winner",async()=>{
    const s=await read();const layout=autoLayout(s.context);const key=randomUUID();const body={action:"SAVE",expectedRevision:0,layout};
    await action(body,key);expect(await action(body,key)).toMatchObject({status:"SUCCESS",replayed:true});expect((await read()).draftRevision).toBe(1);
    const results=await Promise.all([action({action:"SAVE",expectedRevision:1,layout:{...layout,variant:"SPLIT"}}),action({action:"SAVE",expectedRevision:1,layout:{...layout,variant:"PANORAMA"}})]);
    expect(results.filter(r=>r.status==="SUCCESS")).toHaveLength(1);expect(results.filter(r=>r.status==="FAILED")).toHaveLength(1);expect((await read()).draftRevision).toBe(2);
  });
  it("publish twice then rollback swaps previous published snapshot; restore draft independent",async()=>{
    const a=autoLayout((await read()).context);await action({action:"SAVE",expectedRevision:0,layout:a});await action({action:"PUBLISH",expectedRevision:1,reviewed:true});
    const b={...a,variant:"SPLIT"};await action({action:"SAVE",expectedRevision:2,layout:b});await action({action:"PUBLISH",expectedRevision:3,reviewed:true});
    expect((await read()).previousPublished).toEqual(a);await action({action:"ROLLBACK",expectedRevision:4,reviewed:true});
    const s=await read();expect(s.published).toEqual(a);expect(s.draft).toEqual(b);expect(s.previousPublished).toEqual(b);
    await action({action:"RESTORE_DRAFT",expectedRevision:5});expect((await read()).draft).toEqual(a);
  });
  it("revoked/missing media filtered publicly; new publication rejects revoked references",async()=>{
    const s=await read(),layout=autoLayout(s.context);await action({action:"SAVE",expectedRevision:0,layout});await action({action:"PUBLISH",expectedRevision:1,reviewed:true});
    await db.destination.update({where:{id},data:{visibility:"VISIBLE"}});
    await db.contentMedia.updateMany({where:{destinationId:id},data:{websiteRights:"REJECTED"}});
    expect((await readPublicEditorial(id,db as Database))?.media).toHaveLength(0);expect((await read()).contentChanged).toBe(true);
    expect(await action({action:"PUBLISH",expectedRevision:2,reviewed:true})).toMatchObject({status:"FAILED",error:{code:"EDITORIAL_NOT_REVIEWED"}});
    const before=await read();await db.contentMedia.deleteMany({where:{destinationId:id}});expect((await readPublicEditorial(id,db as Database))?.media).toHaveLength(0);expect((await read()).draftRevision).toBe(before.draftRevision);
  });
  it("HIDDEN publication stays hidden; forged ownership and absent acknowledgement rollback transaction",async()=>{
    const layout=autoLayout((await read()).context);
    await expect(action({action:"PUBLISH",expectedRevision:0,reviewed:false})).rejects.toMatchObject({code:"INVALID_EDITORIAL"});
    const forged={...layout,blocks:[{...layout.blocks[0]!,mediaIds:["foreign"]}]};expect((await action({action:"SAVE",expectedRevision:0,layout:forged})).status).toBe("FAILED");expect((await read()).draftRevision).toBe(0);
    await action({action:"SAVE",expectedRevision:0,layout});await action({action:"PUBLISH",expectedRevision:1,reviewed:true});
    expect((await db.destination.findUniqueOrThrow({where:{id}})).visibility).toBe("HIDDEN");expect(await readPublicEditorial(id,db as Database)).toBeNull();
  });
});
