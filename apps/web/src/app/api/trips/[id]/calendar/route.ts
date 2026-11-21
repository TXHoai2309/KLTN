import { tripCalendarResponse } from "@/modules/trip-read/trip-read-http";
import { tripReadDependencies } from "@/modules/trip-read/trip-read-server";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return tripCalendarResponse(request, (await context.params).id, tripReadDependencies, new Date());
}
