import { tripReadDependencies } from "@/modules/trip-read/trip-read-server";
import { tripPinResponse } from "@/modules/trip-read/trip-pin-http";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
 return tripPinResponse(request, (await context.params).id, tripReadDependencies);
}
