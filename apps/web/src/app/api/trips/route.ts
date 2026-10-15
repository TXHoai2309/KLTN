import { saveTripResponse } from "@/modules/trip-save/trip-save-http";
import { tripSaveDependencies } from "@/modules/trip-save/trip-save-server";

export async function POST(request: Request) {
  return saveTripResponse(request, tripSaveDependencies);
}
