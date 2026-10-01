import { getHealthStatus } from "../../../modules/system/system.service";
import { apiSuccess } from "../../../server/http/api-response";
import { handleApiError } from "../../../server/http/error-handler";

export async function GET() {
  try {
    return apiSuccess(getHealthStatus());
  } catch (error) {
    return handleApiError(error);
  }
}
