import { z } from "zod";
import { requireActor } from "@/server/authorization/guard";
import { AppError } from "@/server/http/app-error";
import { executeIdempotentWrite } from "@/server/http/idempotency";
import type { CultureDependencies } from "@/modules/culture/culture-service";
import { taxonomyInputSchema, referenceId } from "./content-profile-contract";
const querySchema=z.object({type:z.enum(["AREA","COMMUNITY","CULTURE"]),q:z.string().max(200).default(""),ids:z.string().max(4000).default("")}).strict();
export async function listTaxonomy(headers:Headers,request:Request,deps:CultureDependencies){
 await requireActor(headers,deps,"admin");const params=new URL(request.url).searchParams;
 if([...params.keys()].some(k=>params.getAll(k).length!==1))throw new AppError("INVALID_CONTENT_QUERY","Tham số không hợp lệ.",400);
 const parsed=querySchema.safeParse(Object.fromEntries(params));if(!parsed.success)throw new AppError("INVALID_CONTENT_QUERY","Tham số không hợp lệ.",400);
 const {type,q,ids}=parsed.data;const selected=ids?ids.split(","):[];
 if(!z.array(referenceId).max(30).safeParse(selected).success)throw new AppError("INVALID_CONTENT_QUERY","Liên kết không hợp lệ.",400);
 const filter={OR:[{name:{contains:q.trim(),mode:"insensitive" as const}},{id:{in:selected}}]};
 if(type==="CULTURE"){const items=await deps.database.cultureContent.findMany({where:{OR:[{title:{contains:q.trim(),mode:"insensitive"}},{id:{in:selected}}]},take:60,orderBy:[{title:"asc"},{id:"asc"}],select:{id:true,title:true}});return{items:items.map(i=>({id:i.id,name:i.title}))};}
 return{items:type==="AREA"?await deps.database.area.findMany({where:filter,take:60,orderBy:[{name:"asc"},{id:"asc"}],select:{id:true,name:true,kind:true}}):await deps.database.community.findMany({where:filter,take:60,orderBy:[{name:"asc"},{id:"asc"}],select:{id:true,name:true}})};
}
export async function createTaxonomy(headers:Headers,body:unknown,key:string,deps:CultureDependencies){
 const actor=await requireActor(headers,deps,"admin");const parsed=taxonomyInputSchema.safeParse(body);if(!parsed.success)throw new AppError("INVALID_CONTENT_TAXONOMY","Tên hoặc loại không hợp lệ.",400);const input=parsed.data;
 return executeIdempotentWrite({database:deps.database,actorId:actor.id,operation:"content-taxonomy:create",key,input,execute:async tx=>{await requireActor(headers,{...deps,database:tx as unknown as CultureDependencies["database"]},"admin");const name=input.name;return input.type==="AREA"?tx.area.upsert({where:{name},create:{name,kind:input.kind??"LOCALITY"},update:{},select:{id:true,name:true,kind:true}}):tx.community.upsert({where:{name},create:{name},update:{},select:{id:true,name:true}});}});
}
