import {describe,it,expect,vi} from "vitest";
import {runCitationBackfillBatch} from "./rag-citation-backfill-batch";
describe("bounded citation backfill operator outcomes",()=>{
  const targets=[{generationId:"a"},{generationId:"b"},{generationId:"c"}];
  function input(apply=false){return {targets,after:"",limit:3,apply,verify:vi.fn(async()=>"bundle"),publish:vi.fn(async()=>{})};}
  it("dry-run verifies every input without publishing",async()=>{
    const deps=input();expect(await runCitationBackfillBatch(deps)).toMatchObject({succeeded:3,nextCursor:"c",hasMore:true,mode:"dry-run"});expect(deps.publish).not.toHaveBeenCalled();
  });
  it("stops at a mismatch and resumes before the failed item",async()=>{
    const deps=input(true);deps.verify.mockResolvedValueOnce("bundle").mockRejectedValueOnce(Error("CITATION_VERSION_MISMATCH"));
    const result=await runCitationBackfillBatch(deps);expect(result).toMatchObject({succeeded:1,failed:1,nextCursor:"a",diagnostics:["CITATION_VERSION_MISMATCH"]});expect(deps.verify).toHaveBeenCalledTimes(2);expect(deps.publish).toHaveBeenCalledTimes(1);
    const retry=input(true);retry.targets=targets.filter(t=>t.generationId>result.nextCursor);retry.after=result.nextCursor;
    expect(await runCitationBackfillBatch(retry)).toMatchObject({succeeded:2,failed:0,nextCursor:"c"});
  });
  it("skips a target revoked under the publication lock and never logs exception contents",async()=>{
    const deps=input(true);deps.publish.mockRejectedValueOnce(Error("CITATION_TARGET_STALE"));
    expect(await runCitationBackfillBatch(deps)).toMatchObject({succeeded:2,skipped:1,nextCursor:"c"});
    const uncertain=input(true);uncertain.publish.mockRejectedValueOnce(Error("secret exception and token"));
    expect(await runCitationBackfillBatch(uncertain)).toMatchObject({succeeded:0,failed:1,nextCursor:"",diagnostics:["CITATION_BACKFILL_UNAVAILABLE"]});
  });
});
