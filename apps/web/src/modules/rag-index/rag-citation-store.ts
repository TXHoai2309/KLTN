import { Prisma, type Database } from "@KLTN/db";
import { randomUUID } from "node:crypto";
import { ORIGINAL_SOURCE_PARSER, readOriginalSourceBundle, sourceBundleHash, type OriginalSourceBundle } from "../rag-processing/original-sources";

type Reader = Pick<Database, "$queryRaw">;
export type CitationBundleRow = { id: string; generationId: string; contentVersionId: string; metadata: unknown; metadataHash: string };

export async function loadCitationBundle(db: Reader, generationId: string): Promise<(CitationBundleRow & { bundle: OriginalSourceBundle }) | null> {
  try {
    const rows = await db.$queryRaw<CitationBundleRow[]>(Prisma.sql`SELECT id,"generationId","contentVersionId",metadata,"metadataHash" FROM rag_citation_bundle WHERE "generationId"=${generationId} AND "parserVersion"=${ORIGINAL_SOURCE_PARSER}`);
    const row = rows[0];
    if (!row) return null;
    const bundle = readOriginalSourceBundle(row.metadata,row.metadataHash);
    if (!bundle) return null;
    return { ...row,bundle };
  } catch (error) {
    // Before additive migration, legacy citations stay available. Other DB errors
    // are not silently converted to source absence.
    const code = (error as { meta?: { code?: string }; code?: string })?.meta?.code;
    if (code === "42P01") return null;
    throw error;
  }
}

export async function persistCitationBundle(db: Database, documentId: string, generationId: string, contentVersionId: string, bundle: OriginalSourceBundle, currentPublication = false): Promise<void> {
  const hash = sourceBundleHash(bundle);
  await db.$transaction(async tx => {
    const docs = await tx.$queryRaw<{ id:string }[]>(Prisma.sql`SELECT id FROM rag_document WHERE id=${documentId} AND "deletedAt" IS NULL AND status IN ('APPROVED','INDEXED') FOR UPDATE`);
    if (!docs.length) throw new Error("CITATION_TARGET_STALE");
    if (currentPublication) {
      const current=await tx.$queryRaw<{id:string}[]>(Prisma.sql`SELECT p.id FROM rag_index_publication p JOIN rag_document d ON d.id=p."ragDocumentId" JOIN rag_index_generation g ON g.id=p."generationId" WHERE d.id=${documentId} AND d.status='INDEXED' AND d."publicQaApproved"=true AND d."deletedAt" IS NULL AND p."generationId"=${generationId} AND g.state='READY'`);
      if (!current.length) throw new Error("CITATION_TARGET_STALE");
    }
    const versions = await tx.$queryRaw<{ id:string }[]>(Prisma.sql`SELECT g.id FROM rag_index_generation g JOIN rag_content_version v ON v.id=g."contentVersionId" AND v."ragDocumentId"=g."ragDocumentId" WHERE g.id=${generationId} AND g."ragDocumentId"=${documentId} AND v.id=${contentVersionId} AND v."originalBytesHash"=${bundle.originalBytesHash} AND v."normalizedContentHash"=${bundle.normalizedContentHash}`);
    if (!versions.length) throw new Error("CITATION_VERSION_MISMATCH");
    const chunks = await tx.$queryRaw<{ chunkHash:string }[]>(Prisma.sql`SELECT "chunkHash" FROM rag_chunk WHERE "generationId"=${generationId}`);
    if (chunks.length !== Object.keys(bundle.bindings).length || chunks.some(chunk => !bundle.bindings[chunk.chunkHash])) throw new Error("CITATION_CHUNK_MISMATCH");
    await tx.$executeRaw(Prisma.sql`INSERT INTO rag_citation_bundle(id,"ragDocumentId","generationId","contentVersionId","parserVersion",metadata,"metadataHash") VALUES(${randomUUID()},${documentId},${generationId},${contentVersionId},${ORIGINAL_SOURCE_PARSER},${JSON.stringify(bundle)}::jsonb,${hash}) ON CONFLICT("generationId","parserVersion") DO NOTHING`);
    const stored = await loadCitationBundle(tx,generationId);
    if (!stored || stored.metadataHash !== hash) throw new Error("CITATION_REPLAY_CONFLICT");
  });
}
