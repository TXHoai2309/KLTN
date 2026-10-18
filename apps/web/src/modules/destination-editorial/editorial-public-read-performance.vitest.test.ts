import {expect,it,vi} from "vitest";
import {v3TestStore} from "../destination/__fixtures__/v3-store";
import {writeDestination} from "../destination/destination-service";
import {unknownSchedule} from "../destination/destination-contract";
import {readEditorialContext,readPublicEditorial} from "./editorial-service";
import {autoLayout,resolveEditorial} from "./editorial-engine";

async function fixture(){
  const f=v3TestStore(),h=new Headers();
  const created=await writeDestination(h,{name:"Performance fixture",description:"Verified fixture description.\n\nA second authored paragraph.",area:"fixture area",category:"nature",latitude:23,longitude:105,suggestedDurationMinutes:60,minimumDurationMinutes:30,openingDays:unknownSchedule()},"fixture-create",null,f.deps);
  if(created.status!=="SUCCESS")throw Error("Fixture creation failed");
  const id=created.data.id,row=f.rows().get(id),db=f.deps.database;
  row.visibility="VISIBLE";row.areas=[{id:"area-unused"}];row.cultureLinks=[{cultureId:"culture-unused"}];
  const context=await readEditorialContext(id,db),published=autoLayout(context);
  Object.assign(db,{destinationEditorial:{findUnique:vi.fn(async()=>({published}))}});
  return{...f,id,row,db,context,published};
}
it("public editorial omits unused relations and produces the same resolved DTO; Admin projection stays full",async()=>{
  const f=await fixture(),find=vi.spyOn(f.db.destination,"findUnique");
  expect(await readPublicEditorial(f.id,f.db)).toEqual(resolveEditorial(f.published,f.context));
  const contextQuery=find.mock.calls.find(([q])=>q.select&&"description"in q.select)?.[0];
  expect(contextQuery?.select).not.toHaveProperty("areas");expect(contextQuery?.select).not.toHaveProperty("cultureLinks");
  expect(contextQuery?.select).toHaveProperty("media");expect(contextQuery?.select).toHaveProperty("sources");expect(contextQuery?.select).toHaveProperty("openingDays");
  find.mockClear();await readEditorialContext(f.id,f.db);
  expect(find.mock.calls[0]![0].select).toHaveProperty("areas");expect(find.mock.calls[0]![0].select).toHaveProperty("cultureLinks");
});
it("hide racing the final visibility recheck cannot expose a previously read publication",async()=>{
  const f=await fixture(),original=f.db.destination.findUnique.bind(f.db.destination);let visibilityReads=0;
  vi.spyOn(f.db.destination,"findUnique").mockImplementation((q:any)=>{if(q.where.visibility&&++visibilityReads===2)f.row.visibility="HIDDEN";return original(q);});
  expect(await readPublicEditorial(f.id,f.db)).toBeNull();expect(visibilityReads).toBe(2);
});
it("fresh publication changes and hide/show apply on the next call without cache invalidation lag",async()=>{
  const f=await fixture();expect(await readPublicEditorial(f.id,f.db)).not.toBeNull();
  f.row.visibility="HIDDEN";expect(await readPublicEditorial(f.id,f.db)).toBeNull();
  f.row.visibility="VISIBLE";expect(await readPublicEditorial(f.id,f.db)).not.toBeNull();
  vi.mocked(f.db.destinationEditorial.findUnique).mockResolvedValueOnce({published:null} as any);
  expect(await readPublicEditorial(f.id,f.db)).toBeNull();
});
it("schedule validation still fails closed; data errors never return a stale layout",async()=>{
  const f=await fixture();f.row.openingDays[0].status="OPEN";
  expect(await readPublicEditorial(f.id,f.db)).toBeNull();
  f.row.openingDays[0].status="UNKNOWN";
  vi.spyOn(f.db.destination,"findUnique").mockRejectedValueOnce(new Error("database unavailable"));
  expect(await readPublicEditorial(f.id,f.db)).toBeNull();
});
