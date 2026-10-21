import { randomUUID } from "node:crypto";
import { beforeAll,afterAll,describe,it,expect } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../../../packages/db/prisma/generated/client";
import type { Database } from "@KLTN/db";
import { persistCitationBundle,loadCitationBundle } from "./rag-citation-store";
import { ORIGINAL_SOURCE_PARSER,sourceBundleHash,type OriginalSourceBundle } from "../rag-processing/original-sources";
const url=process.env.US19_TASK184_TEST_DATABASE_URL;
(url?describe:describe.skip)("original-source sidecar real PostgreSQL",()=>{
 let db:PrismaClient;
 beforeAll(()=>{
  const target=new URL(url!);
  if(!["localhost","127.0.0.1","[::1]"].includes(target.hostname)||target.username!=="task184_test"||target.pathname!=="/task184_test"||target.searchParams.get("sslmode")!=="disable"||process.env.US19_TASK184_TEST_DISPOSABLE!=="I_UNDERSTAND_THIS_IS_A_DISPOSABLE_TEST_DATABASE")throw Error("Disposable loopback database required");
  db=new PrismaClient({adapter:new PrismaPg({connectionString:url!})});
 });
 afterAll(async()=>{await db?.$disconnect();});
 async function fixture(){
  const doc=await db.ragDocument.create({data:{originalFileName:"synthetic.txt",fileType:"TXT",mimeType:"text/plain",sizeBytes:1,storagePath:`synthetic/${randomUUID()}`,sourceTitle:"Synthetic",uploadedById:"synthetic-admin",status:"APPROVED"}});
  const version=await db.ragContentVersion.create({data:{ragDocumentId:doc.id,originalBytesHash:"a".repeat(64),normalizedContentHash:"b".repeat(64),identityHash:randomUUID().replaceAll("-","").repeat(2),extractorVersion:"synthetic",normalizationVersion:"synthetic"}});
  const gen=await db.ragIndexGeneration.create({data:{ragDocumentId:doc.id,contentVersionId:version.id,generationKey:randomUUID().replaceAll("-","").repeat(2),chunkerVersion:"synthetic",chunkOptions:{},embeddingProvider:"openai",embeddingModel:"text-embedding-3-small",embeddingDimensions:1536,tokenizer:"synthetic",tokenizerVersion:"synthetic",expectedChunkCount:1,expectedTokenCount:1}});
  await db.ragChunk.create({data:{ragDocumentId:doc.id,generationId:gen.id,index:0,text:"Synthetic",refs:[],locators:[],textHash:"c".repeat(64),chunkHash:"d".repeat(64),chunkerVersion:"synthetic"}});
  const bundle:OriginalSourceBundle={parserVersion:ORIGINAL_SOURCE_PARSER,originalBytesHash:version.originalBytesHash,normalizedContentHash:version.normalizedContentHash,registry:{S1:{title:"Article",url:"https://example.org/article"}},scopes:{},sectionCount:0,bindings:{["d".repeat(64)]:{sourceCodes:["S1"],metadataOnly:false,excludedSpans:[]}}};
  return {doc,version,gen,bundle};
 }
 it("atomically publishes identical concurrent retries without altering generation or chunks",async()=>{
  const {doc,version,gen,bundle}=await fixture();const chunks=await db.ragChunk.findMany({where:{generationId:gen.id}});
  await Promise.all([1,2].map(()=>persistCitationBundle(db as Database,doc.id,gen.id,version.id,bundle)));
  expect(await db.ragCitationBundle.count({where:{generationId:gen.id}})).toBe(1);
  expect((await loadCitationBundle(db as Database,gen.id))?.metadataHash).toBe(sourceBundleHash(bundle));
  expect(await db.ragIndexGeneration.findUnique({where:{id:gen.id}})).toEqual(gen);
  expect(await db.ragChunk.findMany({where:{generationId:gen.id}})).toEqual(chunks);
 });
 it("rejects conflicting retry and rolls back without overwriting the confirmed bundle",async()=>{
  const {doc,version,gen,bundle}=await fixture();await persistCitationBundle(db as Database,doc.id,gen.id,version.id,bundle);
  const different=structuredClone(bundle);different.registry.S1!.url="https://example.org/other";
  await expect(persistCitationBundle(db as Database,doc.id,gen.id,version.id,different)).rejects.toThrow("CITATION_REPLAY_CONFLICT");
  expect((await loadCitationBundle(db as Database,gen.id))?.metadataHash).toBe(sourceBundleHash(bundle));
 });
 it("rejects stale publication and soft-deleted targets without metadata writes",async()=>{
  const {doc,version,gen,bundle}=await fixture();
  await expect(persistCitationBundle(db as Database,doc.id,gen.id,version.id,bundle,true)).rejects.toThrow("CITATION_TARGET_STALE");
  await db.ragDocument.update({where:{id:doc.id},data:{deletedAt:new Date(),status:"DISABLED"}});
  await expect(persistCitationBundle(db as Database,doc.id,gen.id,version.id,bundle)).rejects.toThrow("CITATION_TARGET_STALE");
  expect(await db.ragCitationBundle.count({where:{generationId:gen.id}})).toBe(0);
 });
});
