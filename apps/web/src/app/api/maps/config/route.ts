import { mapSettings } from "@/modules/runtime-config/runtime-config-service";
import { apiFailure, apiSuccess } from "@/server/http/api-response";

export async function GET() {
  const settings = await mapSettings().catch(() => null);
  const response = settings
    ? apiSuccess({ provider: settings.provider, googleMapId: settings.googleMapId })
    : apiFailure("MAP_CONFIG_UNAVAILABLE", "Chưa tải được cấu hình bản đồ.", 503);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
