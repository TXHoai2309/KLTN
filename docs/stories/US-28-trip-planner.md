# US-28 — Preliminary Hà Giang Trip Planner

## Scope and acceptance sources

MISSING_OFFICIAL_US28_AC: no existing story/backlog export or Product/System DOCX was found. Implementation baseline is `docs/product/product-spec.md` (Trip requirements, deterministic constraints, separate save), `docs/flow/user-flow.md`, US-24–27 and the owner's two attached task requests on 2026-10-13. The supplied mockup is the visual reference. FE-US28-01–14 in that request are the current UI review checklist. No acceptance of the entire story is implied.

Baseline `8b5ff486267fd66fd6a8418005d8b02b13b49d8c`, TXH clean and equal to fetched origin/TXH. The prior US-23 work is already in this baseline; no branch/worktree reset or promotion is required. Owner intentionally removed `/culture` from Header; its obsolete navigation assertion is updated while Culture functionality tests remain.

## Delivery contract

New endpoint: `POST /api/trip-proposals`, Node.js, maximum platform duration 30s. No competing Planner/Save endpoint exists. Request JSON is exactly `{ requirement: TripRequirementInput }`, maximum 8KiB, with `Idempotency-Key` (8–128 URL-safe characters). Traveler/session/persisted-role authorization runs before body read; matching Origin and same-site request are required. The server calls `assertTripRequirementClear` again; client review confirmation is not authority.

Response is the existing `{ success, data }` envelope with `private, no-store`. Shared Zod `plannerResultSchema` includes a normalized requirement snapshot, correlation proposal ID, days/stops, nullable planned clocks, verified or missing inbound route metrics, deterministic checks, reasons and warnings. Every result has phase `PRELIMINARY_PROPOSAL`. Outcomes are `PROPOSAL_READY`, `INSUFFICIENT_DATA`, `NO_FEASIBLE_ITINERARY`; none means saved. Technical DB/query failures are 503 `PLANNER_UNAVAILABLE`; unclear requirements are 422; snapshot changes/key conflicts are 409; resource admission is 429. No provider exception/credential/private note is logged or returned.

`FINAL_CONFIRMATION` and `OFFICIAL_SAVE` remain separate future operations. `eligibleForFinalConfirmation` is a preliminary server indication only, requiring all checks PASS and `assertStartDateForFinalConfirmation`; a future confirmation/save must reauthorize, reload/revalidate and enforce write/idempotency semantics immediately before persistence. No Trip model, migration, durable invalid draft or save CTA is added.

## Deterministic policy (proposed tuning, pending owner calibration)

- Read at most 64 VISIBLE candidates in one nested projection. Use canonical eligibility, DB coordinates/durations/opening intervals, public descriptions and only APPROVED website media. Media author/source attribution remains available. Hidden/malformed coordinates/no usable duration are excluded; no generated destination, coordinate, hours or fallback minimum is created.
- A preliminary 08:00–18:00 planning window and pace caps RELAXED=2/MODERATE=3/PACKED=4 distribute at most 28 unique stops across 1–14 days. Null pace uses MODERATE for planning only and remains null in the requirement. These are explicit proposal preferences, not verified opening hours or approved SLA.
- Category keyword matching ranks interests; no canonical Destination category mapping exists. Nearest-neighbor Haversine/area proximity is only a selection/grouping heuristic, never driving time. No complex optimization or exhaustive feasibility claim.
- Dates use Asia/Ho_Chi_Minh. Null date means relative days and opening-hour verification INSUFFICIENT_DATA. Known CLOSED/unfit intervals are skipped; known OPEN intervals allow waiting. Missing duration is not substituted; when both exist the chosen visit is at least the recorded minimum.
- Route pairs connect consecutive selected stops, including next-day first stop from previous-day last. Each day starts at the first planned stop (or prior-day transfer origin) at the proposed window; origin/lodging travel is not represented by the current requirement and is disclosed. Overnight/starting-point acceptance is pending future input design.
- Missing travel makes dependent clocks null. A route too long for the window yields UNSCHEDULED and violation, never an out-of-window factual schedule. Four mandatory checks plus MOBILITY are server-derived PASS/VIOLATION/INSUFFICIENT_DATA. Accessibility/mobility flags or notes are recorded but cannot PASS without structured destination evidence, which is currently absent.

## Routing and map decision

**Current provider — owner-approved migration, 2026-10-18:** US-28 routing provider
migrated from Google Routes to Stadia Standard Routing. US-28, US-29B and US-30
share a consistent Stadia-based routing architecture. MapLibre remains the map
renderer. The 2026-10-13 Google metrics-only choice is historical and superseded;
its original verification remains in the dated implementation report.

`createStadiaRoutesProvider` delegates to `requestStadiaRoute` in the existing
server-only Stadia module. CAR → auto; MOTORCYCLE → motorcycle; one POST to
https://api.stadiamaps.com/route/v1 with a server Authorization header. Seconds
remain seconds; requested-kilometer distance is multiplied by 1000 without integer
rounding. Only finite, bounded duration AND distance verify a US-28 leg, whose
provider is STADIA_MAPS. No missing distance becomes zero or Haversine evidence.
US-29B/30 keep their existing duration-only success/unavailable contract through
`getTravelRoute`; the HTTP implementation and transport mapping are shared.

