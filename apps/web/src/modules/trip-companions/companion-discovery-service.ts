import { createHash } from "node:crypto";
import type { Prisma } from "@KLTN/db";
import { z } from "zod";
import { requireTraveler } from "@/server/auth/require-traveler";
import { AppError } from "@/server/http/app-error";
import { visibleDestinationWhere } from "../destination/destination-eligibility";
import { vietnamDateOf } from "../trip-requirement/trip-requirement-readiness";
import { companionIdSchema, companionListQuerySchema, companionListSchema, type CompanionListQuery } from "./companion-contract";
import { companionPublicationSelect, companionTripSelect, companionRecruitmentStatus, projectCompanionIntroduction, type CompanionDependencies } from "./companion-service";

const cursorSchema = z.object({
  v: z.literal(1), startDate: z.iso.date(), publicationId: companionIdSchema,
  filterHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
const invalidQuery = () => new AppError("INVALID_COMPANION_QUERY", "Bộ lọc hoặc trang kết quả không hợp lệ. Hãy tải lại từ trang đầu.", 400);

function filtersHash(query: CompanionListQuery, actorId?: string, joined = false) {
  const { cursor: _cursor, ...filters } = query;
  return createHash("sha256").update(JSON.stringify({ filters, scope: actorId ? [joined ? "joined" : "mine", actorId] : ["public"] })).digest("hex");
}
function decodeCursor(value: string | undefined, filterHash: string) {
  if (!value) return null;
  try {
    const buffer = Buffer.from(value, "base64url");
    if (buffer.toString("base64url") !== value) throw invalidQuery();
    const cursor = cursorSchema.parse(JSON.parse(buffer.toString("utf8")));
    if (cursor.filterHash !== filterHash) throw invalidQuery();
    return cursor;
  } catch { throw invalidQuery(); }
}
// Prisma contains uses LIKE/ILIKE. Preserve a user's %, _ and backslash literally.
const literalSearch = (value: string) => value.replace(/[\\%_]/g, char => `\\${char}`);

async function readCollection(input: unknown, deps: CompanionDependencies, actorId?: string, joined = false) {
  const parsed = companionListQuerySchema.safeParse(input);
  if (!parsed.success) throw invalidQuery();
  const query = parsed.data, filterHash = filtersHash(query, actorId, joined);
  const anchor = decodeCursor(query.cursor, filterHash);
  const today = vietnamDateOf((deps.now ?? (() => new Date()))());
  const search = literalSearch(query.q);
  const where = {
    trip: {
      ...(!joined && actorId ? { userId: actorId } : {}),
      ...(!actorId ? { manuallyCompletedAt: null } : {}),
      startDate: {
        ...(!actorId ? { gt: new Date(today) } : {}),
        ...(query.departureFrom ? { gte: new Date(query.departureFrom) } : {}),
        ...(query.departureTo ? { lte: new Date(query.departureTo) } : {}),
      },
      ...(query.transport ? { transport: query.transport } : {}),
    },
    ...(joined ? { AND: [{ OR: [{ trip: { userId: actorId } }, { memberships: { some: { userId: actorId, state: "ACTIVE" as const } } }] }] } : {}),
    ...(!actorId ? { visibility: "PUBLIC" as const, canceledAt: null } : {}),
    ...(query.availableOnly ? { additionalCapacity: { gt: 0 } } : {}),
    ...(search ? { OR: [
      { title: { contains: search, mode: "insensitive" as const } },
      { trip: { days: { some: { visits: { some: { destination: {
        ...visibleDestinationWhere, name: { contains: search, mode: "insensitive" as const },
      } } } } } } },
    ] } : {}),
  } satisfies Prisma.TripCompanionPublicationWhereInput;
  const after: Prisma.TripCompanionPublicationWhereInput | null = anchor ? { OR: [
    { trip: { startDate: { gt: new Date(anchor.startDate) } } },
    { trip: { startDate: new Date(anchor.startDate) }, id: { gt: anchor.publicationId } },
  ] } : null;

  // One snapshot also covers relation queries: count and projected page agree even
  // when eligibility/media change concurrently. No persistent cross-request snapshot.
  return deps.database.$transaction(async tx => {
    const eligible = query.availableOnly ? await tx.$queryRaw<{ id: string }[]>`
      SELECT p.id FROM trip_companion_publication p
      WHERE p."additionalCapacity" > (SELECT count(*) FROM trip_companion_membership m WHERE m."publicationId" = p.id AND m.state = 'ACTIVE')` : null;
    const filtered = eligible ? { ...where, id: { in: eligible.map(row => row.id) } } : where;
    const pageWhere = after ? { AND: [filtered, after] } : filtered;
    const total = await tx.tripCompanionPublication.count({ where: filtered });
    const rows = await tx.tripCompanionPublication.findMany({
      where: pageWhere, orderBy: [{ trip: { startDate: "asc" } }, { id: "asc" }],
      take: query.limit + 1,
      select: { ...companionPublicationSelect, trip: { select: companionTripSelect } },
    });
    const page = rows.slice(0, query.limit), last = page.at(-1);
    const nextCursor = rows.length > query.limit && last ? Buffer.from(JSON.stringify({
      v: 1, startDate: last.trip.startDate.toISOString().slice(0, 10), publicationId: last.id, filterHash,
    })).toString("base64url") : null;
    return companionListSchema.parse({
      items: page.map(row => ({ publicationId: row.id, introduction: projectCompanionIntroduction(row.trip, row, false, row._count.memberships), recruitmentStatus: companionRecruitmentStatus(row, row._count.memberships, (deps.now ?? (() => new Date()))()) })),
      total, nextCursor,
    });
  }, { isolationLevel: "RepeatableRead" });
}

export async function listPublicCompanions(input: unknown, deps: CompanionDependencies) {
  return readCollection(input, deps);
}
export async function listMyCompanionPublications(headers: Headers, input: unknown, deps: CompanionDependencies) {
  const actor = await requireTraveler(headers, deps);
  return readCollection(input, deps, actor.userId);
}
export async function listJoinedCompanions(headers: Headers, input: unknown, deps: CompanionDependencies) {
  const actor = await requireTraveler(headers, deps);
  return readCollection(input, deps, actor.userId, true);
}
