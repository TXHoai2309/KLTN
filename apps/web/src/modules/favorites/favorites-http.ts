import { apiMutationResult, apiSuccess } from "@/server/http/api-response";
import { handleApiError, handleMutationApiError } from "@/server/http/error-handler";
import { requireIdempotencyKey } from "@/server/http/idempotency";
import { requireTraveler } from "@/server/auth/require-traveler";

import {
  parseFavoriteTarget,
  parseFavoriteTargetQuery,
  type FavoriteTarget,
} from "./favorites.schema";
import {
  addFavorite,
  getFavoriteStatus,
  removeFavorite,
  type FavoritesDependencies,
} from "./favorites.service";

function privateResponse<T extends Response>(response: T): T {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

async function authorizeMutation(
  request: Request,
  rawTarget: unknown,
  dependencies: FavoritesDependencies,
): Promise<{ actor: { userId: string }; target: FavoriteTarget; key: string }> {
  // Auth is intentionally first: a Guest/Admin must not touch idempotency or
  // target persistence, even when the key or target is malformed.
  const actor = await requireTraveler(
    request.headers,
    dependencies.authorization,
  );
  const target = parseFavoriteTarget(rawTarget);
  const key = requireIdempotencyKey(request);
  return { actor, target, key };
}

export async function addFavoriteResponse(
  request: Request,
  rawTarget: unknown,
  dependencies: FavoritesDependencies,
) {
  try {
    const { actor, target, key } = await authorizeMutation(
      request,
      rawTarget,
      dependencies,
    );
    return privateResponse(
      apiMutationResult(
        await addFavorite(
          actor,
          request.headers,
          target,
          key,
          dependencies,
        ),
      ),
    );
  } catch (error) {
    return privateResponse(handleMutationApiError(error));
  }
}

export async function removeFavoriteResponse(
  request: Request,
  rawTarget: unknown,
  dependencies: FavoritesDependencies,
) {
  try {
    const { actor, target, key } = await authorizeMutation(
      request,
      rawTarget,
      dependencies,
    );
    return privateResponse(
      apiMutationResult(
        await removeFavorite(
          actor,
          request.headers,
          target,
          key,
          dependencies,
        ),
      ),
    );
  } catch (error) {
    return privateResponse(handleMutationApiError(error));
  }
}

export async function favoriteStatusResponse(
  request: Request,
  dependencies: FavoritesDependencies,
) {
  try {
    // Status is private too: authenticate before parsing/reading the target.
    const actor = await requireTraveler(
      request.headers,
      dependencies.authorization,
    );
    const target = parseFavoriteTargetQuery(request);
    return privateResponse(
      apiSuccess(await getFavoriteStatus(actor.userId, target, dependencies)),
    );
  } catch (error) {
    return privateResponse(handleApiError(error));
  }
}
