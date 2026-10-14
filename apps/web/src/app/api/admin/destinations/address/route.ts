import { requireActor } from "@/server/authorization/guard";
import { apiSuccess } from "@/server/http/api-response";
import { handleApiError } from "@/server/http/error-handler";
import { AppError } from "@/server/http/app-error";
import { destinationDependencies } from "@/modules/destination/destination-server";
import { privateDestinationResponse } from "@/modules/destination/destination-http";
import { addressKitAdapter } from "@/modules/destination/addresskit";
export async function GET(request: Request) {
  try {
    await requireActor(request.headers, destinationDependencies, "admin");
    const query = new URL(request.url).searchParams;
    if (
      [...query.keys()].some((k) => k !== "q") ||
      query.getAll("q").length > 1 ||
      (query.get("q")?.length ?? 0) > 200
    )
      throw new AppError(
        "INVALID_ADDRESS_QUERY",
        "Truy vấn xã/phường không hợp lệ.",
        400,
      );
    return privateDestinationResponse(
      apiSuccess(await addressKitAdapter.search(query.get("q") ?? "")),
    );
  } catch (error) {
    return privateDestinationResponse(handleApiError(error));
  }
}
