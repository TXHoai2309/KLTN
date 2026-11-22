import { db } from "@/services";
import { authorizationDependencies } from "@/server/authorization/server";
import { tripWeatherResponse } from "@/modules/trip-weather/trip-weather-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return tripWeatherResponse(request, { authorization: authorizationDependencies, database: db });
}
