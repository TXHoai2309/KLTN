import {readFile,writeFile} from "node:fs/promises";import {parseEnv} from "node:util";
import {Client as TcpClient} from "pg";import {Client as WsClient} from "@neondatabase/serverless";
import {readInputs,verifyProvider,expected} from "../preflight-destination-production-sync.mjs";
import {summarize} from "./metrics.mjs";
const [file,output="docs/performance/evidence/neon-connections.json"]=process.argv.slice(2);
let phase="IDENTITY";
async function main(){
  const env=parseEnv(await readFile(file,"utf8")),input=readInputs(env);await verifyProvider(input);
  const observations=[];
  for(const [transport,Client]of [["TCP_TLS",TcpClient],["NEON_WEBSOCKET_TLS",WsClient]])for(const endpoint of ["pooled","direct"]){
    for(let trial=0;trial<3;trial++){
      const url=new URL(input.target.value);url.hostname=url.hostname.replace(`${expected.target.endpoint}-pooler`,expected.target.endpoint);
      if(endpoint==="pooled")url.hostname=url.hostname.replace(expected.target.endpoint,expected.target.endpoint+"-pooler");
      url.searchParams.set("sslmode","verify-full");url.searchParams.delete("options");
      const client=new Client({connectionString:url.toString(),connectionTimeoutMillis:10000});const start=performance.now();
      phase=`${transport}_${endpoint}_CONNECT`;
      try{await client.connect();const connectionMs=performance.now()-start;phase=`${transport}_${endpoint}_READONLY_CHECK`;await client.query("BEGIN READ ONLY");await client.query("SET LOCAL statement_timeout='5000ms'");await client.query("SET LOCAL lock_timeout='2000ms'");const ro=await client.query("SHOW transaction_read_only");if(ro.rows[0].transaction_read_only!=="on")throw Error("READ_ONLY_REQUIRED");
        for(let i=0;i<3;i++){const begin=performance.now();await client.query("SELECT 1 AS probe");observations.push({transport,endpoint,trial:trial+1,condition:i?"same-session-warm":"new-client-first-query",connectionMs:i===0?connectionMs:null,roundtripMs:performance.now()-begin});}
      }finally{await client.query("ROLLBACK").catch(()=>{});await client.end();}await new Promise(r=>setTimeout(r,300));
    }
  }
  const report={measuredAt:new Date().toISOString(),origin:"local audit host, NOT Vercel",method:"3 fresh clients per transport/endpoint;3 SELECT1 probes/client; one active connection at a time; TLS+read-only; no suspend/restart/load test",readOnly:true,databaseWrites:0,computeColdStart:"NOT_MEASURED: compute already active; never forced idle",observations,summary:[]};
  for(const transport of ["TCP_TLS","NEON_WEBSOCKET_TLS"])for(const endpoint of ["pooled","direct"]){const r=observations.filter(r=>r.transport===transport&&r.endpoint===endpoint);report.summary.push({transport,endpoint,connectMs:summarize(r.filter(r=>r.connectionMs!==null).map(r=>r.connectionMs)),warmRoundtripMs:summarize(r.filter(r=>r.condition==="same-session-warm").map(r=>r.roundtripMs))});}
  await writeFile(output,JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify(report.summary,null,2));
}
main().catch(async error=>{await writeFile(".cache/neon-connection-error-private.txt",String(error?.stack??error));console.error(JSON.stringify({status:"FAILED",phase,code:/^[A-Z0-9_]+$/.test(error?.code??"")?error.code:"DETAILS_SUPPRESSED"}));process.exitCode=1;});
