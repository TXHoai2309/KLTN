import { evaluateTripRequirementResponse } from "@/modules/trip-requirement/trip-requirement-http";
import { tripRequirementDependencies } from "@/modules/trip-requirement/trip-requirement-server";

export async function POST(request: Request) {
  return evaluateTripRequirementResponse(request, tripRequirementDependencies);
}
