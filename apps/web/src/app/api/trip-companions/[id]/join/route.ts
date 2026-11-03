import { companionJoinResponse } from "@/modules/trip-companions/companion-group-http";
import { tripReadDependencies } from "@/modules/trip-read/trip-read-server";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return companionJoinResponse(request, (await context.params).id, tripReadDependencies);
}
