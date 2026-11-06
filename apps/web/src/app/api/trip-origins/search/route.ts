import { originSearchResponse } from "@/modules/trip-origin/origin-search-http";
import { originSearchDependencies } from "@/modules/trip-origin/origin-search-server";

export async function POST(request: Request) {
  return originSearchResponse(request, originSearchDependencies);
}
