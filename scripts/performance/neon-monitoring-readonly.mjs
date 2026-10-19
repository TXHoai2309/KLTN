import { readFile,writeFile,mkdir } from "node:fs/promises";
import { parseEnv } from "node:util";
import { dirname } from "node:path";
const [file,output="docs/performance/evidence/neon-monitoring.json"]=process.argv.slice(2);
if(!file)throw Error("Ignored secret-file path required");
const env=parseEnv(await readFile(file,"utf8"));
if(!env.NEON_API_KEY)throw Error("NEON_API_KEY_REQUIRED");
const projectId="summer-unit-95870477", endpointId="ep-blue-art-b3v3vr4h";
const get=async path=>{const r=await fetch("https://console.neon.tech/api/v2"+path,{headers:{Authorization:`Bearer ${env.NEON_API_KEY}`},redirect:"error",signal:AbortSignal.timeout(15000)});return {status:r.status,data:r.ok?await r.json():null};};
const project=await get(`/projects/${projectId}`), endpoint=await get(`/projects/${projectId}/endpoints/${endpointId}`);
const report={measuredAt:new Date().toISOString(),readOnly:true,projectMetadataHttp:project.status,endpointMetadataHttp:endpoint.status};
report.region=project.data?.project?.region_id??null;
if(endpoint.data?.endpoint){const e=endpoint.data.endpoint;report.compute={currentState:e.current_state,pendingState:e.pending_state,autoscalingMinCu:e.autoscaling_limit_min_cu,autoscalingMaxCu:e.autoscaling_limit_max_cu,suspendTimeoutSeconds:e.suspend_timeout_seconds};}
const org=project.data?.project?.org_id;
if(org){const to=new Date(),from=new Date(to.getTime()-86400000);const q=new URLSearchParams({org_id:org,project_ids:projectId,from:from.toISOString(),to:to.toISOString(),granularity:"hourly",metrics:"compute_unit_seconds,public_network_transfer_bytes",limit:"1"});const consumption=await get(`/consumption_history/v2/projects?${q}`);report.consumption={httpStatus:consumption.status,available:consumption.status===200,window:"last24h",...(consumption.data?{metrics:consumption.data.projects?.map(p=>({data:p.data??p.consumption??null}))??[],responseKeys:Object.keys(consumption.data)}:{reason:"Provider did not grant consumption history; no zero-usage inference"})};}
else report.consumption={available:false,reason:"No accessible project organization identity"};
await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify(report,null,2));
