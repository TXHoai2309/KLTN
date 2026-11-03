import { companionGroupResponse } from "@/modules/trip-companions/companion-group-http";
import { tripReadDependencies } from "@/modules/trip-read/trip-read-server";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return companionGroupResponse(request, (await context.params).id, tripReadDependencies);
}
