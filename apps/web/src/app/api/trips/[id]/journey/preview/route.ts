import { journeyEditResponse } from "@/modules/trip-origin/journey-edit-http";
import { tripSaveDependencies } from "@/modules/trip-save/trip-save-server";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return journeyEditResponse(request, (await context.params).id, "PREVIEW", { ...tripSaveDependencies, now: () => new Date() });
}
