import { companionWriteResponse } from "@/modules/trip-companions/companion-group-http";
import { leaveCompanion } from "@/modules/trip-companions/companion-group-service";
import { tripReadDependencies } from "@/modules/trip-read/trip-read-server";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return companionWriteResponse(request, (input, key) => leaveCompanion(request.headers, id, input, key, tripReadDependencies));
}
