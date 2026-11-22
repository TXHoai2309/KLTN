# Ticket 08b: scheduling external (Google) places, design note

Status: IMPLEMENTED (Ticket 08b) with option A: a 60-minute suggested stay in `trip-planner/planner-external-stay.ts`, minimum stay null, labelled "ước tính"; same-turn external ids only; shared pace cap. Sections 1-3 are the design as built; section 4 is kept as the record of the decision. Actual blast radius: 11 production files + 1 new constant file.

## 1. Finding: the pivot is the destination id, so the change can stay small

The scheduler, route resolution, Validator and journey planner all key on a string `PlannerCandidate.id`; they read coordinates from the candidate, not from the database. `travelLegSchema.fromDestinationId/toDestinationId` are plain strings (1..128), so a prefixed id such as `ext:google:<placeId>` fits without changing the leg contract, and `RouteProvider.route(pair)` already routes by `pair.from/to` latitude/longitude (Stadia or Google). `coordinateRoute` is only needed for the origin legs, which are unchanged.

Proposed representation (expand only, backward compatible):

- An external place becomes a `PlannerCandidate` with `id = "ext:google:" + placeId`, `visibility = "EXTERNAL"`, `openingDays = []`, `minimumDurationMinutes = null`; name/lat/lng come from the CURRENT turn's `searchPlaces` result held server-side in the tool closure (never from model input, never written to the DB).
- `plannerDestinationSchema` gains an optional `external: z.literal(true)` (strict object; old data parses unchanged).
- `proposeItinerary` accepts an id only if it is a KLTN candidate id OR an `ext:google:` id that `searchPlaces` returned in the same turn (per-request registry; forged ids stay `INVALID_AI_PLAN`). Cross-turn ids are not accepted: the registry would have to be echoed back by the client, which is untrusted.
- Validator: for an external candidate, `INELIGIBLE_OR_DUPLICATE` (the VISIBLE test) becomes INSUFFICIENT_DATA `EXTERNAL_PLACE_UNVERIFIED` (SCHEDULE_CONFLICTS); opening hours and minimum duration already degrade to INSUFFICIENT_DATA (`OPENING_UNKNOWN`, `MINIMUM_UNKNOWN`) because the data is absent; travel time, clock conflicts and duplicates are computed as today (PASS/VIOLATION).
- Save stays blocked with no new code path: any INSUFFICIENT_DATA check makes `status != PROPOSAL_READY` and `eligibleForFinalConfirmation = false`, so `toSaveProposal`/`validateForSave` refuse it, and the `plannerResultSchema.superRefine` rule is untouched.
- UI: `planner-presentation`/`itinerary-map` show the Vietnamese label "ngoài danh mục (chưa kiểm)" for `destination.external`, plus the check list already shown for INSUFFICIENT_DATA.

## 2. Blast radius (measured, not guessed)

Readers of `fromDestinationId`/`toDestinationId`/`destination.id` in production code: about 55 files repo-wide, but most are saved-trip, edit, in-trip, companion and explore code that never receive a chat PlannerResult. Files that need a change for this design:

1. `trip-planner/planner-contract.ts` (optional `external` flag)
2. `trip-planner/planner-candidates.ts` (external candidate type/constructor)
3. `trip-planner/planner-engine.ts` (`visitDuration` for external, see section 4; copy `external` into the stop destination)
4. `trip-planner/planner-validator.ts` (external branch)
5. `assistant-planning/planning-engine.ts` (`isUsablePlanningCandidate` / `assertPlanningSelection` accept external ids; `scheduleSelection` signature unchanged; the no-journey branch at line 77 is untouched)
6. `tripsage-chat/tripsage-chat-tools.ts` (per-turn registry, merge into candidates, id allow-check)
7. `tripsage-chat/tripsage-places.ts` (return coordinates to the server registry only)
8. `tripsage-chat/tripsage-chat-service.ts` (hand the registry to the tools)
9. `components/trip-planner/planner-presentation.tsx` (label)
10. `components/trip-planner/itinerary-map.tsx` and `modules/map/itinerary-map-model.ts` (marker label)
11. `components/tripsage-chat/tripsage-itinerary-view.tsx` (wording, only if needed)

About 10-11 production files, below the 15-file stop threshold. Verified id-agnostic and unchanged: `planner-routes.ts`, `planner-order.ts`, `planner-day-balance.ts`, `journey-planner.ts`, `trip-save-*` (Save is blocked before it). Existing KLTN-only tests stay green because every change is guarded by the external flag or the `ext:` prefix.

Risks seen while reading: `selectPlannerDays`/`isDestinationEligibleForNewItinerary` (form path only) must not receive external candidates; `recheckPlannerCandidates` (DB re-read) must skip them; `generatePlanningProposal` is not used by the chat and would reject `ext:` ids, which is the safe default; coordinates reach the browser inside `data-itinerary` (needed for the map) but must stay out of the tool result sent to the model.

## 3. What does NOT need a product decision

- Day placement: the model proposes the day arrays exactly as for KLTN stops; the same pace cap (2/3/4 per day) and the 28-stop cap apply; no priority rule between KLTN and external stops is added.
- Opening hours: absent data already yields the existing "unknown hours" behaviour (scheduled inside the 08:00-18:00 planning window, check INSUFFICIENT_DATA).

## 4. Blocking decision (why implementation stopped)

The scheduler cannot place a stop without a stay duration (`visitDuration` returns null when both suggested and minimum durations are null, and such candidates are dropped). A Google place has none, and KLTN has no documented default stay duration in code, `docs/product`, `docs/architecture`, `docs/specs` or the story. The brief says not to invent product rules. Options:

- A. Fixed default for external stops, for example 60 minutes, stored only as the suggested duration (minimum stays null so MINIMUM_DURATION is INSUFFICIENT_DATA) and labelled as an estimate. One constant, smallest change. Recommended, but the number is the owner's to choose.
- B. The traveller states the stay per external place and `proposeItinerary` takes it as bounded input (15-240 minutes); with no value the server asks. No invented number, but more UI/prompt work, and the model could still invent one unless the gate requires it from the user.
- C. Exclude external places from time-boxed scheduling (list only). Contradicts the 08b goal.

Also worth confirming with A or B: same-turn-only acceptance of external ids (recommended) and a pace cap shared between KLTN and external stops.

## 5. Next step once A/B is chosen

TDD at the chat route seam: valid external id scheduled with INSUFFICIENT_DATA checks; forged id rejected; KLTN-only schedule unchanged; `toSaveProposal` still refuses; no PASS with missing data; coordinates absent from the model-visible tool result. Then the 10-11 file change above. Ticket 09 (Save with confirmation and stored "unchecked" state) remains separate.
