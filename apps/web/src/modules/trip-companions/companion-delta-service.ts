import type { Database } from "@KLTN/db";
import type { MutationOutcome } from "@/lib/mutation-contract";
import { preflightIdempotentReplay } from "@/server/http/idempotency";
import { companionDeltaQuerySchema, companionDeltaSchema, companionSendResultSchema } from "./companion-chat-contract";
import { chatInput, chatMessageSelect, invalidChatCursor, projectChatMessage } from "./companion-chat-service";
import { assertCompanionCanSend, companionId, requireGroup } from "./companion-group-service";
import type { CompanionDependencies } from "./companion-service";

export async function getCompanionDelta(headers: Headers, rawId: string, input: unknown, deps: CompanionDependencies) {
  const id = companionId(rawId), parsed = companionDeltaQuerySchema.safeParse(input);
  if (!parsed.success) throw invalidChatCursor();
  const query = parsed.data;
  return deps.database.$transaction(async tx => {
    const { row, relationship } = await requireGroup(headers, id, { ...deps, database: tx as Database });
    const after = BigInt(query.after);
    if (after > row.messageSequence) throw invalidChatCursor();
    // requireGroup still checks the current principal and relationship. With a
    // consumed committed cut, no message can satisfy this range in this snapshot.
    const rows = after === row.messageSequence ? [] : await tx.tripCompanionMessage.findMany({ where: { publicationId: id, sequence: { gt: after, lte: row.messageSequence } }, orderBy: { sequence: "asc" }, take: query.limit + 1, select: chatMessageSelect });
    const page = rows.slice(0, query.limit);
    return companionDeltaSchema.parse({ publicationId: id, items: page.map(projectChatMessage), nextCursor: page.at(-1)?.sequence.toString() ?? query.after,
      highWaterCursor: row.messageSequence.toString(), hasMore: rows.length > query.limit, canSend: !row.canceledAt, relationship,
    });
  }, { isolationLevel: "RepeatableRead" });
}
const uncertain = (): MutationOutcome<never> => ({ status: "UNKNOWN", error: { code: "OPERATION_STATUS_UNKNOWN", message: "Chưa xác nhận được tin nhắn. Thử gửi lại cùng nội dung và key." }, retryWithSameKey: true });
export async function reconcileCompanionMessage(headers: Headers, rawId: string, input: unknown, key: string, deps: CompanionDependencies) {
  const id = companionId(rawId), payload = chatInput(input), { actor, row } = await requireGroup(headers, id, deps);
  assertCompanionCanSend(row);
  const outcome = await preflightIdempotentReplay<{ publicationId: string; messageId: string; sequence: string }>({ database: deps.database, actorId: actor.userId, operation: "trip-companions:send", key, input: { publicationId: id, ...payload } });
  if (outcome.status === "ABSENT") return uncertain();
  if (outcome.status === "SUCCESS") {
    const parsed = companionSendResultSchema.safeParse(outcome.data);
    if (!parsed.success || parsed.data.publicationId !== id) return uncertain();
  }
  return outcome;
}
