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
