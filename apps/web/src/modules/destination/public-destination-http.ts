import type { Database } from "@KLTN/db";
import { apiSuccess } from "@/server/http/api-response";
import { handleApiError } from "@/server/http/error-handler";
import { noDestinationQuery } from "./destination-http";
import { getPublicDestination } from "./public-destination-service";

export async function publicDestinationResponse(request: Request, id: string, database: Pick<Database, "destination">) {
  let response: Response;
  try {
    noDestinationQuery(request);
    response = apiSuccess(await getPublicDestination(id, database));
  } catch (error) { response = handleApiError(error); }
  // A fresh read must observe a later hide; neither errors nor success are cached.
  response.headers.set("Cache-Control", "no-store");
  return response;
}
