# US-28 delivery and offline verification — 2026-10-13

PREFLIGHT_STATUS: PASS. Clean TXH before work; origin fetched before implementation.
BASELINE_HEAD: `8b5ff486267fd66fd6a8418005d8b02b13b49d8c`.
REMOTE_STATUS: origin/TXH matched baseline at preflight; no push/deploy.
WORKTREE_SAFETY: No reset/clean/branch promotion, no Map Pin Picker worktree touched. Selective staging only.
HEADER_TEST_STATUS: Header unchanged. Obsolete Culture navigation assertion aligned with Owner's intentional removal; Culture remains functional.

US28_ACCEPTANCE_CRITERIA_SOURCE: `MISSING_OFFICIAL_US28_AC`. Product/flow/US24–27 plus Owner's two attached implementation requests and screenshot. See [US-28 story](../stories/US-28-trip-planner.md).
US28_SCOPE: Preliminary proposals, deterministic constraints, server routing adapter, authenticated API and interactive UI.
US28_OUT_OF_SCOPE: Official confirmation/save, Trip CRUD/persistence, in-trip tracking, complex optimization, new schema, live provider/corpus certification.

PLANNER_CONTRACT: Strict shared Zod, requirement snapshot, relative/calendar days, safe destination DTO, nullable clocks/metrics, verified vs missing bound route legs, server checks/warnings. Only PRELIMINARY_PROPOSAL responses.
CANDIDATE_RETRIEVAL: Canonical VISIBLE eligibility, bounded nested Prisma query, approved website media only; completion/replay rechecks parent revision and child hours/media snapshots. No hidden source or fabricated destination.
ROUTE_PROVIDER: Server Google Routes computeRoutes, CAR→DRIVE/MOTORCYCLE→TWO_WHEELER, duration/distance only; global 10s deadline, <=27 calls, <=3 concurrent, no automatic retry. Missing key/provider data becomes explicit missing travel; database failure is technical 503.
PLANNING_ENGINE: Stable interest/category heuristic plus proximity, pace caps, unique stops, bounded day scheduling, actual opening intervals, cross-day transfers. Haversine never estimates road travel.
CONSTRAINT_VALIDATION: Deterministic OPENING_HOURS, MINIMUM_DURATION, TRAVEL_TIME, SCHEDULE_CONFLICTS, MOBILITY. Missing evidence never PASS; violation takes precedence. Requested mobility cannot be certified without structured accessibility data.
PLANNER_API: `POST /api/trip-proposals`; persisted Traveler auth before body, Origin/content-type/body/key bounds, authoritative requirement gate, safe private/no-store envelopes. No writes. DB errors/timeouts remain technical; provider failures retain explicit route reasons.
FRONTEND_HANDOFF: Authoritative review snapshot → explicit generate CTA. Back/edit discards prior proposal, preserves draft and requires another check. Same-key retry, new-key regenerate, cancellation and stale-response fencing.
ITINERARY_UI: Summary chips, numbered timeline, day tabs, checks/disclosures, MapLibre marker selection/fit/pan, synchronized detail preview, safe actual detail links. Unknown/empty/photo/error states are explicit.
PRELIMINARY_POLICY: Proposed 08:00–18:00 window, pace 2/3/4 stops, <=28 total, <=64 candidates; nullable pace remains unchanged. These tunings require Owner calibration and do not prove exhaustive feasibility.
FINAL_CONFIRMATION_BOUNDARY: Indication requires all checks PASS and valid start date. No final action is implemented; future confirmation/save must reauthorize and revalidate fresh data.
PERSISTENCE_SCOPE: In-memory session and bounded process-local proposal coordination only. No invalid draft, health note or Trip written to DB/browser storage.

## Executed quality gates

| Gate | Evidence |
| --- | --- |
| FOCUSED_TESTS | 83 non-DB tests PASS: engine30, boundaries43, UI7, map3. Three PG tests skip in ordinary run and PASS separately. |
| US24_27_REGRESSION | 348 PASS. Combined final selection: 431 PASS, 3 PG SKIP. |
| CULTURE_REGRESSION | 37 PASS through legacy `test:culture`. |
| FULL_VITEST | Final 67 files PASS, 7 files SKIP; 1074 PASS, 0 FAIL, 71 SKIP. |
| LEGACY_REGRESSION | All 11 script groups exit0: 328 PASS, 0 FAIL, 0 SKIP. |
| POSTGRES_INTEGRATION | US28: 3/3 PASS on owned ephemeral loopback PostgreSQL, actual four relevant migrations, identity checked, cleanup PASS. No `.env`/DATABASE_URL target used. |
| TYPECHECK | `npm run check-types -- --force`: all four configured packages PASS, no cached result. |
| BUILD | `npm run build --workspace web`: PASS, including `/api/trip-proposals` and `/trips/new`. |
| LINT | No lint script/config in current repository; not reported PASS. Typecheck, tests and diff/secret checks used. |
| DIFF_CHECK | PASS before selective commit. |
| SECRET_SCAN | Scoped tracked/untracked delivery files scanned; no credential/private-key/connection-string findings. No environment file staged. |

First full-suite attempt had one existing Blob SDK test timeout under concurrent checks (1070 PASS/1 FAIL/71 SKIP). Subsequent full runs passed that unchanged test, final1074/0/71. No unrelated product code was changed to obtain green tests.

The 71 ordinary-run skips comprise existing QA/US19/content-profile PostgreSQL suites (68) plus US28 (3). US28's three were executed separately. The other 68 DB tests were not run and are not claimed PASS. Repository integration is distinct from live Better Auth/Traveler/Google/Neon acceptance.

## Browser evidence (deterministic component fixture)

