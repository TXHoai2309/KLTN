import { z } from "zod";
import { requireActor } from "@/server/authorization/guard";
import { apiSuccess } from "@/server/http/api-response";
import { handleApiError } from "@/server/http/error-handler";
import { AppError } from "@/server/http/app-error";
import { destinationDependencies } from "@/modules/destination/destination-server";
import {
  destinationJson,
  privateDestinationResponse,
} from "@/modules/destination/destination-http";
import {
  admitMapsResolution,
  resolveMapsUrl,
} from "@/modules/destination/maps-url-resolver";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const actor = await requireActor(
      request.headers,
      destinationDependencies,
      "admin",
    );
    const parsed = z
      .object({ url: z.string().trim().min(1).max(2000) })
      .strict()
      .safeParse(await destinationJson(request));
    if (!parsed.success)
      throw new AppError(
        "INVALID_MAPS_URL",
        "Nhập URL Google Maps hợp lệ.",
        400,
      );
    admitMapsResolution(actor.id);
    return privateDestinationResponse(
      apiSuccess(await resolveMapsUrl(parsed.data.url)),
    );
  } catch (error) {
    return privateDestinationResponse(handleApiError(error));
  }
}
