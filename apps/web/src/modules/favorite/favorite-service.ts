import type { Database, Prisma } from "@KLTN/db";
import { requireActor } from "../../server/authorization/guard";
import { AppError } from "../../server/http/app-error";
import { executeIdempotentWrite } from "../../server/http/idempotency";
import { isDestinationPublic } from "../destination/destination-eligibility";
import { isCulturePublic } from "../culture/culture-eligibility";
import type { FavoriteList } from "./favorite-contract";

export type FavoriteDependencies = {
  database: Database;
  resolveSession: (headers: Headers) => Promise<{user:{id:string}} | null>;
};
const favoriteSelect = {
  id: true,
  destination: { select: { id: true, name: true, visibility: true } },
  culture: { select: { id: true, title: true, visibility: true } },
} satisfies Prisma.FavoriteSelect;

export async function getFavorites(headers: Headers, deps: FavoriteDependencies): Promise<FavoriteList> {
  const actor = await requireActor(headers, deps, "traveler");
  // History intentionally includes hidden targets; never select their body/detail.
  const rows = await deps.database.favorite.findMany({
    where: { userId: actor.id }, select: favoriteSelect,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  });
  const data: FavoriteList = { destinations: [], cultureContents: [] };
  for (const row of rows) {
    if (row.destination) {
      const available = isDestinationPublic(row.destination);
      data.destinations.push({ favoriteId: row.id, targetId: row.destination.id, title: row.destination.name,
        availability: available ? "AVAILABLE" : "UNAVAILABLE", href: available ? `/destinations/${row.destination.id}` : null });
    } else if (row.culture) {
      const available = isCulturePublic(row.culture);
      data.cultureContents.push({ favoriteId: row.id, targetId: row.culture.id, title: row.culture.title,
        availability: available ? "AVAILABLE" : "UNAVAILABLE", href: available ? `/culture/${row.culture.id}` : null });
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
