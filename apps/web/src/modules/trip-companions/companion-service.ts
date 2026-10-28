import type { Database, Prisma } from "@KLTN/db";
import { requireTraveler } from "@/server/auth/require-traveler";
import type { AuthorizationDependencies } from "@/server/authorization/guard";
import { AppError } from "@/server/http/app-error";
import { executeIdempotentWrite } from "@/server/http/idempotency";
import { publicHttpsUrl } from "../content-profile/content-profile-contract";
import { isDestinationPublic, visibleDestinationWhere } from "../destination/destination-eligibility";
import { destinationMediaWhere, isDestinationMediaUsable } from "../destination/destination-media-eligibility";
import { effectiveTripStatus } from "../trip-read/trip-status";
import { vietnamDateOf } from "../trip-requirement/trip-requirement-readiness";
import {
  companionDraftSchema, companionFormContextSchema, companionIdSchema,
  companionIntroductionSchema, companionPreviewSchema, publicCompanionSchema,
  publishCompanionResultSchema, publishCompanionSchema,
  companionViewerContextSchema,
  type CompanionDraft, type PublishCompanionResult,
} from "./companion-contract";

export type CompanionDependencies = AuthorizationDependencies & {
  database: Database;
  now?: () => Date;
};
type Reader = Pick<Prisma.TransactionClient, "trip" | "tripCompanionPublication">;
const tripSelect = {
  startDate: true, durationDays: true, transport: true, manuallyCompletedAt: true,
  user: { select: { name: true, image: true } },
  days: { orderBy: { dayIndex: "asc" }, select: {
    visits: { where: { destination: visibleDestinationWhere }, orderBy: { order: "asc" }, select: {
      destination: { select: { id: true, name: true, visibility: true, deletedAt: true, media: {
        where: destinationMediaWhere,
        orderBy: [{ isCover: "desc" }, { position: "asc" }, { id: "asc" }],
        select: { id: true, url: true, alt: true, websiteRights: true, storageReference: true },
      } } },
    } },
  } },
} satisfies Prisma.TripSelect;
type TripRow = Prisma.TripGetPayload<{ select: typeof tripSelect }>;
const publicationSelect = {
  id: true, title: true, introduction: true, additionalCapacity: true, imageMediaId: true,
  visibility: true, recruitmentOpen: true,
  canceledAt: true,
  _count: { select: { memberships: { where: { state: "ACTIVE" } } } },
} satisfies Prisma.TripCompanionPublicationSelect;

function idOf(value: string) {
  const parsed = companionIdSchema.safeParse(value);
  if (!parsed.success) throw new AppError("INVALID_COMPANION_INPUT", "Mã chuyến không hợp lệ.", 400);
  return parsed.data;
}
function draftOf(input: unknown) {
  const parsed = companionDraftSchema.safeParse(input);
  if (!parsed.success) throw new AppError("INVALID_COMPANION_INPUT", "Thông tin công khai không hợp lệ.", 400);
  return parsed.data;
}
const notFound = () => new AppError("TRIP_NOT_FOUND", "Không tìm thấy chuyến đi.", 404);

function ensurePublishable(row: TripRow, now: Date) {
  const startDate = row.startDate.toISOString().slice(0, 10);
  if (startDate <= vietnamDateOf(now) || row.manuallyCompletedAt) {
    throw new AppError("TRIP_NOT_PUBLISHABLE", "Chỉ công khai chuyến chưa hoàn tất và chưa đến ngày khởi hành.", 409);
  }
}
async function ownedTrip(reader: Reader, tripId: string, userId: string) {
  const row = await reader.trip.findFirst({ where: { id: tripId, userId }, select: tripSelect });
  if (!row) throw notFound();
  return row;
}
function contextOf(row: TripRow) {
  const seen = new Set<string>();
  const routeSummary: { destinationId: string; name: string }[] = [];
  const imageOptions: { mediaId: string; url: string; alt: string }[] = [];
  for (const day of row.days) for (const { destination } of day.visits) {
    // Prisma can load relations in separate queries. Recheck the returned row too.
    if (!isDestinationPublic(destination)) continue;
    if (seen.has(destination.id)) continue;
    seen.add(destination.id);
    routeSummary.push({ destinationId: destination.id, name: destination.name });
    for (const media of destination.media) if (isDestinationMediaUsable(media, destination.id)) {
      imageOptions.push({ mediaId: media.id, url: media.url, alt: media.alt });
    }
  }
  const startDate = row.startDate.toISOString().slice(0, 10);
  return {
    trip: {
      host: { displayName: row.user.name, avatarUrl: publicHttpsUrl.safeParse(row.user.image).success ? row.user.image : null },
      startDate, endDate: effectiveTripStatus(startDate, row.durationDays, startDate, null).endDate,
      durationDays: row.durationDays, transport: row.transport, routeSummary,
    },
    imageOptions,
  };
}
function introductionOf(row: TripRow, draft: CompanionDraft, requireImage: boolean, activeMembers = 0) {
  const context = contextOf(row);
  const image = context.imageOptions.find(option => option.mediaId === draft.imageMediaId);
  if (requireImage && draft.imageMediaId && !image) {
    throw new AppError("COMPANION_IMAGE_UNAVAILABLE", "Hãy chọn ảnh công khai hiện có trong tuyến hoặc bỏ chọn ảnh.", 422);
  }
  return companionIntroductionSchema.parse({
    ...context.trip, title: draft.title, introduction: draft.introduction,
    additionalCapacity: draft.additionalCapacity,
    availablePlaces: Math.max(0, draft.additionalCapacity - activeMembers),
    image: image ? { url: image.url, alt: image.alt } : null,
  });
}

