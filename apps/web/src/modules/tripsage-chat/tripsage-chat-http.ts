import type { LanguageModel } from "ai";
import { requireTraveler } from "../../server/auth/require-traveler";
import type { AuthorizationDependencies } from "../../server/authorization/guard";
import { apiFailure } from "../../server/http/api-response";
import { AppError } from "../../server/http/app-error";
import { readBoundedJsonBody } from "../../server/http/read-json-body";
import { createPlanningAdmission } from "../assistant-planning/planning-admission";
import { isTripsageChatEnabled } from "./tripsage-chat-flag";
import { enabledTripsageFeatures } from "./tripsage-features";
import type { PlacesSearch } from "./tripsage-places";
import type { WebLookup } from "./tripsage-web";
import type { LocalKnowledge, TripsagePlanningDeps, TripsageToolContext } from "./tripsage-chat-tools";
import type { MemoryService } from "../tripsage-memory/memory-service";
import { parseTripsageChatItinerary, parseTripsageChatJourney, parseTripsageChatMessages, parseTripsageChatTripInfo, streamTripsageChat, type TripsageChatTurnLimits } from "./tripsage-chat-service";

export type TripsageChatHttpDependencies = {
  authorization: AuthorizationDependencies;
  model: () => Promise<LanguageModel>;
  /** Destination reader and routing provider; resolved lazily so plain chat never depends on them. */
  planning?: () => TripsagePlanningDeps;
  /** Google Places search; resolved lazily. Absent means the tool reports unavailable. */
  places?: () => PlacesSearch;
  /** Firecrawl web search/scrape; resolved lazily. Absent means the web tools report unavailable. */
  web?: () => WebLookup;
  memory?: () => MemoryService;
  /** Reviewed local documents (Q&A retriever); resolved lazily. Absent means the knowledge tool reports unavailable. */
  knowledge?: () => LocalKnowledge;
  /** Test seam for the per-turn caps; production uses the defaults. */
  limits?: Partial<TripsageChatTurnLimits>;
  env?: Record<string, string | undefined>;
  admit?: ReturnType<typeof createPlanningAdmission>;
} & Pick<TripsageToolContext, "flights" | "hotels">;
const defaultAdmit = createPlanningAdmission();
const SAFETY_RELEASE_MS = 310_000;

const unavailablePlanning: TripsagePlanningDeps = {
  candidates: async () => { throw new AppError("PLANNING_UNAVAILABLE", "Dữ liệu điểm đến chưa sẵn sàng.", 503); },
  routes: { route: async () => { throw new AppError("PLANNING_UNAVAILABLE", "Dịch vụ định tuyến chưa sẵn sàng.", 503); } },
};
const noStore = (response: Response) => { response.headers.set("Cache-Control", "private, no-store"); return response; };

/** Thin boundary: flag, auth, same-origin, bounded JSON, admission, then the service. */
export async function tripsageChatResponse(request: Request, deps: TripsageChatHttpDependencies): Promise<Response> {
  if (!isTripsageChatEnabled(deps.env)) return noStore(apiFailure("NOT_FOUND", "Không tìm thấy trang.", 404));
  const features = enabledTripsageFeatures(deps.env);
  try {
    const actor = await requireTraveler(request.headers, deps.authorization);
    if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") throw new AppError("FORBIDDEN", "Yêu cầu không được phép.", 403);
    if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") throw new AppError("INVALID_INPUT", "Yêu cầu phải là JSON.", 415);
    const invalid = new AppError("INVALID_INPUT", "Nội dung yêu cầu chưa hợp lệ.", 400);
    const body = await readBoundedJsonBody(request, { maxBytes: 128 * 1024, tooLargeError: invalid, emptyError: invalid, invalidJsonError: invalid });
    const { messages, latestUser } = parseTripsageChatMessages(body);
    const journey = parseTripsageChatJourney(body);
    const tripInfo = parseTripsageChatTripInfo(body);
    const currentItinerary = parseTripsageChatItinerary(body);
    // The slot is held until the stream settles, so the concurrency cap covers streaming time.
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const timer = setTimeout(release, SAFETY_RELEASE_MS); timer.unref?.();
    const response = await new Promise<Response>((resolve, reject) => {
      (deps.admit ?? defaultAdmit)(actor.userId, async () => {
        try {
          resolve(streamTripsageChat({
            model: await deps.model(), messages, journey, tripInfo, currentItinerary, features,
            planning: deps.planning?.() ?? unavailablePlanning, places: deps.places?.(), web: deps.web?.(), knowledge: deps.knowledge?.(),
            flights: deps.flights, hotels: deps.hotels, limits: deps.limits, signal: request.signal, onSettled: release,
            memory: features.has("memory") ? { actor, source: latestUser, resolve: deps.memory } : undefined,
          }));
        }
        catch (error) { reject(error); release(); }
        await held;
      }).catch(reject).finally(() => clearTimeout(timer));
    });
    return noStore(response);
  } catch (error) {
    if (error instanceof AppError) {
      const response = noStore(apiFailure(error.code, error.message, error.status));
      const wait = (error.details as { retryAfterSeconds?: unknown } | undefined)?.retryAfterSeconds;
      if (error.status === 429 && typeof wait === "number" && Number.isInteger(wait) && wait >= 1) response.headers.set("Retry-After", String(wait));
      return response;
    }
    return noStore(apiFailure("PLANNING_UNAVAILABLE", "Trợ lý lập hành trình tạm thời không khả dụng. Hãy giữ nội dung và thử lại.", 503));
  }
}
