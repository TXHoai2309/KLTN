import { test } from "node:test";
import assert from "node:assert/strict";
import type { Database } from "@KLTN/db";
import { readPublicCultureDetail } from "./public-culture-detail";
test("original culture detail always queries public visibility; hidden body never returned",async()=>{
  for(const visible of [true,false]) {
    const database={cultureContent:{findFirst:async({where,select}:{where:object;select:object})=>{assert.deepEqual(where,{id:"c",visibility:"VISIBLE"});assert.ok(select);return visible?{id:"c",title:"Public",content:"Body",sourceTitle:null,sourceUrl:"javascript:bad"}:null;}}} as unknown as Database;
    if(visible) assert.deepEqual(await readPublicCultureDetail("c",database),{id:"c",title:"Public",content:"Body",sourceTitle:null,sourceUrl:null});
    else await assert.rejects(readPublicCultureDetail("c",database),{status:404});
  }
});
