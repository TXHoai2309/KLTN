import { createPrismaClient, Prisma } from "@KLTN/db";
import { ragStorage } from "../src/modules/rag-document/rag-storage";
import { validateRagFile } from "../src/modules/rag-document/rag-file";
import { persistCitationBundle } from "../src/modules/rag-index/rag-citation-store";
import { rebuildCitationBundle, type CitationBackfillTarget } from "../src/modules/rag-index/rag-citation-backfill";
import type { DocumentChunk } from "../src/modules/rag-processing/chunk-contract";
import { runCitationBackfillBatch } from "../src/modules/rag-index/rag-citation-backfill-batch";

async function main() {
  const args=new Map(process.argv.slice(2).map(arg=>{const at=arg.indexOf("=");return at<0?[arg,"true"]:[arg.slice(0,at),arg.slice(at+1)];}));
  if ([...args.keys()].some(key=>!["--apply","--database-host","--database-name","--after","--limit"].includes(key))) throw Error("UNKNOWN_ARGUMENT");
  const url=new URL(process.env.DATABASE_URL ?? "");
  if (url.hostname!==args.get("--database-host") || decodeURIComponent(url.pathname.slice(1))!==args.get("--database-name")) throw Error("EXPLICIT_DATABASE_TARGET_REQUIRED");
  const limit=Number(args.get("--limit") ?? 20);
  if (!Number.isInteger(limit)||limit<1||limit>100)throw Error("INVALID_BATCH_LIMIT");
  if (args.has("--apply")&&args.get("--apply")!=="true")throw Error("INVALID_APPLY_FLAG");
  const apply=args.has("--apply"),after=args.get("--after") ?? "";
  const db=createPrismaClient({DATABASE_URL:process.env.DATABASE_URL!});
  try {
    type Target=CitationBackfillTarget & {id:string;generationId:string;contentVersionId:string;storagePath:string;sizeBytes:number;mimeType:string;originalFileName:string};
    const targets=await db.$queryRaw<Target[]>(Prisma.sql`SELECT d.id,p."generationId",g."contentVersionId",d."storagePath",d."sizeBytes",d."mimeType",d."originalFileName",d."fileType",v."originalBytesHash",v."normalizedContentHash",v."extractorVersion",v."normalizationVersion",g."chunkerVersion",g."chunkOptions" FROM rag_index_publication p JOIN rag_document d ON d.id=p."ragDocumentId" JOIN rag_index_generation g ON g.id=p."generationId" JOIN rag_content_version v ON v.id=g."contentVersionId" WHERE d."deletedAt" IS NULL AND d.status='INDEXED' AND d."publicQaApproved"=true AND g.state='READY' AND p."generationId">${after} ORDER BY p."generationId" LIMIT ${limit}`);
    const result=await runCitationBackfillBatch({targets,after,limit,apply,
      verify:async target=>{
        const file=await ragStorage.read(target.storagePath,AbortSignal.timeout(30_000));
        if(file.sizeBytes!==target.sizeBytes||file.mimeType!==target.mimeType||validateRagFile(target.originalFileName,file.mimeType,file.bytes)!==target.fileType)throw Error("CITATION_ORIGINAL_MISMATCH");
        const stored=await db.$queryRaw<DocumentChunk[]>(Prisma.sql`SELECT "index",text,refs,locators,"textHash","chunkHash","chunkerVersion" FROM rag_chunk WHERE "generationId"=${target.generationId} ORDER BY "index"`);
        return rebuildCitationBundle(target,file.bytes,stored);
      },
      publish:(target,bundle)=>persistCitationBundle(db,target.id,target.generationId,target.contentVersionId,bundle,true),
    });
    console.log(JSON.stringify(result));
    if(result.failed)process.exitCode=1;
  } finally {await db.$disconnect();}
}
main().catch(()=>{console.error("CITATION_BACKFILL_FAILED: check arguments, target, migration and server credentials");process.exitCode=1;});
