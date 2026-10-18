import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { connection } from "../rag-sync-lib.mjs";
const [action, file, portInput = "3098"] = process.argv.slice(2);
if (!["build", "start"].includes(action) || !file || !/^\d{4,5}$/.test(portInput)) throw Error("Use build|start ignored-secret-file [port]");
const secrets = parseEnv(await readFile(file,"utf8"));
const url=connection(secrets,"target");
url.searchParams.set("options","-c default_transaction_read_only=on -c statement_timeout=10000 -c lock_timeout=2000");
url.searchParams.set("sslmode","verify-full");
// Child-only settings; no secret file or Vercel environment is changed. Any
// accidental write is refused by PostgreSQL. No OpenAI/routing key supplied.
const env={...process.env,KLTN_PERF_BUILD:"1",NODE_ENV:"production",DATABASE_URL:url.toString(),BETTER_AUTH_URL:`http://localhost:${portInput}`,BETTER_AUTH_SECRET:"performance-local-only-secret-not-a-real-credential-2026",QA_PRODUCTION_RUNTIME_ENABLED:"false",QA_RUNTIME_ENABLED:"false",QA_PREVIEW_RUNTIME_ENABLED:"false",OPENAI_API_KEY:"",STADIA_MAPS_API_KEY:"",NEXT_TELEMETRY_DISABLED:"1"};
const next="../../node_modules/next/dist/bin/next";
const child=spawn(process.execPath,[next,action,...(action==="start"?["--port",portInput]:[])],{cwd:"apps/web",env,stdio:"inherit"});
for(const signal of ["SIGTERM","SIGINT"])process.on(signal,()=>child.kill(signal));
child.on("exit",code=>{process.exitCode=code??1;});
