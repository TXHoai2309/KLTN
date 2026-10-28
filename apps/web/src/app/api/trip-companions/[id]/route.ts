import { publicCompanionResponse } from "@/modules/trip-companions/companion-http";
import { tripReadDependencies } from "@/modules/trip-read/trip-read-server";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return publicCompanionResponse(request, (await context.params).id, tripReadDependencies.database);
}
