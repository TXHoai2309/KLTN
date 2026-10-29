import "server-only";
import { startInTripV2Session, type InTripSessionState } from "./in-trip-session";

/** Server-only composition seam, deliberately unused by production routes.
 * The caller supplies an explicit active Trip ID; no conversation inference. */
export async function startSavedTripAssistantV2(input: { tripId: string; headers: Headers; resume?: InTripSessionState }) {
  const [{ db }, { authorizationDependencies }, { requireTraveler }, { createOpenAiStructuredClient }, { getTravelRoute }, { retrievePlannerCandidates }] = await Promise.all([
    import("../../services"), import("../../server/authorization/server"), import("../../server/auth/require-traveler"),
    import("../preference-extraction/openai-structured-client"), import("../trip-validation/stadia-route"), import("../trip-planner/planner-candidates"),
  ]);
  const actor = await requireTraveler(input.headers, authorizationDependencies);
  return startInTripV2Session(input, { services: {
    userId: actor.userId, tripId: input.tripId, headers: input.headers, database: db,
    authorization: authorizationDependencies, llm: createOpenAiStructuredClient(),
    getRoute: getTravelRoute, now: () => new Date(),
  }, candidates: () => retrievePlannerCandidates(db) });
}
