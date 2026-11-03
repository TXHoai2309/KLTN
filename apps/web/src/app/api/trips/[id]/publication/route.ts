import { companionPublicationResponse } from "@/modules/trip-companions/companion-http";
import { tripReadDependencies } from "@/modules/trip-read/trip-read-server";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return companionPublicationResponse(request, (await context.params).id, tripReadDependencies);
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return companionPublicationResponse(request, (await context.params).id, tripReadDependencies);
}
