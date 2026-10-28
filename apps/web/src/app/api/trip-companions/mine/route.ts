import { companionCollectionResponse } from "@/modules/trip-companions/companion-http";
import { tripReadDependencies } from "@/modules/trip-read/trip-read-server";

export async function GET(request: Request) {
  return companionCollectionResponse(request, tripReadDependencies, "mine");
}
