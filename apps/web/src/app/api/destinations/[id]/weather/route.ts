import { db } from "@/services";
import { destinationWeatherResponse } from "@/modules/trip-weather/destination-weather-http";

export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return destinationWeatherResponse(request, (await params).id, db);
}
