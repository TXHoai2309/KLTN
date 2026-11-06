import { validateOriginResponse } from "@/modules/trip-origin/trip-origin-http";
import { authorizationDependencies } from "@/server/authorization/server";

export async function POST(request: Request) {
  return validateOriginResponse(request, authorizationDependencies);
}
