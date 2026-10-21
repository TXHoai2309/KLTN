import type { Database, Prisma } from "@KLTN/db";
import { requireActor } from "../../server/authorization/guard";
import { AppError } from "../../server/http/app-error";
import { executeIdempotentWrite } from "../../server/http/idempotency";
import { isDestinationPublic } from "../destination/destination-eligibility";
import { isCulturePublic } from "../culture/culture-eligibility";
import { destinationMediaWhere, isDestinationMediaUsable } from "../destination/destination-media-eligibility";
import type { FavoriteList } from "./favorite-contract";
import { effectiveTripStatus } from "../trip-read/trip-status";
import { vietnamDateOf } from "../trip-requirement/trip-requirement-readiness";

export type FavoriteDependencies = {
  database: Database;
  resolveSession: (headers: Headers) => Promise<{user:{id:string}} | null>;
};
const favoriteSelect = {
  id: true,
  destination: {
    select: {
      id: true,
      name: true,
      visibility: true,
      deletedAt: true,
      area: true,
      category: true,
      media: {
        where: destinationMediaWhere,
        take: 20,
        orderBy: [{ isCover: "desc" }, { position: "asc" }, { id: "asc" }],
        select: { url: true, alt: true, websiteRights: true, storageReference: true },
      },
    },
  },
  cultureContent: { select: { id: true, title: true, visibility: true } },
  trip: { select: { id: true, startDate: true, durationDays: true, transport: true, manuallyCompletedAt: true } },
} satisfies Prisma.FavoriteSelect;

export async function getFavorites(headers: Headers, deps: FavoriteDependencies, timeReference = new Date()): Promise<FavoriteList> {
  const actor = await requireActor(headers, deps, "traveler");
  // History intentionally includes hidden targets; never select their body/detail.
  const rows = await deps.database.favorite.findMany({
    // Trip references must still belong to this actor, even if legacy data is inconsistent.
    where: { userId: actor.id, OR: [{ targetType: { not: "TRIP" } }, { trip: { userId: actor.id } }] }, select: favoriteSelect,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  });
  const data: FavoriteList = { destinations: [], cultureContents: [], trips: [] };
  for (const row of rows) {
    if (row.destination) {
      const available = isDestinationPublic(row.destination);
      const mediaList = (row.destination as { media?: Array<{ url: string; alt: string; websiteRights: string; storageReference?: string | null }> }).media;
      const usable = mediaList ? mediaList.find(m => isDestinationMediaUsable(m, row.destination!.id)) : null;
      const image = usable ? { url: usable.url, alt: usable.alt } : null;
      data.destinations.push({
        favoriteId: row.id,
        targetId: row.destination.id,
        title: row.destination.name,
        availability: available ? "AVAILABLE" : "UNAVAILABLE",
        href: available ? `/destinations/${row.destination.id}` : null,
        image,
        area: (row.destination as { area?: string }).area,
        category: (row.destination as { category?: string }).category,
      });
    } else if (row.cultureContent) {
      const available = isCulturePublic(row.cultureContent);
      data.cultureContents.push({ favoriteId: row.id, targetId: row.cultureContent.id, title: row.cultureContent.title,
        availability: available ? "AVAILABLE" : "UNAVAILABLE", href: available ? `/culture/${row.cultureContent.id}` : null });
    } else if (row.trip) {
      const startDate = row.trip.startDate.toISOString().slice(0, 10);
      data.trips.push({
        favoriteId: row.id, targetId: row.trip.id, title: `Chuyến đi ${row.trip.durationDays} ngày`,
        availability: "AVAILABLE", href: `/trips/${row.trip.id}`,
        trip: { startDate, durationDays: row.trip.durationDays, transport: row.trip.transport,
          ...effectiveTripStatus(startDate, row.trip.durationDays, vietnamDateOf(timeReference), row.trip.manuallyCompletedAt) },
      });
    }
  }
  return data;
}

export async function removeFavorite(headers: Headers, favoriteId: string, key: string, deps: FavoriteDependencies) {
  const actor = await requireActor(headers, deps, "traveler");
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(favoriteId)) throw new AppError("NOT_FOUND", "Không tìm thấy dữ liệu được phép truy cập.", 404);
  return executeIdempotentWrite({
    database: deps.database, actorId: actor.id, operation: "favorite:remove", key, input: { favoriteId },
    execute: async tx => {
      const current = await requireActor(headers, { ...deps, database: tx as unknown as Database }, "traveler");
      const deleted = await tx.favorite.deleteMany({ where: { id: favoriteId, userId: current.id } });
      if (deleted.count !== 1) throw new AppError("NOT_FOUND", "Không tìm thấy dữ liệu được phép truy cập.", 404);
      return { favoriteId };
    },
  });
}
