import { companionReadResponse } from "@/modules/trip-companions/companion-group-http";
import { getCompanionMembers } from "@/modules/trip-companions/companion-members-service";
import { tripReadDependencies } from "@/modules/trip-read/trip-read-server";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return companionReadResponse(request, () => getCompanionMembers(request.headers, id, tripReadDependencies));
}
