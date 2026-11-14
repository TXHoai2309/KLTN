# TRIPSAGE-CHAT-ITINERARY-PORT — Replace the planning chat with the tripsage-ai chat/agent

## Status

DRAFT — awaiting owner approval. No code, migration or dependency change is authorized by this document. See ADR-36 (Proposed) in [decisions.md](../decisions.md).

## Epic

AI trip planning

## Owner

Project owner (decisions recorded 2026-11-14 in [the research note](../research/tripsage-itinerary-port.md))

## Goal / User Story

As a signed-in Traveler, I want to plan a trip in a tripsage-style streaming chat so that the assistant can research places from Google and the web and propose an itinerary I can review and save.

## Outcome

The tripsage-ai chat block (chat UI, streaming route, tool-loop agent) is ported into `apps/web`, adapted to KLTN auth, Prisma, Vietnamese UI and the shared write contract, and replaces the current planning chat behind a feature flag. The old flow stays in code until the owner removes it.

## Source References

- Research: [tripsage-itinerary-port.md](../research/tripsage-itinerary-port.md) (conflict table, section 9 injection points)
- Source repository: `D:\Khoa_luan_tot_nghiep\tripsage_ai\tripsage-ai` (MIT; copyright line names Supabase, Inc.)
- ADR-35 (one assistant chat; guests are Q&A-only), ADR-36 (this port, Proposed)
- Product Document / System Specification sections: to be filled from `docs/product/product-spec.md` when the owner approves.

## Dependencies

- Baseline: record the list of currently failing Vitest tests before any code change (`docs/ai-progress.md`, 2026-11-04, notes the full suite is not green).
- Origin/journey migrations are applied to Development only; Production is out of scope.

## In Scope

- New streaming chat route and UI for signed-in Travelers, behind a feature flag; old `/trips/new` form and Assistant V2 remain.
- Tool-loop agent with an explicit allow-list: KLTN destination read, `proposeItinerary` (output `PlanningSelection`), routing, Google Places/Maps, web search, Firecrawl. Amadeus is **dropped** (Q24c).
- Google as routing/place provider through a routing adapter; Stadia stays the default until the Google adapter is enabled by config (Q12a, Q12b).
- Prisma migration for places outside the KLTN destination table (Q18b), applied to Development first.
- Vietnamese prompts, UI strings and output; destination names follow the database (Q10).
- Dependencies `ai`, `@ai-sdk/react`, `@ai-sdk/openai`, wrapped by a custom provider so the OpenAI key still comes from `effectiveConfig("OPENAI")` and byte/token limits and `store:false` are kept (Q11, Q15).
- Copy-then-adapt of tripsage files, keeping the MIT notice in a `NOTICE` file (Q12c).

## Out of Scope

- Amadeus flights/hotels; Stripe, long-term memory (pgvector), `trip_collaborators`, tripsage Supabase/Redis/BYOK (Q9).
- Removing the old planning flow; Production migration; changing `/api/ai/planning` in place (it also serves in-trip, Q&A and reconcile).
- Editing the no-journey branch of `planning-engine.ts` (Q14a). Save remains blocked on any FAILED check.

## Business Rules

