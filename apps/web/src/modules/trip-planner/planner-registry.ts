import { AppError } from "@/server/http/app-error";
import type { routingRegistry } from "../destination/destination-routing-registry";
import type { createPlannerService } from "./planner-service";

/** Called behind plannerResponse's persisted authorization boundary, before any DB/provider work.
 * Keep configuration failure outside dbCall, which deliberately masks database exceptions.
 */
export function registeredPlannerPropose(
  registry: ReturnType<typeof routingRegistry>,
  propose: ReturnType<typeof createPlannerService>["propose"],
): ReturnType<typeof createPlannerService>["propose"] {
  return async (...args) => {
    if (!registry.verified) throw new AppError("PLANNER_NOT_CONFIGURED",
      "Nguồn dữ liệu lập lịch trình chưa được xác minh cho môi trường này. Vui lòng liên hệ quản trị viên.", 503);
    return propose(...args);
  };
}