export async function getCompanionFormContext(headers: Headers, id: string, deps: CompanionDependencies) {
  const tripId = idOf(id), actor = await requireTraveler(headers, deps);
  const row = await ownedTrip(deps.database, tripId, actor.userId);
  ensurePublishable(row, (deps.now ?? (() => new Date()))());
  const publication = await deps.database.tripCompanionPublication.findUnique({ where: { tripId }, select: publicationSelect });
  return companionFormContextSchema.parse({
    ...contextOf(row),
    publication: publication ? {
      publicationId: publication.id,
      draft: { title: publication.title, introduction: publication.introduction,
        additionalCapacity: publication.additionalCapacity, imageMediaId: publication.imageMediaId },
    } : null,
  });
}

export async function previewCompanion(headers: Headers, id: string, input: unknown, deps: CompanionDependencies) {
  const tripId = idOf(id), draft = draftOf(input), actor = await requireTraveler(headers, deps);
  const row = await ownedTrip(deps.database, tripId, actor.userId);
  ensurePublishable(row, (deps.now ?? (() => new Date()))());
  return companionPreviewSchema.parse({ introduction: introductionOf(row, draft, true) });
}

export async function publishCompanion(headers: Headers, id: string, input: unknown, key: string, deps: CompanionDependencies) {
  const tripId = idOf(id), parsed = publishCompanionSchema.safeParse(input);
  if (!parsed.success) throw new AppError("INVALID_COMPANION_INPUT", "Cần xác nhận và thông tin công khai hợp lệ.", 400);
  const actor = await requireTraveler(headers, deps);
  return executeIdempotentWrite<PublishCompanionResult>({
    database: deps.database, actorId: actor.userId, operation: "trip-companions:publish",
    key, input: { tripId, ...parsed.data },
    execute: async tx => {
      // Keep persisted account eligibility stable through commit; no cached cookie role.
      await tx.$queryRaw`SELECT "id" FROM "user" WHERE "id" = ${actor.userId} FOR SHARE`;
      await requireTraveler(headers, { ...deps, database: tx as Database });
      // Serialize competing publications and existing Trip updates/deletes on the same row.
      await tx.$queryRaw`SELECT "id" FROM "trip" WHERE "id" = ${tripId} AND "userId" = ${actor.userId} FOR UPDATE`;
      const row = await ownedTrip(tx, tripId, actor.userId);
      // Evaluate the clock after waiting for locks, including Vietnam midnight rollover.
      ensurePublishable(row, (deps.now ?? (() => new Date()))());
      introductionOf(row, parsed.data, true);
      if (await tx.tripCompanionPublication.findUnique({ where: { tripId }, select: { id: true } })) {
        throw new AppError("COMPANION_ALREADY_PUBLISHED", "Chuyến này đã có bài công khai.", 409);
      }
      const publication = await tx.tripCompanionPublication.create({ data: {
        tripId, title: parsed.data.title, introduction: parsed.data.introduction,
        additionalCapacity: parsed.data.additionalCapacity, imageMediaId: parsed.data.imageMediaId,
      }, select: { id: true } });
      return publishCompanionResultSchema.parse({ publicationId: publication.id, tripId });
    },
  });
}

/** Public reader never authenticates into the private Trip DTO, even for an Admin. */
export async function getPublicCompanion(id: string, database: Pick<Database, "tripCompanionPublication">) {
  const row = await database.tripCompanionPublication.findUnique({
    where: { id: idOf(id) }, select: { ...publicationSelect, trip: { select: tripSelect } },
  });
  if (!row || row.visibility !== "PUBLIC" || row.canceledAt) throw new AppError("COMPANION_NOT_FOUND", "Không tìm thấy chuyến công khai.", 404);
  return publicCompanionSchema.parse({ publicationId: row.id, introduction: introductionOf(row.trip, row, false, row._count.memberships), recruitmentStatus: companionRecruitmentStatus(row, row._count.memberships, new Date()) });
}

/** No publication existence/owner identity disclosure to an unrelated principal. */
export async function getCompanionViewerContext(headers: Headers, id: string, deps: CompanionDependencies) {
  const publicationId = idOf(id), actor = await requireTraveler(headers, deps);
  const owned = await deps.database.tripCompanionPublication.findFirst({
    where: { id: publicationId, trip: { userId: actor.userId } },
    select: { tripId: true },
  });
  return companionViewerContextSchema.parse(owned
    ? { relationship: "HOST", tripId: owned.tripId }
    : { relationship: "VISITOR" });
}

// Server-only projection shared by detail and discovery; never use a private Trip DTO.
export { tripSelect as companionTripSelect, publicationSelect as companionPublicationSelect,
  introductionOf as projectCompanionIntroduction, contextOf as projectCompanionContext };

export function companionRecruitmentStatus(row: { visibility: string; recruitmentOpen: boolean; additionalCapacity: number; canceledAt: Date | null; trip: { startDate: Date; durationDays: number; manuallyCompletedAt: Date | null } }, count: number, now: Date) {
  if (row.canceledAt) return "CANCELED" as const;
  if (row.visibility === "WITHDRAWN") return "WITHDRAWN" as const;
  if (effectiveTripStatus(row.trip.startDate.toISOString().slice(0, 10), row.trip.durationDays, vietnamDateOf(now), row.trip.manuallyCompletedAt).status === "COMPLETED") return "COMPLETED" as const;
  if (row.trip.startDate.toISOString().slice(0, 10) <= vietnamDateOf(now)) return "DEPARTED" as const;
  if (!row.recruitmentOpen) return "CLOSED" as const;
  return count >= row.additionalCapacity ? "FULL" as const : "OPEN" as const;
}
