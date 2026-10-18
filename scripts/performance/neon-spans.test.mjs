import {test} from "node:test";import assert from "node:assert/strict";
import {unionMs,readSpans,observeNeonFactory} from "./neon-spans.mjs";
test("parallel roundtrips are not double-counted as critical-path time",()=>{
  assert.equal(unionMs([{start:0,end:10},{start:5,end:20},{start:25,end:30}]),25);assert.equal(unionMs([]),0);
});
test("observer preserves pool callback and promise overloads without retaining SQL in numeric spans",async()=>{
  const client={query(...args){const cb=args.at(-1);return typeof cb==="function"?cb(null,{rows:[1]}):Promise.resolve({rows:[1]});}};
  const pool={waitingCount:0,totalCount:1,idleCount:0,connect(cb){return cb?cb(null,client,()=>{}):Promise.resolve(client);}};
  const factory=observeNeonFactory({connect:async()=>({underlyingDriver:()=>pool})});await factory.connect();
  const scope={connections:[],queries:[],explain:[]};
  await readSpans.run(scope,async()=>{const c=await pool.connect();assert.deepEqual(await c.query("SELECT $1",[1]),{rows:[1]});await new Promise((resolve,reject)=>pool.connect((err,c)=>{if(err)return reject(err);c.query({text:"SELECT $1"},[2],(e,result)=>{assert.deepEqual(result,{rows:[1]});resolve();});}));});
  assert.deepEqual(scope.connections.map(s=>s.fresh),[true,false]);assert.equal(scope.queries.length,2);assert.equal(scope.explain.length,2);
  assert.ok(scope.queries.every(q=>Object.keys(q).sort().join(",")==="end,start"));
});
