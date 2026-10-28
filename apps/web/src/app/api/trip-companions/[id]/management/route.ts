import { companionReadResponse, companionWriteResponse } from "@/modules/trip-companions/companion-group-http";
import { getCompanionManagement, updateCompanionManagement } from "@/modules/trip-companions/companion-management-service";
import { tripReadDependencies } from "@/modules/trip-read/trip-read-server";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return companionReadResponse(request, () => getCompanionManagement(request.headers, id, tripReadDependencies));
}
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return companionWriteResponse(request, (input, key) => updateCompanionManagement(request.headers, id, input, key, tripReadDependencies));
}
