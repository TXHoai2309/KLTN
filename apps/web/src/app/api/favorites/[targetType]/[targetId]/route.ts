import { addFavoriteResponse, removeFavoriteResponse } from "@/modules/favorites/favorites-http";
import { favoritesDependencies } from "@/modules/favorites/favorites-server";

export async function PUT(
  request: Request,
  context: { params: Promise<{ targetType: string; targetId: string }> },
) {
  return addFavoriteResponse(
    request,
    await context.params,
    favoritesDependencies,
  );
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ targetType: string; targetId: string }> },
) {
  return removeFavoriteResponse(
    request,
    await context.params,
    favoritesDependencies,
  );
}
