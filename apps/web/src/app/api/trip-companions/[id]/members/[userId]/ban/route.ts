import { companionWriteResponse } from "@/modules/trip-companions/companion-group-http";
import { banCompanionMember } from "@/modules/trip-companions/companion-members-service";
import { tripReadDependencies } from "@/modules/trip-read/trip-read-server";
export async function POST(request: Request, context: { params: Promise<{ id: string; userId: string }> }) {
  const { id, userId } = await context.params;
  return companionWriteResponse(request, (input, key) => banCompanionMember(request.headers, id, userId, input, key, tripReadDependencies));
}
