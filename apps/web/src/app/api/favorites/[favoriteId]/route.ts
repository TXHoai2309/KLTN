import { removeFavoriteResponse } from "@/modules/favorite/favorite-http";
import { favoriteDependencies } from "@/modules/favorite/favorite-server";
export async function DELETE(request: Request, context: { params: Promise<{ favoriteId: string }> }) {
  const { favoriteId } = await context.params;
  return removeFavoriteResponse(request, favoriteId, favoriteDependencies);
}
