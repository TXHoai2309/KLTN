import {readFile,writeFile} from "node:fs/promises";
import {parseEnv} from "node:util";import {createHash} from "node:crypto";
import {PrismaNeon} from "@prisma/adapter-neon";
import {PrismaClient,Prisma} from "../../packages/db/prisma/generated/client";
import type {Database} from "@KLTN/db";
import {readInputs,verifyProvider} from "../preflight-destination-production-sync.mjs";
import {canonicalJson,summarize} from "./metrics.mjs";
import {readSpans,observeNeonFactory,unionMs} from "./neon-spans.mjs";
import {listPublicLocations,publicLocationSelect,projectPublicLocationRows} from "../../apps/web/src/modules/destination/public-destination-list";
import {publicLocationListSchema} from "../../apps/web/src/modules/destination/public-destination-query";
import {listPublicHomeDestinations} from "../../apps/web/src/modules/destination/public-home-destinations";
import {getPublicDestination} from "../../apps/web/src/modules/destination/public-destination-service";
import {readPublicEditorial,readEditorialContext} from "../../apps/web/src/modules/destination-editorial/editorial-service";
import {editorialLayoutSchema} from "../../apps/web/src/modules/destination-editorial/editorial-contract";
import {resolveEditorial} from "../../apps/web/src/modules/destination-editorial/editorial-engine";
import {retrievePlannerCandidates,recheckPlannerCandidates} from "../../apps/web/src/modules/trip-planner/planner-candidates";
import {createQaRetriever} from "../../apps/web/src/modules/ai/qa-retrieval";
import {EMBEDDING_PROVENANCE} from "../../apps/web/src/modules/rag-processing/embedding-contract";

