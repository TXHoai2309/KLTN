/** A failed item is never crossed by the resume cursor. Stale targets are skipped. */
export async function runCitationBackfillBatch<T extends {generationId:string},B>(input:{
  targets:readonly T[];after:string;limit:number;apply:boolean;
  verify:(target:T)=>Promise<B>;publish:(target:T,bundle:B)=>Promise<void>;
}) {
  let succeeded=0,failed=0,skipped=0,nextCursor=input.after;
  const diagnostics:string[]=[];
  for(const target of input.targets){
    try {
      const bundle=await input.verify(target);
      if(input.apply)await input.publish(target,bundle);
      succeeded++;nextCursor=target.generationId;
    }catch(error){
      const code=error instanceof Error&&/^CITATION_[A-Z_]+$/u.test(error.message)?error.message:"CITATION_BACKFILL_UNAVAILABLE";
      diagnostics.push(code);
      if(code==="CITATION_TARGET_STALE"){skipped++;nextCursor=target.generationId;continue;}
      failed++;break;
    }
  }
  return {mode:input.apply?"apply":"dry-run",succeeded,failed,skipped,nextCursor,hasMore:failed>0||input.targets.length===input.limit,diagnostics};
}
