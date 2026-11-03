import type { Database } from "@KLTN/db";
import { Prisma } from "@KLTN/db";
import { AppError } from "@/server/http/app-error";
import { requireTraveler } from "@/server/auth/require-traveler";
import { executeIdempotentWrite } from "@/server/http/idempotency";
import { companionId, groupRelationship, lockCompanion, requireGroup } from "./companion-group-service";
import { invalidChatCursor } from "./companion-chat-service";
import { companionReadInputSchema, companionReadResultSchema, companionUnreadQuerySchema, companionUnreadSchema } from "./companion-unread-contract";
import type { CompanionDependencies } from "./companion-service";

export async function markCompanionRead(headers: Headers, rawId: string, input: unknown, key: string, deps: CompanionDependencies) {
  const id = companionId(rawId), parsed = companionReadInputSchema.safeParse(input);
  if (!parsed.success) throw invalidChatCursor();
  const { actor } = await requireGroup(headers, id, deps), sequence = BigInt(parsed.data.sequence);
  return executeIdempotentWrite({ database: deps.database, actorId: actor.userId, operation: "trip-companions:read", key, input: { publicationId: id, ...parsed.data }, execute: async tx => {
    const row = await lockCompanion(tx, id, actor.userId, headers, deps); await groupRelationship(tx, row, actor.userId);
    if (sequence > row.messageSequence || (sequence > BigInt(0) && !await tx.tripCompanionMessage.findUnique({ where: { publicationId_sequence: { publicationId: id, sequence } }, select: { id: true } }))) throw invalidChatCursor();
    const where = { publicationId_userId: { publicationId: id, userId: actor.userId } };
    const old = await tx.tripCompanionReadMarker.findUnique({ where });
    const next = old && old.lastReadSequence > sequence ? old.lastReadSequence : sequence;
    await tx.tripCompanionReadMarker.upsert({ where, create: { publicationId: id, userId: actor.userId, lastReadSequence: next }, update: { lastReadSequence: next } });
    return companionReadResultSchema.parse({ publicationId: id, sequence: next.toString() });
  } });
}

export async function getCompanionUnread(headers: Headers, input: unknown, deps: CompanionDependencies) {
  const parsed = companionUnreadQuerySchema.safeParse(input);
  if (!parsed.success) throw new AppError("INVALID_COMPANION_QUERY", "Tham số chưa đọc không hợp lệ.", 400);
  const query = parsed.data;
  return deps.database.$transaction(async tx => {
    const actor = await requireTraveler(headers, { ...deps, database: tx as Database });
    const rows = await tx.tripCompanionPublication.findMany({ where: {
      OR: [{ trip: { userId: actor.userId } }, { memberships: { some: { userId: actor.userId, state: "ACTIVE" } } }],
      ...(query.after ? { id: { gt: query.after } } : {}),
    }, orderBy: { id: "asc" }, take: query.limit + 1, select: {
      id: true, messageSequence: true, canceledAt: true, readMarkers: { where: { userId: actor.userId }, select: { lastReadSequence: true } },
    } });
    const page = rows.slice(0, query.limit);
    // Fully consumed groups cannot contain unread messages in this snapshot.
    const unreadPage = page.filter(row => (row.readMarkers[0]?.lastReadSequence ?? BigInt(0)) < row.messageSequence);
    const counts = unreadPage.length ? await tx.$queryRaw<{ publicationId: string; unread: bigint }[]>(Prisma.sql`
      SELECT m."publicationId", count(*) AS unread FROM trip_companion_message m
      JOIN trip_companion_publication p ON p.id=m."publicationId"
      LEFT JOIN trip_companion_read_marker r ON r."publicationId"=p.id AND r."userId"=${actor.userId}
      WHERE p.id IN (${Prisma.join(unreadPage.map(row => row.id))})
        AND m.sequence > COALESCE(r."lastReadSequence",0) AND m.sequence <= p."messageSequence"
        AND (m."authorId" IS NULL OR m."authorId" <> ${actor.userId})
      GROUP BY m."publicationId"`) : [];
    const byPublication = new Map(counts.map(row => [row.publicationId, Number(row.unread)]));
    const items = page.map(row => {
      const marker = row.readMarkers[0]?.lastReadSequence ?? BigInt(0);
      return { publicationId: row.id, unreadCount: byPublication.get(row.id) ?? 0, lastReadCursor: marker.toString(), highWaterCursor: row.messageSequence.toString(), canSend: !row.canceledAt };
    });
    return companionUnreadSchema.parse({ items, nextCursor: rows.length > query.limit ? page.at(-1)!.id : null });
  }, { isolationLevel: "RepeatableRead" });
}
