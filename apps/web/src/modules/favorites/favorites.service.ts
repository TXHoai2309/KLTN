import type { Database, Prisma } from "@KLTN/db";

import { requireTraveler, type TravelerActor } from "@/server/auth/require-traveler";
import type { AuthorizationDependencies } from "@/server/authorization/guard";
import { AppError } from "@/server/http/app-error";
import { executeIdempotentWrite } from "@/server/http/idempotency";
import { visibleCultureWhere } from "../culture/culture-eligibility";
import { visibleDestinationWhere } from "../destination/destination-eligibility";
import {
  favoriteResultSchema,
  type FavoriteResult,
  type FavoriteTarget,
} from "./favorites.schema";

export type FavoritesDependencies = {
  database: Database;
  authorization: AuthorizationDependencies;
};

function authorizationForTransaction(
  dependencies: FavoritesDependencies,
  transaction: Prisma.TransactionClient,
): AuthorizationDependencies {
  return {
    ...dependencies.authorization,
    database: transaction as unknown as AuthorizationDependencies["database"],
  };
}

async function recheckTraveler(
  headers: Headers,
  actor: TravelerActor,
  dependencies: FavoritesDependencies,
  transaction: Prisma.TransactionClient,
): Promise<string> {
  const current = await requireTraveler(
    headers,
    authorizationForTransaction(dependencies, transaction),
  );
  if (current.userId !== actor.userId) {
    throw new AppError(
      "UNAUTHENTICATED",
      "Vui lòng đăng nhập để tiếp tục.",
      401,
    );
  }
  return current.userId;
}

async function assertPublicTarget(
  target: FavoriteTarget,
  transaction: Prisma.TransactionClient,
): Promise<void> {
  const exists =
    target.targetType === "destinations"
      ? await transaction.destination.findFirst({
          where: {
            id: target.targetId,
            ...visibleDestinationWhere,
          },
          select: { id: true },
        })
      : await transaction.cultureContent.findFirst({
          where: {
            id: target.targetId,
            ...visibleCultureWhere,
          },
          select: { id: true },
        });

  if (!exists) {
    throw new AppError(
      "FAVORITE_TARGET_UNAVAILABLE",
      "Đối tượng yêu thích không còn khả dụng.",
      404,
    );
  }
}

function favoriteWhere(
  userId: string,
  target: FavoriteTarget,
): Prisma.FavoriteWhereInput {
  return target.targetType === "destinations"
    ? {
        userId,
        targetType: "DESTINATION",
        destinationId: target.targetId,
      }
    : {
        userId,
        targetType: "CULTURE_CONTENT",
        cultureContentId: target.targetId,
      };
}

function favoriteCreateData(
  userId: string,
  target: FavoriteTarget,
): Prisma.FavoriteCreateManyInput {
  return target.targetType === "destinations"
    ? {
        userId,
        targetType: "DESTINATION",
        destinationId: target.targetId,
      }
    : {
        userId,
        targetType: "CULTURE_CONTENT",
        cultureContentId: target.targetId,
      };
}

function result(
  target: FavoriteTarget,
  isFavorite: boolean,
  changed: boolean,
): FavoriteResult {
  return favoriteResultSchema.parse({
    targetType: target.targetType,
    targetId: target.targetId,
    isFavorite,
    changed,
  });
}

export async function addFavorite(
  actor: TravelerActor,
  headers: Headers,
  target: FavoriteTarget,
  key: string,
  dependencies: FavoritesDependencies,
) {
  return executeIdempotentWrite<FavoriteResult>({
    database: dependencies.database,
    actorId: actor.userId,
    operation: "favorite:add",
    key,
    input: { targetType: target.targetType, targetId: target.targetId },
    execute: async (transaction) => {
      const userId = await recheckTraveler(
        headers,
        actor,
        dependencies,
        transaction,
      );
      await assertPublicTarget(target, transaction);

      const created = await transaction.favorite.createMany({
        data: favoriteCreateData(userId, target),
        skipDuplicates: true,
      });

      return result(target, true, created.count === 1);
    },
  });
}

export async function removeFavorite(
  actor: TravelerActor,
  headers: Headers,
  target: FavoriteTarget,
  key: string,
  dependencies: FavoritesDependencies,
) {
  return executeIdempotentWrite<FavoriteResult>({
    database: dependencies.database,
    actorId: actor.userId,
    operation: "favorite:remove",
    key,
    input: { targetType: target.targetType, targetId: target.targetId },
    execute: async (transaction) => {
      const userId = await recheckTraveler(
        headers,
        actor,
        dependencies,
        transaction,
      );
      const deleted = await transaction.favorite.deleteMany({
        where: favoriteWhere(userId, target),
      });

      return result(target, false, deleted.count === 1);
    },
  });
}

export async function getFavoriteStatus(
  userId: string,
  target: FavoriteTarget,
  dependencies: FavoritesDependencies,
): Promise<FavoriteResult> {
  const favorite = await dependencies.database.favorite.findFirst({
    where: favoriteWhere(userId, target),
    select: { id: true },
  });
  return result(target, Boolean(favorite), false);
}