- AI proposes; the deterministic Constraint Validator decides. Missing validation data is never a pass.
- Web/Firecrawl content is untrusted data for the agent, never instructions (Q23). Agent output must pass the `PlanningSelection` schema and the Validator before display or save.
- Saving (Q21'a, owner decision, supersedes Q13): a schedule with any FAILED check cannot be saved. A schedule whose checks are PASS or "unchecked" (data missing, for example opening hours of an external place) may be saved only after explicit user confirmation, and the saved Trip is labeled with which checks were unchecked. "Unchecked" is never reported or stored as PASS.
- Per turn: at most 8 steps and 60 s total, with caps on Places, Routes, search and Firecrawl calls (Q8, Q20).
- Only an owner-approved decision changes a locked invariant; each invariant changed here is listed in ADR-36.

## Roles / Authorization

Signed-in Traveler (and Admin through RBAC V2 for own resources). Guests stay Q&A-only per ADR-35. Authorization is enforced on the server.

## Ownership Rules

A Trip, its visits and any external place linked from them belong to the Trip owner. Chat sessions are scoped to the signed-in user. IDs in URLs are never authorization.

## UX / UI Contract

Vietnamese chat with streamed progress and prose only (Q9). Required states: loading/step progress, empty, error, unauthorized, unavailable (flag off, provider down), saving, UNKNOWN (retry with identical payload and key), success. Reuse KLTN `itinerary-map.tsx` and `planner-presentation.tsx` to render the itinerary rather than the tripsage timeline.

## Data Contract

- Agent input: KLTN `tripRequirementInputSchema` (transport MOTORCYCLE|CAR and `durationDays` 1-14 required; `interests` is a 7-value enum).
- Agent output: `PlanningSelection = {days: string[][]}` mapped through `scheduleSelection` to `plannerResultSchema`; a `data-itinerary` stream part carries the `PlannerResult` to the UI.
- Save: `TripSaveRequest` to `MutationOutcome` (SUCCESS / FAILED / UNKNOWN).
- New table (design, to be verified against `packages/database` Prisma schema before the migration is written): `ExternalPlace` with provider, providerPlaceId, name, coordinates, source, fetchedAt; `ItineraryVisit` references exactly one of `destinationId` or `externalPlaceId` (CHECK constraint). Store only `place_id` and minimal fields; refetch raw Places content when needed, pending verification of Google Maps Platform storage terms.

## API Contract

New stream route for chat; the JSON envelope, same-origin check and `Idempotency-Key` stay on the Save call, which is a separate JSON request. The stream has no idempotency and an interrupted stream is never treated as saved. The route calls `createPlanningAdmission` (8 requests/min, 3 concurrent). Existing `/api/ai/planning` is unchanged.

## Error / Recovery

Provider timeout, rate limit or missing key yields a Vietnamese unavailable state without leaking keys. Stream interruption keeps the last validated result; nothing is reported saved.

## Write Semantics / Idempotency

Save uses `executeIdempotentWrite` and the shared contract. Retry `UNKNOWN` with the identical payload and key. Do not report success before the database confirms it.

## External Services

OpenAI (existing), Google Places/Maps/Routes, web search, Firecrawl. All keys stay server-side: never `NEXT_PUBLIC_`, never in logs, responses or browser bundles. Stadia remains the default routing provider until the Google adapter is enabled.

## Acceptance Criteria

- [ ] Given the flag is off, when a Traveler plans a trip, then the existing flow behaves exactly as before.
- [ ] Given the flag is on, when a signed-in Traveler plans in chat, then progress and prose stream in Vietnamese and the itinerary renders from `PlannerResult`.
- [x] Given a schedule with any FAILED check, when the Traveler tries to save, then Save is refused. (Ticket 05: server returns TRIP_VALIDATION_FAILED, no Trip; the button is hidden for non-PASS schedules.)
- [x] Given a schedule with unchecked items and no FAILED check, when the Traveler saves, then an explicit confirmation naming the unchecked items is required and the saved Trip records them as unchecked, never as PASS. (Ticket 09, HTTP seam with an in-memory store; unchecked is allowed only for external-place data, see the design note; not run against a real database.)
- [x] Given web or Firecrawl content containing instructions, when the agent runs, then the content is treated as data and no tool outside the allow-list is called (tested). (Ticket 10: `tripsage-web.vitest.test.ts`, HTTP seam with a fake model and fake Firecrawl.)
- [ ] Given a place from Google not in the KLTN destination table, when the itinerary is saved, then `ItineraryVisit` references an `ExternalPlace` and the XOR constraint holds. (Ticket 09: Save creates the visit with `externalPlaceId` only, tested with an in-memory store; the XOR CHECK itself is verified only by the opt-in PostgreSQL tests, not run, migrations not applied. Left unticked.)
- [x] Given a Save returns UNKNOWN, when the Traveler retries, then the identical payload and key are sent and no duplicate Trip is created. (Ticket 05, tested at the HTTP seam with an in-memory store.)
- [x] Given a request exceeds 8 steps, 60 s or a provider call cap, when it runs, then it stops with a bounded, user-readable result. (Ticket 11: `tripsage-chat-resilience.vitest.test.ts`; step and time caps end with a Vietnamese notice naming the created itinerary, "not saved" and a next step; per-tool caps return a limit result.)
- [x] No server secret appears in the browser bundle, logs or API responses. (Ticket 11: seam tests with fake providers plus `console.*` spies and the client source-reading test; no production bundle was built or inspected, and tool outputs of web results are still streamed to the browser, see ai-progress.)

## Test Plan

Record the failing-test baseline first. Then: unit tests for tool allow-list, adapters, untrusted-content handling and caps; contract tests for `PlanningSelection` and Save mapping; opt-in PostgreSQL migration and XOR constraint tests on Development; component tests for Vietnamese UI states; `npm run check-types`, build, scoped Vitest and `git diff --check`. Source-reading tests (`us25-fe-connect-source`, `us27-fe-nosubst-source`, `trip-theme`) must stay green: do not rename or delete `trip-requirement-form.tsx` and related files, wrap them with the flag instead.

## Expected Modules / Files

Per research section 9: swap points `app/trips/new/page.tsx:23` and `app/assistant/page.tsx:27-28`; keep `planning-engine.ts`, `planning-runtime.ts`, `planner-candidates.ts`, `planner-routes.ts`, `trip-save-service.ts`, `trip-save-adapter.ts`; add a new route and a chat module. Exact list to be finalized in the approved plan.

## Migration Impact

One Prisma migration for `ExternalPlace` and the `ItineraryVisit` reference (not `db:push`). Apply to Development first with owner authorization; Production not in this story.

## Environment Impact

New server-only variables for Google, web search and Firecrawl keys, blank in the tracked example. No real values committed. New dependencies `ai`, `@ai-sdk/react`, `@ai-sdk/openai` (version compatibility with the tripsage-pinned `ai@7.0.28` to be verified).

## Implementation Sequence

1. Owner approves this story and ADR-36.
2. Record the failing-test baseline; apply the migration to Development.
3. Provider/adapter layer, allow-list, caps and tests.
4. New stream route and chat UI behind the flag.
5. Bridge to `scheduleSelection`, Validator and Save.
6. Ticket 08b (before 09): schedule external Google places through the scheduler and Validator with unchecked checks, Save still blocked. Implemented: owner chose a 60-minute suggested stay (single constant, labelled estimate); same-turn external ids only; Save stays blocked ([design](../research/external-place-scheduling-design.md), progress log).
7. Ticket 09: Save with explicit confirmation of unchecked items, `ExternalPlace` upsert and stored unchecked list ([design](../research/unchecked-save-design.md)); migrations created, not applied.
8. Evidence, progress note, owner review.

## Acceptance Evidence

N/A until implemented.

## Open Questions

- Resolved (owner, 2026-11-14): Q21'a. Unchecked items do not block Save but need explicit confirmation and are stored as unchecked; FAILED still blocks. This supersedes the earlier Q13 answer and changes the Save contract (new stored "unchecked" state on the Trip): the exact field and its migration must be designed and approved before coding.
- Resolved: Q22 (`ExternalPlace`, exactly one of `destinationId`/`externalPlaceId`) and Q23 (web content is untrusted data) accepted as drafted.
- Google Maps Platform terms on storing Places data, and Firecrawl/scraping terms: to be verified before the migration is finalized.
- Q25 step 1 only: the owner approved drafting; steps 2-4 not yet approved.

## Handoff Notes

Decisions are in [the research note](../research/tripsage-itinerary-port.md). Do not start coding until the owner approves.