type Observation={flow:string;variant:string;sample:number;serviceMs:number;serializationMs:number;totalMs:number;queryCount:number;connectionMs:number;driverRoundtripMs:number;freshConnections:number;waitingMax:number;resultHash:string;resultBytes:number};
async function main(){
const [file,output="docs/performance/evidence/neon-read-flows-before.json",mode="before"]=process.argv.slice(2);
if(!file||!["before","paired"].includes(mode))throw Error("Expected ignored secret-file and before|paired");
const input=readInputs(parseEnv(await readFile(file,"utf8")));await verifyProvider(input);
const url=new URL(input.target.value);url.searchParams.set("sslmode","verify-full");url.searchParams.set("options","-c default_transaction_read_only=on -c statement_timeout=5000 -c lock_timeout=2000");
const factory=observeNeonFactory(new PrismaNeon({connectionString:url.toString(),max:2,connectionTimeoutMillis:5000}));
const db=new PrismaClient({adapter:factory,log:[{emit:"event",level:"query"}]});
let queryCount=0;db.$on("query",()=>{queryCount++;});
const observations:Observation[]=[],plans:object[]=[];
try{
  const readOnly=await db.$queryRawUnsafe<{default_transaction_read_only:string}[]>("SHOW default_transaction_read_only");if(readOnly[0]?.default_transaction_read_only!=="on")throw Error("READ_ONLY_REQUIRED");
  const cohort=await listPublicLocations({},db);if(cohort.items.length!==3)throw Error("EXPECTED_THREE_PUBLIC_DESTINATIONS");
  const ids=cohort.items.map(d=>d.id);
  const candidates=await retrievePlannerCandidates(db);
  const seed=await db.$queryRawUnsafe<{vector:string}[]>(`SELECT e.embedding::text AS vector FROM rag_chunk_embedding e JOIN rag_chunk c ON c.id=e."chunkId" JOIN rag_index_generation g ON g.id=c."generationId" JOIN rag_index_publication p ON p."generationId"=g.id JOIN rag_document d ON d.id=p."ragDocumentId" WHERE d.status='INDEXED' AND d."publicQaApproved"=true AND g.state='READY' AND g."embeddingProvider"='openai' AND g."embeddingModel"='text-embedding-3-small' AND g."embeddingDimensions"=1536 ORDER BY e.id LIMIT 1`);
  const vector=JSON.parse(seed[0]?.vector??"null") as number[];if(!Array.isArray(vector)||vector.length!==1536)throw Error("ELIGIBLE_SEED_VECTOR_REQUIRED");
  // Stored eligible vector replaces ONLY embedding in this retrieval microbench.
  // It does not test semantic relevance, generate an answer or call a provider.
  const retriever=createQaRetriever(db,{topK:4,maxEvidenceTokens:3000,hybrid:true,provider:{...EMBEDDING_PROVENANCE,embed:async({input})=>input.map((_,index)=>({index,embedding:vector}))}});
  const legacyList=async()=>{const [rows,options]=await Promise.all([db.destination.findMany({where:{visibility:"VISIBLE"},select:publicLocationSelect,orderBy:[{name:"asc"},{id:"asc"}]}),db.destination.findMany({where:{visibility:"VISIBLE"},select:{category:true,area:true},distinct:["category","area"]})]);const unique=(v:string[])=>[...new Set(v.filter(s=>s.trim()))].sort((a,b)=>a.localeCompare(b,"vi"));return publicLocationListSchema.parse({items:projectPublicLocationRows(rows),filters:{categories:unique(options.map(r=>r.category)),regions:unique(options.map(r=>r.area))}});};
  const legacyHome=async()=>{const list=await legacyList(),details=await db.destination.findMany({where:{id:{in:list.items.map(d=>d.id)}},select:{id:true,description:true}});const descriptions:Record<string,string>={};for(const d of details){const t=d.description.trim().replace(/\s+/g," ");if(t)descriptions[d.id]=t.length>130?`${t.slice(0,127)}...`:t;}return{destinations:list.items,descriptions};};
  const legacyEditorial=async(id:string)=>{try{const visible=await db.destination.findUnique({where:{id,visibility:"VISIBLE"},select:{id:true}});if(!visible)return null;const row=await db.destinationEditorial.findUnique({where:{destinationId:id},select:{published:true}}),layout=editorialLayoutSchema.safeParse(row?.published);if(!layout.success)return null;const context=await readEditorialContext(id,db),current=await db.destination.findUnique({where:{id,visibility:"VISIBLE"},select:{id:true}});return current?resolveEditorial(layout.data,context):null;}catch{return null;}};
  const detail=async(id:string,legacy:boolean)=>({destination:await getPublicDestination(id,db),editorial:await(legacy?legacyEditorial(id):readPublicEditorial(id,db))});
  const flows:{id:string;route:string;api:string;before:()=>Promise<unknown>;after:()=>Promise<unknown>}[]=[
    {id:"landing",route:"/",api:"SERVER_COMPONENT",before:legacyHome,after:()=>listPublicHomeDestinations(db)},
    {id:"explore-list",route:"/explore",api:"/api/destinations",before:legacyList,after:()=>listPublicLocations({},db)},
    {id:"explore-map",route:"/explore?view=map",api:"/api/destinations?view=map",before:legacyList,after:()=>listPublicLocations({},db)},
    {id:"explore-keyword",route:"/explore?q=Đồng Văn",api:"/api/destinations?q=Đồng Văn",before:()=>listPublicLocations({q:"Đồng Văn"},db),after:()=>listPublicLocations({q:"Đồng Văn"},db)},
    {id:"explore-category",route:"/explore?category=...",api:"/api/destinations?category=...",before:()=>listPublicLocations({category:cohort.items[0]!.category},db),after:()=>listPublicLocations({category:cohort.items[0]!.category},db)},
    ...ids.map((id,index)=>({id:`destination-${index+1}`,route:`/destinations/${id}`,api:"SERVER_COMPONENT",before:()=>detail(id,true),after:()=>detail(id,false)})),
    {id:"public-editorial",route:`/destinations/${ids[0]}`,api:"INTERNAL_PUBLIC_EDITORIAL",before:()=>legacyEditorial(ids[0]!),after:()=>readPublicEditorial(ids[0]!,db)},
    {id:"planner-candidates",route:"/trips/new (repository only)",api:"INTERNAL_CANDIDATE_READ",before:()=>retrievePlannerCandidates(db),after:()=>retrievePlannerCandidates(db)},
    {id:"planner-recheck",route:"/trips/new (repository only)",api:"INTERNAL_CANDIDATE_RECHECK",before:()=>recheckPlannerCandidates(db,candidates),after:()=>recheckPlannerCandidates(db,candidates)},
    {id:"rag-retrieval",route:"/assistant (retrieval only)",api:"INTERNAL_RETRIEVAL_NO_MODEL",before:()=>retriever.retrieve("Cao nguyên đá Đồng Văn",[]),after:()=>retriever.retrieve("Cao nguyên đá Đồng Văn",[])},
  ];
  for(const flow of flows){
    for(let i=0;i<5;i++)for(const variant of mode==="before"?["before"]:i%2?["after","before"]:["before","after"]){
      const scope={connections:[] as {start:number;end:number;fresh:boolean;waiting:number}[],queries:[] as {start:number;end:number}[],explain:[] as {text:string;values:unknown[]}[]};queryCount=0;const started=performance.now();
      const value=await readSpans.run(scope,()=>variant==="before"?flow.before():flow.after());const serviceMs=performance.now()-started,count=queryCount;
      const serializeStart=performance.now(),json=JSON.stringify(value);const serializationMs=performance.now()-serializeStart;
      observations.push({flow:flow.id,variant,sample:i+1,serviceMs,serializationMs,totalMs:serviceMs+serializationMs,queryCount:count,connectionMs:unionMs(scope.connections),driverRoundtripMs:unionMs(scope.queries),freshConnections:scope.connections.filter(c=>c.fresh).length,waitingMax:Math.max(0,...scope.connections.map(c=>c.waiting)),resultHash:createHash("sha256").update(canonicalJson(value)).digest("hex"),resultBytes:Buffer.byteLength(json)});
      if(i===0&&variant==="before")for(const stmt of scope.explain.slice(0,16)){
        // One small SELECT replay per unique SQL shape/flow; server plan timings
        // are separate from original request, never mislabeled DB_QUERY_MS.
        const result=await db.$queryRawUnsafe<any[]>(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${stmt.text}`,...stmt.values);
        const plan=result[0]?.["QUERY PLAN"]?.[0];
        const structural=(p:any):object=>({node:p["Node Type"],relation:p["Relation Name"],index:p["Index Name"],rows:p["Actual Rows"],loops:p["Actual Loops"],actualTotalMs:p["Actual Total Time"],sharedHits:p["Shared Hit Blocks"],sharedReads:p["Shared Read Blocks"],...(p.Plans?{children:p.Plans.map(structural)}:{})});
        if(plan)plans.push({flow:flow.id,serverExecutionMs:plan["Execution Time"],serverPlanningMs:plan["Planning Time"],plan:structural(plan.Plan)});
      }
      await new Promise(r=>setTimeout(r,200));
    }
    console.log(JSON.stringify({completed:flow.id,mode}));
  }
  const blocked=[{id:"favorites",route:"/favorites",api:"/api/favorites"},{id:"my-trips",route:"/trips",api:"/api/trips"},{id:"dashboard",route:"/dashboard",api:"SERVER_COMPONENT"},{id:"cms-admin",route:"/admin/destinations",api:"/api/admin/destinations"},{id:"ai-history",route:"/assistant",api:"/api/ai/conversations"}].map(f=>({...f,status:"BLOCKED_NO_VALID_SESSION",metrics:"NOT_MEASURED"}));
  const summary=flows.map(f=>({flow:f.id,route:f.route,api:f.api,...Object.fromEntries(["before","after"].map(v=>{const a=observations.filter(o=>o.flow===f.id&&o.variant===v);return[v,{n:a.length,queryCounts:[...new Set(a.map(o=>o.queryCount))],connectionMs:summarize(a.map(o=>o.connectionMs)),driverRoundtripMs:summarize(a.map(o=>o.driverRoundtripMs)),serializationMs:summarize(a.map(o=>o.serializationMs)),totalMs:summarize(a.map(o=>o.totalMs)),resultHashes:[...new Set(a.map(o=>o.resultHash))]}];}))}));
  const state=await db.$queryRawUnsafe("SELECT state,count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() GROUP BY state");
  const report={measuredAt:new Date().toISOString(),mode,sourceHead:"a18e8be + performance working patch",scope:"Local service/repository benchmark using pinned Production READ ONLY; not authorized HTTP workload; no provider calls;5 samples, poolmax2, alternating variants",notMeasured:["Vercel function start/cold-start","valid session authentication","Prisma-only materialization CPU","actual original SQL server-only execution","Vercel-to-Neon pure network","response network/API total"],driverRoundtripDefinition:"client.query wait including wire and driver decode; separate pool acquisition; interval union avoids parallel double count",connectionDefinition:"warm pool checkout wait; fresh connection measured separately by connection probe",embedding:"stored eligible vector fixture; NOT semantic relevance/provider embedding acceptance",readOnly:true,databaseWrites:0,openAiCalls:0,routingCalls:0,summary,observations,plans,blocked,connectionState:state};
  await writeFile(output,JSON.stringify(report,null,2)+"\n");
  if(mode==="paired"&&summary.some((s:any)=>s.before.resultHashes.length!==1||s.after.resultHashes.length!==1||s.before.resultHashes[0]!==s.after.resultHashes[0])){console.error("DTO_EQUIVALENCE_FAILED");process.exitCode=1;}
}finally{await db.$disconnect();}
}
main().catch(()=>{console.error("NEON_FLOW_AUDIT_FAILED_DETAILS_SUPPRESSED");process.exitCode=1;});
