import type { Database } from "@KLTN/db";
import { AppError } from "@/server/http/app-error";
import { executeIdempotentWrite } from "@/server/http/idempotency";
import { requireTraveler } from "@/server/auth/require-traveler";
import { publicHttpsUrl } from "../content-profile/content-profile-contract";
import { companionGroupMutationSchema } from "./companion-group-contract";
import { companionId, confirmed, groupInclude, groupUnavailable, lockCompanion, requireGroup } from "./companion-group-service";
import { companionMembersSchema } from "./companion-members-contract";
import type { CompanionDependencies } from "./companion-service";

const identity = (user: { id: string; name: string; image: string | null }) => ({ userId: user.id, displayName: user.name, avatarUrl: publicHttpsUrl.safeParse(user.image).success ? user.image : null });
export async function getCompanionMembers(headers: Headers, id: string, deps: CompanionDependencies) {
  return deps.database.$transaction(async tx => {
    const { row } = await requireGroup(headers, id, { ...deps, database: tx as Database });
    const host = await tx.user.findUniqueOrThrow({ where: { id: row.trip.userId }, select: { id: true, name: true, image: true } });
    const members = await tx.tripCompanionMembership.findMany({ where: { publicationId: row.id, state: "ACTIVE" },
      orderBy: [{ joinedAt: "asc" }, { userId: "asc" }], select: { joinedAt: true, user: { select: { id: true, name: true, image: true } } },
    });
    return companionMembersSchema.parse({ publicationId: row.id, host: identity(host), members: members.map(member => ({ ...identity(member.user), joinedAt: member.joinedAt.toISOString() })) });
  }, { isolationLevel: "RepeatableRead" });
}

export async function banCompanionMember(headers: Headers, rawId: string, rawTarget: string, input: unknown, key: string, deps: CompanionDependencies) {
  const id = companionId(rawId), targetId = companionId(rawTarget), payload = confirmed(input), actor = await requireTraveler(headers, deps);
  const current = await deps.database.tripCompanionPublication.findUnique({ where: { id }, include: groupInclude });
  if (!current || current.trip.userId !== actor.userId) throw groupUnavailable();
  return executeIdempotentWrite({ database: deps.database, actorId: actor.userId, operation: "trip-companions:ban", key, input: { publicationId: id, targetId, ...payload }, execute: async tx => {
    const row = await lockCompanion(tx, id, actor.userId, headers, deps);
    if (row.trip.userId !== actor.userId) throw groupUnavailable();
    if (targetId === row.trip.userId) throw new AppError("COMPANION_HOST_CANNOT_LEAVE", "Không thể loại chủ chuyến.", 409);
    const where = { publicationId_userId: { publicationId: id, userId: targetId } };
    const member = await tx.tripCompanionMembership.findUnique({ where });
    if (!member) throw new AppError("COMPANION_MEMBER_NOT_FOUND", "Không tìm thấy quan hệ thành viên.", 404);
    if (member.state !== "BANNED") await tx.tripCompanionMembership.update({ where, data: { state: "BANNED" } });
    return companionGroupMutationSchema.parse({ publicationId: id });
  } });
}
