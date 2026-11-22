import type { LanguageModel } from "ai";
import { requireTraveler } from "../../server/auth/require-traveler";
import type { AuthorizationDependencies } from "../../server/authorization/guard";
import { apiFailure, apiMutationResult } from "../../server/http/api-response";
import { AppError } from "../../server/http/app-error";
import { readBoundedJsonBody } from "../../server/http/read-json-body";
import { createPlanningAdmission } from "../assistant-planning/planning-admission";
import { isTripsageChatEnabled } from "./tripsage-chat-flag";
import { enabledTripsageFeatures } from "./tripsage-features";
import type { FuelPriceLookup } from "./tripsage-fuel-price";
import type { PlacesSearch } from "./tripsage-places";
import type { WebLookup } from "./tripsage-web";
import type { LocalKnowledge, OriginLookup, TripsagePlanningDeps, TripsageToolContext } from "./tripsage-chat-tools";
import type { MemoryService } from "../tripsage-memory/memory-service";
import type { ApplicationSettings } from "../runtime-config/runtime-config-contract";
import type { AssistantConversationStore } from "./assistant-conversation-store";
import { signOriginCandidates } from "./tripsage-chat-origin";
import { parseTripsageChatAccessLeg, parseTripsageChatConversationId, parseTripsageChatItinerary, parseTripsageChatJourney, parseTripsageChatMessages, parseTripsageChatOriginCandidates, parseTripsageChatPriorFlightLookups, parseTripsageChatPriorHotelLookups, parseTripsageChatTripInfo, streamTripsageChat, type TripsageChatTurnLimits } from "./tripsage-chat-service";

export type TripsageChatHttpDependencies = {
  authorization: AuthorizationDependencies;
  model: () => Promise<LanguageModel>;
  /** Destination reader and routing provider; resolved lazily so plain chat never depends on them. */
  planning?: () => TripsagePlanningDeps;
  /** Server-side origin search (Vietnam coverage checked); absent means unavailable except fixed hubs. */
  originSearch?: () => OriginLookup;
  /** Server secret for HMAC-signing origin candidates across turns. */
  originSecret?: () => string | undefined;
  /** Owner-scoped conversation store (ADR-43 §6); persists user/assistant turns when configured. */
  conversations?: () => AssistantConversationStore;
  /** Clock for testing origin candidate TTL; defaults to planning().now() or Date.now(). */
  now?: () => Date;
  /** Google Places search; resolved lazily. Absent means the tool reports unavailable. */
  places?: () => PlacesSearch;
  /** Retail petrol price for the cost estimate; absent means the fixed reference price. */
  fuelPrice?: () => FuelPriceLookup;
  /** Firecrawl web search/scrape; resolved lazily. Absent means the web tools report unavailable. */
  web?: () => WebLookup;
  memory?: () => MemoryService;
  /** Reviewed local documents (Q&A retriever); resolved lazily. Absent means the knowledge tool reports unavailable. */
  knowledge?: () => LocalKnowledge;
  /** Test seam for the per-turn caps; production uses the defaults. */
  limits?: Partial<TripsageChatTurnLimits>;
  env?: Record<string, string | undefined>;
  settings?: () => Promise<ApplicationSettings>;
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
  try {
    const settings = await deps.settings?.();
    if (!(settings?.chatEnabled ?? isTripsageChatEnabled(deps.env))) return noStore(apiFailure("NOT_FOUND", "Không tìm thấy trang.", 404));
    const features = enabledTripsageFeatures(deps.env, settings);
    const actor = await requireTraveler(request.headers, deps.authorization);
    if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") throw new AppError("FORBIDDEN", "Yêu cầu không được phép.", 403);
    if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") throw new AppError("INVALID_INPUT", "Yêu cầu phải là JSON.", 415);
    const invalid = new AppError("INVALID_INPUT", "Nội dung yêu cầu chưa hợp lệ.", 400);
    const body = await readBoundedJsonBody(request, { maxBytes: 128 * 1024, tooLargeError: invalid, emptyError: invalid, invalidJsonError: invalid });
    const { messages, latestUser } = parseTripsageChatMessages(body);
    const priorHotelLookups = parseTripsageChatPriorHotelLookups(body);
    const priorFlightLookups = parseTripsageChatPriorFlightLookups(body);
    const journey = parseTripsageChatJourney(body);
    const tripInfo = parseTripsageChatTripInfo(body);
    const currentItinerary = parseTripsageChatItinerary(body);
    const accessLeg = parseTripsageChatAccessLeg(body);
    const requestedConversationId = parseTripsageChatConversationId(body);
    const secret = deps.originSecret?.() ?? deps.env?.BETTER_AUTH_SECRET;
    const nowMs = (deps.now?.() ?? new Date()).getTime();
    const originCandidates = parseTripsageChatOriginCandidates(body, actor.userId, secret, nowMs);
    const conversationStore = deps.conversations?.();
    const clientMessageId = latestUser.messageId?.trim() || request.headers.get("Idempotency-Key")?.trim() || "";
    if (conversationStore && (!clientMessageId || clientMessageId.length > 180)) throw invalid;
    // The slot is held until the stream settles, so the concurrency cap covers streaming time.
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const timer = setTimeout(release, SAFETY_RELEASE_MS); timer.unref?.();
    const response = await new Promise<Response>((resolve, reject) => {
      (deps.admit ?? defaultAdmit)(actor.userId, async () => {
        try {
          let conversation: { conversationId: string; title: string } | undefined;
          if (conversationStore) {
            const savedUser = await conversationStore.recordUserMessage({
              userId: actor.userId,
              conversationId: requestedConversationId,
              clientMessageId,
              text: latestUser.text,
            });
            if (savedUser.status !== "SUCCESS") {
              release();
              resolve(apiMutationResult(savedUser));
              return;
            }
            conversation = { conversationId: savedUser.data.conversationId, title: savedUser.data.title };
          }
          const planningDeps = deps.planning?.() ?? unavailablePlanning;
          const planning = deps.now ? { ...planningDeps, now: deps.now } : planningDeps;
          const streamResponse = streamTripsageChat({
            model: await deps.model(), messages, journey, tripInfo, currentItinerary, accessLeg, features,
            originCandidates,
            signOriginCandidates: secret ? candidates => signOriginCandidates({ userId: actor.userId, candidates, secret, nowMs: (deps.now?.() ?? new Date()).getTime() }) : undefined,
            latestUserText: latestUser.text,
            conversation,
            onPersistAssistant: conversationStore && conversation
              ? (parts, trace) => conversationStore.recordAssistantMessage({
                  userId: actor.userId,
                  conversationId: conversation.conversationId,
                  clientMessageId: `${clientMessageId}:assistant`,
                  parts,
                  trace,
                })
              : undefined,
            planning, originSearch: deps.originSearch?.(), places: deps.places?.(), fuelPrice: deps.fuelPrice?.(), web: deps.web?.(), knowledge: deps.knowledge?.(),
            flights: deps.flights, hotels: deps.hotels, priorHotelLookups, priorFlightLookups, limits: deps.limits, signal: request.signal, onSettled: release,
            memory: features.has("memory") ? { actor, source: latestUser, resolve: deps.memory } : undefined,
          });
          if (conversation) streamResponse.headers.set("X-Assistant-Conversation-Id", conversation.conversationId);
          resolve(streamResponse);
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