FE_IMPLEMENTATION_STATUS: IMPLEMENTED_OFFLINE.
UI_REFERENCE_FIDELITY: Layout hierarchy, cards, chips, numbered timeline, selection and green/teal accents follow reference. Header untouched. Actual DB media replace empty placeholders when available. Terrain imagery/reference facts are not copied.
COMPONENTS_CREATED: TripPlannerFlow/Screen, TripSummaryBar, ItineraryDayTabs/StopCard/Map/ValidationPanel, ValidationBadge, TripOverviewCard, DestinationPreviewCard, PlannerActions, Loading/Empty/Error states.
TIMELINE_STATUS: Ordered day stops with nullable clocks, recorded visit duration and explicit inbound evidence.
MAP_INTEGRATION_STATUS: Real MapLibre/worker, numbered DB-coordinate markers, fit, zoom, selection pan, disposal and loading/error retry. Offline fixture uses an empty local style to avoid external calls.
ROUTE_RENDERING_STATUS: Owner approved MapLibre markers with Google metrics outside map; Google geometry is neither requested nor drawn. No guessed line/fake map mode.
SELECTION_SYNC_STATUS: Browser verified timeline→marker→preview and marker→timeline→preview. ArrowRight switches/focuses the next day tab.
VALIDATION_UI_STATUS: Server statuses rendered; relative days and missing routes show insufficient evidence. Empty days have no invented route metrics. Technical error is a distinct alert with exact-request retry and focused heading.
RESPONSIVE_STATUS: Browser measured zero document overflow at360/390/768/1024/1440px. Mobile stacks timeline/map/preview, tabs scroll locally, controls remain accessible.
API_INTEGRATION_STATUS: Real production client/components/services in loopback fixture with synthetic repository/routes. Real authenticated Next endpoint builds; live account/runtime/corpus not tested.
SCREENSHOT_COMPARISON: Local ignored artifacts `.cache/us28-ui/planner-1440.jpg`, `planner-390.jpg`; synthetic TEST banner and missing photos make fixture evidence explicit. Structural comparison only, not live tourism/provider quality.
TEST_RESULTS: Browser exercised form→server check→CTA→proposal; relative days; tabs; marker and card clicks; missing route; empty candidate; technical error→retry; back→edit duration→fresh confirmation→CTA without old proposal. Automated UI renders all-PASS calendar proposal, missing/empty states, escaping, auth/error/loading; map unit tests cover coordinates/click/pan/reduced motion/disposal.
KNOWN_GAPS: Native date-field entry did not persist through this browser automation adapter. Calendar scheduling and all-PASS rendering are covered deterministically; Owner must test the native date picker manually. No claim of complete screen-reader/real provider/terrain visual acceptance.
READY_FOR_OWNER_REVIEW: YES, with the live limitations below.

## Local manual test

1. Offline UI: run `node node_modules/tsx/dist/cli.mjs --tsconfig apps/web/tsconfig.json apps/web/scripts/trip-planner-fixture.mts`; open `http://127.0.0.1:3012/`. Fill duration/transport (optional companions/interests/pace), review/confirm, then generate. Fixture controls affect the next generate/retry; all data is synthetic TEST only.
2. Real local flow: first independently verify Development DB target, Traveler auth, actual VISIBLE destinations with coordinates/durations/opening intervals, restricted server `GOOGLE_ROUTES_API_KEY`, billing and provider policy prerequisites. Then `npm run dev --workspace web`, log in as Traveler and visit `http://localhost:3010/trips/new`. This delivery did not grant live calls/writes or alter runtime credentials.
3. Check calendar versus relative days, transport modes, missing data, back/edit/regenerate/retry, day/marker selection, narrow viewports and actual detail links. Inspect constraints before considering final confirmation. No official save CTA exists.

FILES_CHANGED: New trip-planner module/contracts/adapters/engine/validator/HTTP/runtime/tests/fixtures; `/api/trip-proposals`; typed client; planner components/CSS/UI tests; itinerary map renderer/tests; disposable test and browser fixture scripts; form/review handoff; Culture assertion; story/progress/this report. No environment, Header or layout change.
MIGRATIONS: NONE added/changed; four existing relevant migrations installed only in disposable test container.
DATABASE_WRITES: Product pipeline NONE. Synthetic integration rows/cleanup only in owned disposable container. Neon/Development/Production untouched.
LIVE_PROVIDER_CALLS: ZERO Google Routes/OpenAI/remote map tiles. No new live corpus acceptance evidence.
KNOWN_LIMITATIONS: Process-local TTL/idempotency/admission is not distributed exactly-once cost protection; underlying DB query may outlive caller deadline; bounded heuristic may omit better alternatives; origin/lodging/accessibility remain unknown; provider attribution/public terms/privacy and live behavior need review.
OWNER_DECISIONS_PENDING: Official AC; planning-window/pace/category heuristics; distributed cost-admission/idempotency before multi-instance exposure; provider policy/terms and live test permission. MapLibre/no-Google-polyline decision is already resolved.
LIVE_ACCEPTANCE_PENDING: Development identity, actual Traveler session/corpus/routes, quota/cost/latency, TWO_WHEELER regional behavior, native date picker, real media/style/a11y and Owner review.
US28_IMPLEMENTATION_STATUS: IMPLEMENTED_OFFLINE for preliminary scope; live/product acceptance pending.
US28_READY_FOR_MANUAL_TEST: YES offline fixture; CONDITIONAL real Traveler runtime after prerequisites above.
US28_ACCEPTED: NO.
COMMIT_SHA: Delivery commit recorded in final handoff; use `git log -1 -- docs/implementation/us28-planner-verification.md`.
PUSH_STATUS: NOT_PUSHED; no deployment.
