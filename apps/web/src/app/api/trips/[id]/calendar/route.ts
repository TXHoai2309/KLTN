import { tripCalendarResponse } from "@/modules/trip-read/trip-read-http";
import { tripReadDependencies } from "@/modules/trip-read/trip-read-server";
import { applicationSettings } from "@/modules/runtime-config/runtime-config-service";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return tripCalendarResponse(request, (await context.params).id, tripReadDependencies, new Date(), async () => (await applicationSettings(tripReadDependencies.database)).calendar);
}
