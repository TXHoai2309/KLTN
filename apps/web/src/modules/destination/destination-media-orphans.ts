import { createHash } from "node:crypto";
import type { Prisma } from "@KLTN/db";
/** Durable cleanup candidates, recorded atomically with unlinking. This is an
 * audit manifest in the existing write journal, never a Cloudinary delete job. */
export async function recordUnlinkedCloudinaryMedia(tx: Prisma.TransactionClient, actorId: string, destinationId: string,
  key: string, media: { id: string; url: string; storageReference: string | null }[]) {
  for (const row of media) {
    try {
      if (JSON.parse(row.storageReference ?? "null")?.provider !== "cloudinary") continue;
    } catch { continue; }
    const responseJson = JSON.stringify({ status: "UNLINKED_CLEANUP_CANDIDATE", destinationId, mediaId: row.id,
      url: row.url, storageReference: row.storageReference, unlinkedBy: actorId, unlinkedAt: new Date().toISOString(), physicalDeletion: "NOT_AUTHORIZED" });
    await tx.idempotencyRecord.create({ data: { scope: JSON.stringify([actorId, `destination:media-unlinked:${destinationId}`]),
      key: createHash("sha256").update(`${key}:${row.id}`).digest("hex"), requestHash: createHash("sha256").update(responseJson).digest("hex"), responseJson } });
  }
}
