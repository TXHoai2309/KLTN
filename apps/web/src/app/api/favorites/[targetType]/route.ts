import { removeFavoriteResponse } from "@/modules/favorite/favorite-http";
import { favoriteDependencies } from "@/modules/favorite/favorite-server";

// The URL remains /api/favorites/:favoriteId for the existing US-16 route.
// The folder parameter name matches the sibling US15-BE dynamic segment so
// Next's route tree can represent both one- and two-segment routes.
export async function DELETE(
  request: Request,
  context: { params: Promise<{ targetType: string }> },
) {
  const { targetType: favoriteId } = await context.params;
  return removeFavoriteResponse(request, favoriteId, favoriteDependencies);
}