Keep one 10-second routing deadline, at most 27 directed pairs and three in flight,
no automatic retry/provider fallback/cross-request cache. Parent abort and local
timeout abort fetch and cancel its response reader. A 512 KiB body bound, strict
JSON parsing and safe reason codes handle provider faults. Missing routing remains
INSUFFICIENT_DATA, never PASS or proof of an impossible trip. Credentials, provider
responses and geometry do not enter the Planner DTO. Planner MapLibre stays markers
only; road-network estimates do not certify traffic, weather or road safety.

`STADIA_MAPS_API_KEY` is optional/sensitive runtime configuration, without Varlock's
interpolation-only `@internal`. No Google key is read by the new runtime. Trip
records never stored this provider discriminator; no historical Trip or migration
is changed. See [migration verification](../implementation/us28-stadia-routing-v2.md).

## Retry and resource boundary

No existing durable Trip/proposal model is used. A bounded process-local coordinator isolates by trusted principal/key, hashes the canonical request, single-flights identical retries, rejects changed payload, retains active results for 120s, rechecks selected destination snapshots on replay/completion, caps 64 records/three active producers/four new attempts per principal per minute. Failures release entries for exact-key retry. No DB writes or persistent health-note storage.

This is NOT distributed exactly-once billing or cross-instance abuse protection. Process restart/instance routing/TTL expiry can cause a repeated provider request. A durable distributed cost-admission/idempotency decision is a live-release limitation; no migration or inappropriate long-lived invalid proposal storage was introduced to hide it.

## UI handoff and review

Owner runtime decision, 2026-10-13: the sole user entrypoint is the main Next.js application on `http://localhost:3010/trips/new`. Analyze/evaluate/check/proposal requests use same-origin APIs. Port3012 belongs only to an isolated internal developer fixture; it is not navigation, a separate user frontend or a production dependency. No additional dev simulation mode is required for this integration.

`/trips/new` retains US-24–27. Successful authoritative `/check` passes the exact normalized snapshot plus edited review draft into an in-memory Planner flow; an explicit CTA calls the typed API. Back unmounts/invalidate proposal and reopens review with edits preserved; any edit needs a fresh server check. Same-key retry and regenerate/new-key are distinct, single-flight, abortable and fenced against stale responses. No browser storage or automatic post-auth replay.

Production components render summary chips, actual day tabs, numbered selectable stop timeline, checks and warning disclosures, MapLibre markers with zoom/fit/pan, synchronized destination preview and real detail links. Metrics are nullable and sourced from server output. Missing photo/description/route/candidate and technical states are explicit. Keyboard day tabs, aria-live/focus handling, responsive 360px+ and existing Header are retained. No mockup facts are copied into production.

## Verification evidence

Executed results are recorded in [the verification report](../implementation/us28-planner-verification.md) and `docs/ai-progress.md`. Fixtures are explicitly TEST/synthetic and isolated from runtime; they are not corpus or live Hà Giang/provider acceptance evidence. US-28 is NOT ACCEPTED until Owner reviews official AC/policy tuning, the UI and live data/provider behavior.

## Migration verification — 2026-10-18

Focused adapter/engine/validator/US29B/US30/UI/MapLibre/Varlock tests PASS; real
PostgreSQL repository 3/3 and RBAC ownership 8/8 PASS. Real Better Auth/Neon/Stadia
browser groups 6/6 PASS using owned synthetic business fixtures with coordinates
copied from two verified Destinations, all cleaned. Full Vitest 1992 PASS / 134
SKIP; legacy 335 PASS / 1 baseline Landing assertion FAIL. Typecheck and production
build PASS. Production release remains conditional on hostname registration,
existing candidate eligibility registry and broader release acceptance; no deploy,
Production data/env change or routing migration. PR #7 was externally merged into
master while this task ran, so it cannot remain an open Draft. No replacement PR
was created. See the migration report for all evidence and limits.

## Production registry verification — 2026-10-18

Independent Neon API and read-only PostgreSQL verified the Production endpoint.
The local TXH fix admits its separately reviewed registry, rejects unsupported
configuration explicitly, and distinguishes empty, incomplete, excluded and
invalid-coordinate candidate pools without an extra query. Actual Production
repository/engine/recheck now reads three public candidates, selects one with
duration, and truthfully returns INSUFFICIENT_DATA for unknown opening hours.
No business facts, eligibility checks, provider budgets or persistence changed.

Final focused 477 PASS / 11 SKIP, full Vitest2358 PASS / 134 SKIP, legacy336 PASS,
typecheck/build PASS. Real Preview Traveler/Admin form/check/proposal, live CAR
and MOTORCYCLE, regenerate and persisted-role controls pass; an additional
back/edit/recheck/locked-account/responsive run passes. Preview MapLibre remains
BLOCKED by actual tile401; the Production Guest control has tile200/three markers.
Both owned users and both owned TEST Destinations were cleaned from Development.
No Production writes, push, branch promotion or Production release. Code readiness
does not imply DATA_READY or full acceptance. See
[registry report](../implementation/us28-production-registry-fix.md).

