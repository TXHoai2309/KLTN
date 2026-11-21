# TRIPSAGE-CHAT-ITINERARY-PORT — Replace the planning chat with the tripsage-ai chat/agent

## Status

The original rollout remains Proposed in ADR-36. Tickets 01-12 are implemented on `feat/tripsage-chat-itinerary-port` behind a flag. The two original migrations have been created and await deployment approval. On 2026-11-20 the owner approved the feature-group scope. P1–P5 are implemented behind flags. See [ADR-36](../decisions.md#adr-36--port-the-tripsage-ai-chatagent-to-replace-the-planning-chat-2026-11-14), the [Ticket 12 handoff](../research/tripsage-port-handoff.md) and the [feature group progress log](../implementation/tripsage-feature-groups-progress.md).

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
- Tool-loop agent with an explicit base allow-list for KLTN destination reads, `proposeItinerary` (output `PlanningSelection`), Google Places and web search/page retrieval. Routing remains part of itinerary validation.
- Owner-approved extension (2026-11-20) adds budget estimates, flight lookup, hotel lookup, long-term memory and ICS calendar export, each behind its own flag. P1 wires the initial flags and completes budget arithmetic, date validation and tool quotas. P2 uses Duffel for flights and Amadeus for hotels, superseding Q24c for Amadeus hotel lookup. Both tools only look up offers. Booking, payment and persistence of search results are out of scope. P3 adds result cards. P4 adds per-traveler memory.
- P5 adds an ICS download to saved trip detail pages behind `TRIPSAGE_FEATURE_CALENDAR`. The route uses the existing saved-trip read and companion permissions. It omits the trip origin and its coordinates, counts stops skipped for missing times and leaves the chat tool list and prompt unchanged. OAuth and external calendar APIs are out of scope.
- Google as routing/place provider through a routing adapter; Stadia stays the default until the Google adapter is enabled by config (Q12a, Q12b).
- Prisma migration for places outside the KLTN destination table (Q18b), applied to Development first.
- Vietnamese prompts, UI strings and output; destination names follow the database (Q10).
- Dependencies `ai`, `@ai-sdk/react`, `@ai-sdk/openai`, wrapped by a custom provider so the OpenAI key still comes from `effectiveConfig("OPENAI")` and byte/token limits and `store:false` are kept (Q11, Q15).
- Copy-then-adapt of tripsage files, keeping the MIT notice in a `NOTICE` file (Q12c).

## Out of Scope

- Booking and payment, including Stripe. `trip_collaborators` and tripsage Supabase/Redis/BYOK (Q9).
- Removing the old planning flow; Production migration; changing `/api/ai/planning` in place (it also serves in-trip, Q&A and reconcile).
- Editing the no-journey branch of `planning-engine.ts` (Q14a). Save remains blocked on any FAILED check.

## Business Rules

- AI proposes; the deterministic Constraint Validator decides. Missing validation data is never a pass.
- Web/Firecrawl content is untrusted data for the agent, never instructions (Q23). Agent output must pass the `PlanningSelection` schema and the Validator before display or save.
- Budget estimates and flight/hotel reference prices have no bearing on Validator outcomes or Save eligibility. Provider and memory content is untrusted data. Flight and hotel quota counts tool lookups, with at most two per group per turn. An Amadeus lookup uses at most two business GETs and one OAuth token POST.
- P4 retrieves memory only on demand. The server checks intent and filters sensitive data before storage or embedding. The traveler can view and delete their own preferences, constraints and explicitly requested notes. The server derives ownership from Better Auth on every request. Each traveler can retain up to 100 items.
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

- [x] Given the flag is off, when a Traveler plans a trip, then the existing flow behaves exactly as before. (Ticket 12: `/assistant/plan` is `notFound()`, `/trips/new` renders the unchanged form, `/api/ai/chat` is refused; `tripsage-chat-flag` and `tripsage-chat-http` tests, the source-reading tests and the production build pass. Verified by tests and code reading, not in a browser.)
- [ ] Given the flag is on, when a signed-in Traveler plans in chat, then progress and prose stream in Vietnamese and the itinerary renders from `PlannerResult`. (Left unticked: the stream, status parts, `data-itinerary` and component source/markup are tested at the HTTP/server-render seam with a fake model, but the page was never opened in a browser and no real OpenAI call was made.)
- [x] Given a schedule with any FAILED check, when the Traveler tries to save, then Save is refused. (Ticket 05: server returns TRIP_VALIDATION_FAILED, no Trip; the button is hidden for non-PASS schedules.)
- [x] Given a schedule with unchecked items and no FAILED check, when the Traveler saves, then an explicit confirmation naming the unchecked items is required and the saved Trip records them as unchecked, never as PASS. (Ticket 09, HTTP seam with an in-memory store; unchecked is allowed only for external-place data, see the design note; not run against a real database.)
- [x] Given web or Firecrawl content containing instructions, when the agent runs, then the content is treated as data and no tool outside the allow-list is called (tested). (Ticket 10: `tripsage-web.vitest.test.ts`, HTTP seam with a fake model and fake Firecrawl.)
- [ ] Given a place from Google not in the KLTN destination table, when the itinerary is saved, then `ItineraryVisit` references an `ExternalPlace` and the XOR constraint holds. (Ticket 09: Save creates the visit with `externalPlaceId` only, tested with an in-memory store; the XOR CHECK itself is verified only by the opt-in PostgreSQL tests, not run, migrations not applied. Left unticked.)
- [x] Given a Save returns UNKNOWN, when the Traveler retries, then the identical payload and key are sent and no duplicate Trip is created. (Ticket 05, tested at the HTTP seam with an in-memory store.)
- [x] Given a request exceeds 8 steps, 60 s or a provider call cap, when it runs, then it stops with a bounded, user-readable result. (Ticket 11: `tripsage-chat-resilience.vitest.test.ts`; step and time caps end with a Vietnamese notice naming the created itinerary, "not saved" and a next step; per-tool caps return a limit result.)
- [x] No server secret appears in the browser bundle, logs or API responses. (Ticket 11: seam tests with fake providers plus `console.*` spies and the client source-reading test; Ticket 12: the production build was scanned (no key names, endpoints or key-shaped strings in `.next/static`) and tool outputs are no longer streamed to the browser, only an `ok` flag; see Acceptance Evidence.)

## Test Plan

Record the failing-test baseline first. Then: unit tests for tool allow-list, adapters, untrusted-content handling and caps; contract tests for `PlanningSelection` and Save mapping; opt-in PostgreSQL migration and XOR constraint tests on Development; component tests for Vietnamese UI states; `npm run check-types`, build, scoped Vitest and `git diff --check`. Source-reading tests (`us25-fe-connect-source`, `us27-fe-nosubst-source`, `trip-theme`) must stay green: do not rename or delete `trip-requirement-form.tsx` and related files, wrap them with the flag instead.

## Expected Modules / Files

Per research section 9: swap points `app/trips/new/page.tsx:23` and `app/assistant/page.tsx:27-28`; keep `planning-engine.ts`, `planning-runtime.ts`, `planner-candidates.ts`, `planner-routes.ts`, `trip-save-service.ts`, `trip-save-adapter.ts`; add a new route and a chat module. Exact list to be finalized in the approved plan.

## Migration Impact

One Prisma migration for `ExternalPlace` and the `ItineraryVisit` reference (not `db:push`). Apply to Development first with owner authorization; Production not in this story.

## Environment Impact

New server-only variables for Google, web search and Firecrawl keys, blank in the tracked example. No real values committed. New dependencies `ai`, `@ai-sdk/react`, `@ai-sdk/openai` (version compatibility with the tripsage-pinned `ai@7.0.28` to be verified).

P1 adds three independent server-only switches, `TRIPSAGE_FEATURE_BUDGET`, `TRIPSAGE_FEATURE_FLIGHTS` and `TRIPSAGE_FEATURE_HOTELS`. Each defaults to false and is enabled only by the exact value `true` on the current request. An off group contributes no tool or prompt text. With all groups off, the existing prompt and five tools are preserved.

P2 reads optional server-only `DUFFEL_ACCESS_TOKEN` for flights and `AMADEUS_CLIENT_ID` / `AMADEUS_CLIENT_SECRET` for hotels. `AMADEUS_ENV` selects the fixed Amadeus host and defaults to `test`. Missing provider credentials only affect that provider's tool.

P4 reads `TRIPSAGE_FEATURE_MEMORY` server-side. It is off by default and requires the exact value `true`. It reuses the existing RAG embedding provider. Migration `20261121120000_traveler_memory` has been written and awaits owner deployment.

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

Ticket 12 (2026-11-14, branch `feat/tripsage-chat-itinerary-port`, nothing applied to any database, no real external API called):

- Security gap fixed (red first, then green): `tripsage-chat-stream-redaction.vitest.test.ts` at the chat route HTTP seam. The browser stream no longer contains web page text, snippets, injected text or tool result bodies (`tool-output-available` carries `{ok}` only; thrown tool errors become a fixed Vietnamese text). The UI still receives `data-sources` (domains), `data-places` (UNCHECKED suggestions), `data-itinerary` and the final text; the model still receives the full sanitized results.
- `tsc --noEmit` (apps/web) 0 errors; `tsc --noEmit` in packages/auth, db and ui 0 errors.
- Full Vitest: 4200 tests, 3908 passed, 59 failed, 232 skipped. 51 failures are exactly the baseline files and counts. The other 8 (`companion-discovery.vitest.test.ts`) are an order-dependent mock leak (`isolate:false`, `next/navigation` mock without `usePathname` registered by the unchanged `trips-view.vitest.test.ts`); it reproduces with only those two unchanged files and passes alone and in the directory run. Not caused by branch code, not fixed (would mean editing tests).
- `npm run test:legacy`: auth-ui, account and authorization pass; `test:destination` (1 fail, public destination screen markup) and `test:explore` (1 fail, Home/Explore controls) fail; culture, map, search, favorite, rag and idempotency pass. The branch changed no files on those paths; not checked against a clean baseline, so treat as probably pre-existing but unproven.
- Production build (`npm run build`, dummy loopback database URL so nothing connected) succeeded; `/assistant/plan` is a dynamic route. Client bundle scan: 0 hits for `GOOGLE_MAPS_API_KEY`, `FIRECRAWL_API_KEY`, `OPENAI_API_KEY`, `STADIA_MAPS_API_KEY`, `TRIPSAGE_CHAT_ENABLED`, `PLANNER_ROUTING_PROVIDER`, Firecrawl/Google endpoints, `sk-`/`AIza` strings. No `NEXT_PUBLIC_` added by the branch; `git diff --check 99000eb HEAD` clean; no real env file tracked (only `.env.example`/`.env.schema` templates with blank keys); no secret-shaped strings in the diff except test placeholders.
- Allow-list: tool registry is exactly the five tools (tested); no Amadeus, Stripe, Supabase or Redis in branch code. Changes to existing files are listed in the handoff note (planning-engine external candidate branch only used when the chat merges Google places, admission `retryAfterSeconds`, routes provider selector defaulting to Stadia, `QUESTION_BY_FIELD` exported, trip pages and planner presentation for external stops); `/api/ai/planning` route file and the `/trips/new` form are untouched.
- Old selector comparison (`assistant-trip-planning-evaluation.json`): the offline unit part (`planning-evaluation.vitest.test.ts`) runs in the full suite; the live comparison needs a real OpenAI key and an owner decision and was NOT run. No numbers are claimed.

Unticked criterion and why: flag-on chat in a real browser (above), and the `ExternalPlace` XOR CHECK, which only the opt-in PostgreSQL tests can prove and migrations were not applied.

### P6 feature-group acceptance (2026-11-21)

- [x] The 40-case `tripsage-feature-matrix.vitest.test.ts` proves the 32 combinations of the five switches, the original five tools and system prompt when disabled, exact-string matching through the Next.js Varlock loader, and changes between requests. Missing Duffel, Amadeus or OpenAI embedding credentials affect only the corresponding group.
- [x] Budget emits a validated estimate to the budget card. The tool and card tests include VND, USD, missing cap and over-budget results. No result bypasses the Constraint Validator.
- [x] Flights and hotels emit only their display data when a fake adapter returns offers. Adapter, stream-redaction and card tests cover available and unavailable cases, price and source labels, and credential redaction. Live Duffel and Amadeus lookups and provider terms remain pending.
- [x] Memory tests cover disabled GET, traveler-scoped list and deletes, model tools, safe failure without the embedding key and the UI disclosure that saved content is sent to OpenAI for embedding. The PostgreSQL test contains an account-deletion CASCADE assertion. Its execution and live embedding remain pending.
- [x] Calendar tests cover saved-trip permissions, a shared unauthorized/missing 404, UTF-8 folding and UTC conversion, no origin coordinates, safe download headers and the hidden link when disabled.
- [x] The Next dev fixture exercised the three chat cards, the memory disclosure, single deletion, delete-all and the empty state, and the saved-trip ICS control at 1280px and 360px. The 360px chat evidence comes from the browser DOM, keyboard and width checks. The mobile chat screenshot was blocked by the trip-info dialog.
- [x] The final full Vitest run found only the 51 recorded QA/in-trip failures. Two additional timeouts from the initial P6 run passed on the branch, on `09f5f19`, and on the final full run.
- [x] The offline production webpack build used fake credentials and a loopback DB URL. The 272-file client scan found none of the five server credential identifiers or their five fixture values.
- [ ] Run the authenticated chat and Save flow against approved Development providers and import a saved-trip ICS into Google Calendar, Apple Calendar and Outlook. Fixture checks are reported independently in the progress log.
- [ ] Apply the approved Development migrations and run the disposable PostgreSQL suites for external places, unchecked saves and memory CASCADE.
- [ ] Complete the old-selector live comparison, provider and data-handling review, and memory cutoff evaluation. [Owner handoff](../research/tripsage-port-handoff.md)

## Open Questions

- Resolved (owner, 2026-11-14): Q21'a. Unchecked items do not block Save but need explicit confirmation and are stored as unchecked; FAILED still blocks. This supersedes the earlier Q13 answer and changes the Save contract (new stored "unchecked" state on the Trip): the exact field and its migration must be designed and approved before coding.
- Resolved: Q22 (`ExternalPlace`, exactly one of `destinationId`/`externalPlaceId`) and Q23 (web content is untrusted data) accepted as drafted.
- Google Maps Platform terms on storing Places data, and Firecrawl/scraping terms: to be verified before the migration is finalized.
- Q25 step 1 only: the owner approved drafting; steps 2-4 not yet approved.

## Handoff Notes

Original decisions are in [the research note](../research/tripsage-itinerary-port.md). See the [progress log](../implementation/tripsage-feature-groups-progress.md) for the updated provider split, verification and remaining phases.

## Planning concierge follow-up (2026-11-21)

Owner design interview Q1–Q25 replaced the trip-info dialog with a guided conversation, day timeline, suggestion layer, cost table and access leg on `/assistant/plan`. Decision: [ADR-42](../decisions.md#adr-42--planning-concierge-on-assistantplan-2026-11-21). Spec: [tripsage-planning-concierge-spec.md](../specs/tripsage-planning-concierge-spec.md). Tickets: `.scratch/tripsage-planning-concierge/issues/01–04`, one commit per ticket.
