import "server-only";
import { requireTraveler } from "../../server/auth/require-traveler";
import type { AuthorizationDependencies } from "../../server/authorization/guard";
import { apiFailure, apiMutationFailure, apiMutationResult, apiMutationUnknown, apiSuccess } from "../../server/http/api-response";
import { AppError } from "../../server/http/app-error";
import { requireIdempotencyKey } from "../../server/http/idempotency";
import { enabledTripsageFeatures } from "../tripsage-chat/tripsage-features";
import { memoryListSchema } from "./memory-contract";
import type { MemoryService } from "./memory-service";

type Dependencies = {
  authorization: AuthorizationDependencies;
  memory: () => MemoryService;
  env?: Record<string, string | undefined>;
  memoryEnabled?: () => Promise<boolean>;
};

export async function memoriesResponse(request: Request, deps: Dependencies, id?: string): Promise<Response> {
  const noStore = (response: Response) => {
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  };
  const deleting = request.method === "DELETE";
  const fail = deleting ? apiMutationFailure : apiFailure;
  let started = false;
  try {
    if (!(deps.memoryEnabled ? await deps.memoryEnabled() : enabledTripsageFeatures(deps.env).has("memory"))) {
      return noStore(apiFailure("NOT_FOUND", "Không tìm thấy trang.", 404));
    }
    const actor = await requireTraveler(request.headers, deps.authorization);
    if (!deleting) {
      const items = await deps.memory().list(actor);
      return noStore(apiSuccess(memoryListSchema.parse({ items })));
    }
    if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") {
      throw new AppError("FORBIDDEN", "Yêu cầu không được phép.", 403);
    }
    if (id !== undefined && !/^[\w-]{1,128}$/u.test(id)) throw new AppError("NOT_FOUND", "Không tìm thấy mục bộ nhớ.", 404);
    const key = requireIdempotencyKey(request);
    const memory = deps.memory();
    started = true;
    return noStore(apiMutationResult(await (id === undefined ? memory.deleteAll(actor, key) : memory.delete(actor, id, key))));
  } catch (error) {
    if (error instanceof AppError) return noStore(fail(error.code, error.message, error.status));
    if (started) return noStore(apiMutationUnknown());
    return noStore(fail("MEMORY_UNAVAILABLE", "Bộ nhớ chưa sẵn sàng. Vui lòng thử lại sau.", 503));
  }
}