## Merge build regression fix — 2026-10-19

Merge `b0a6dc1` reintroduced the obsolete inline `createStadiaRoutesProvider`
alongside the shared adapter, causing Turbopack's duplicate-definition error.
Removed that duplicate and retained delegation to `requestStadiaRoute`, including
the existing deadline, cancellation, response bounds and missing-data behavior.
Aligned the older CAR/MOTORCYCLE boundary assertion with this story's existing
unrounded duration contract (1800.5 seconds remains 1800.5).

Validation: Planner/Validator/Save Vitest suites 201 PASS, 3 PostgreSQL integration
tests SKIP (test database not configured); root `npm run check-types` PASS.
`npm run build` completed the Next.js production build and reported 1 successful
task; its idle Turbo wrapper then hung and was stopped (wrapper exit 1).
Production-mode build used a local placeholder database URL and disabled QA
runtime gates. `git diff --check` PASS. No schema/migration or
runtime environment change; no live provider/browser check, push or deployment.

## Owner-requested route coherence correction — 2026-10-25

The owner reported the current seven-stop proposal as an arbitrary-looking route
and requested a correction after repository diagnosis. This tunes the bounded
proposal heuristic; the business checks, provider boundary and release acceptance
status above remain unchanged.

- Compare geographic chains from every eligible starting candidate, within the
  existing 64-candidate / 28-stop limits. Score the complete selected chain with
  the existing proximity, category-interest and same-area preferences. Coordinate
  and name tie-breaks precede IDs. This replaces the ID-anchored single-start
  nearest-neighbor policy; it is not an exhaustive or road-optimal tour solver.
- Keep the selected chain in order when a visit must move to another day because
  its duration would exceed the planning window. Known calendar closures still
  control selection; unknown hours remain unknown.
- After routing, evaluate contiguous day partitions of the same directed chain.
  Prefer fewer unscheduled visits, then fewer empty days, balanced elapsed daily
  time (including verified inbound travel and opening-hour waiting), and geographic
  compactness on ties. Respect the existing pace caps and actual opening dates.
  Reuse exactly the same route evidence: no matrix, second routing pass, retry,
  added provider budget or Haversine-derived road metric.
- Missing route evidence retains the preliminary partition and nullable clocks;
  impossible transfers remain violations with their stops present. Final Validator,
  fresh Save validation, ownership and idempotency behavior are unchanged.
- There is still no user-specified origin, lodging or final endpoint. Clarify that
  the first stop is a geographic proposal and the corresponding external legs are
  unaccounted for. Public TEST records remain unchanged.

Verification: four targeted regressions failed before implementation. Final nine
coherence cases and the related Planner/Validator/Save/UI/marker suites: 247 PASS,
three opt-in PostgreSQL SKIP. The wider edit/in-trip selection: 744 PASS, five FAIL,
three SKIP, one TODO; all five failures also reproduce with the two changed runtime
files loaded from HEAD (41 PASS / five FAIL), without resetting the checkout.
Root typecheck and isolated-output production build pass. Public read-only replay
reproduces the new chain: Bắc Mê → Quản Bạ → Nhà Vương → Lũng Cú → Đồng Văn →
Mã Pí Lèng → Nho Quế. This replay uses public coordinates/suggested durations,
not live routing or private minimum-duration evidence. No database/schema,
credentials, provider, UI layout, commit, push or deployment change.

## Owner-requested road lines and whole-trip map — 2026-10-25

The owner explicitly requests road-shaped connections between numbered stops and
a map of all days. This supersedes this story's earlier markers-only/geometry-
excluded presentation decision. It does not change the routing provider, budgets,
business validation, Save or ownership rules.

- The existing routing result can supply an optional normalized `LineString` on
  a verified leg. Only finite longitude/latitude pairs are admitted, rounded to
  six decimals and bounded to 512 provider-derived points including endpoints.
  Raw polylines, private provider fields and credentials remain server-side.
- Metric-only older proposals still parse; missing/invalid shapes do not weaken
  metric checks or invent a line. Missing route evidence cannot carry geometry.
- The day map draws actual available leg shapes in green, including the previous
  day's endpoint/transfer as point 0 when applicable. The whole-trip scope shows
  every stop once with global numbers and a labeled day-color legend. Cross-day
  legs belong to the receiving day. A marker selection updates the existing
  timeline/day; refit restores all displayed stops and route bounds.
- Theme changes restore line layers without duplicating canvases. Hidden mobile
  map panels resize/refit on becoming visible. Missing shape, empty, loading,
  provider-map error and retry remain explicit; error retry is not covered by the
  floating destination preview. No route is fabricated between disconnected legs.

Verification and remaining baseline audit debt are recorded in
`docs/implementation/itinerary-route-map.md`. No database/schema, environment,
provider migration, commit, push or deployment change.
