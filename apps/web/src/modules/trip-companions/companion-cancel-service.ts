import { executeIdempotentWrite } from "@/server/http/idempotency";
import { requireTraveler } from "@/server/auth/require-traveler";
import { companionId, confirmed, groupInclude, groupUnavailable, lockCompanion } from "./companion-group-service";
import { companionGroupMutationSchema } from "./companion-group-contract";
import type { CompanionDependencies } from "./companion-service";

export async function cancelCompanion(headers: Headers, rawId: string, input: unknown, key: string, deps: CompanionDependencies) {
  const id = companionId(rawId), payload = confirmed(input), actor = await requireTraveler(headers, deps);
  const current = await deps.database.tripCompanionPublication.findUnique({ where: { id }, include: groupInclude });
  if (!current || current.trip.userId !== actor.userId) throw groupUnavailable();
  return executeIdempotentWrite({ database: deps.database, actorId: actor.userId, operation: "trip-companions:cancel", key, input: { publicationId: id, ...payload }, execute: async tx => {
    const row = await lockCompanion(tx, id, actor.userId, headers, deps);
    if (row.trip.userId !== actor.userId) throw groupUnavailable();
    if (!row.canceledAt) {
      const updated = await tx.tripCompanionPublication.update({ where: { id }, data: { canceledAt: (deps.now ?? (() => new Date()))(), recruitmentOpen: false, managementRevision: { increment: 1 }, messageSequence: { increment: 1 } }, select: { messageSequence: true } });
      await tx.tripCompanionMessage.create({ data: { publicationId: id, sequence: updated.messageSequence, kind: "SYSTEM", authorId: null, text: "Chủ chuyến đã hủy chuyến đồng hành. Nhóm giữ lịch trình và lịch sử trao đổi để đọc lại.", notice: { type: "COMPANION_CANCELED" } } });
    }
    return companionGroupMutationSchema.parse({ publicationId: id });
  } });
}
