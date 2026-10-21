import { tripDetailResponse } from "@/modules/trip-read/trip-read-http";
import { tripReadDependencies } from "@/modules/trip-read/trip-read-server";
import { tripManagementResponse } from "@/modules/trip-read/trip-management-http";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return tripDetailResponse(request, (await context.params).id, tripReadDependencies, new Date());
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  return tripManagementResponse(request, (await context.params).id, tripReadDependencies, new Date());
}
