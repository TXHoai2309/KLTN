import { checkTripRequirementResponse } from "@/modules/trip-requirement/trip-requirement-check-http";
import { tripRequirementDependencies } from "@/modules/trip-requirement/trip-requirement-server";

export async function POST(request: Request) {
  return checkTripRequirementResponse(request, tripRequirementDependencies);
}
