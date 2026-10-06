import { apiSuccess, apiMutationResult } from "../../server/http/api-response";
import { AppError } from "../../server/http/app-error";
import { handleApiError, handleMutationApiError } from "../../server/http/error-handler";
import { requireIdempotencyKey } from "../../server/http/idempotency";
import { getFavorites, removeFavorite, type FavoriteDependencies } from "./favorite-service";

function privateResponse(response: Response) {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export async function favoritesResponse(request: Request, deps: FavoriteDependencies) {
  try {
    if (new URL(request.url).search) throw new AppError("INVALID_FAVORITE_QUERY", "Endpoint chỉ đọc yêu thích của tài khoản hiện tại.", 400);
    return privateResponse(apiSuccess(await getFavorites(request.headers, deps)));
  } catch (error) { return privateResponse(handleApiError(error)); }
}
export async function removeFavoriteResponse(request: Request, favoriteId: string, deps: FavoriteDependencies) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin) throw new AppError("INVALID_ORIGIN", "Yêu cầu không hợp lệ.", 403);
    if (new URL(request.url).search || (await request.text()).length) throw new AppError("INVALID_FAVORITE_INPUT", "Yêu cầu không hợp lệ.", 400);
    return privateResponse(apiMutationResult(await removeFavorite(request.headers, favoriteId, requireIdempotencyKey(request), deps)));
  } catch (error) { return privateResponse(handleMutationApiError(error)); }
}
