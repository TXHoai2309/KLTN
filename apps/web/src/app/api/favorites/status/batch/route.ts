import { favoriteStatusesResponse } from "@/modules/favorites/favorites-http";
import { favoritesDependencies } from "@/modules/favorites/favorites-server";

export async function GET(request: Request) {
  return favoriteStatusesResponse(request, favoritesDependencies);
}
