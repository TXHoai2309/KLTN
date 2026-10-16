import { saveTripResponse } from "@/modules/trip-save/trip-save-http";
import { tripSaveDependencies } from "@/modules/trip-save/trip-save-server";
import { listTripsResponse } from "@/modules/trip-read/trip-read-http";
import { tripReadDependencies } from "@/modules/trip-read/trip-read-server";

export async function GET(request: Request) {
  return listTripsResponse(request, tripReadDependencies, new Date());
}

export async function POST(request: Request) {
  return saveTripResponse(request, tripSaveDependencies);
}
