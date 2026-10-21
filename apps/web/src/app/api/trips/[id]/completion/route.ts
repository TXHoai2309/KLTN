import { tripReadDependencies } from "@/modules/trip-read/trip-read-server";
import { tripManagementResponse } from "@/modules/trip-read/trip-management-http";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
 return tripManagementResponse(request, (await context.params).id, tripReadDependencies, new Date());
}
