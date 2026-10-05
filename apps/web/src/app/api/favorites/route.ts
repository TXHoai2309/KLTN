import { favoritesResponse } from "@/modules/favorite/favorite-http";
import { favoriteDependencies } from "@/modules/favorite/favorite-server";
export async function GET(request: Request) { return favoritesResponse(request, favoriteDependencies); }
