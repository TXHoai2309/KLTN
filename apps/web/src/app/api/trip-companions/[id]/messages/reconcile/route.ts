import { companionWriteResponse } from "@/modules/trip-companions/companion-group-http";
import { reconcileCompanionMessage } from "@/modules/trip-companions/companion-delta-service";
import { tripReadDependencies } from "@/modules/trip-read/trip-read-server";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return companionWriteResponse(request, (input, key) => reconcileCompanionMessage(request.headers, id, input, key, tripReadDependencies));
}
