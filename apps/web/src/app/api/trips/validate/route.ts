import { previewTripValidationResponse } from "@/modules/trip-save/trip-save-http";
import { createTripSaveDependencies } from "@/modules/trip-save/trip-save-server";

export async function POST(request: Request) {
  return previewTripValidationResponse(request, createTripSaveDependencies());
}
