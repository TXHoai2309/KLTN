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

Owner explicitly chose on 2026-10-13: keep MapLibre markers from DB; show Google Routes metrics outside the map; do not render Google Routes geometry on MapLibre. No fake straight-line route or map mode is offered.

Server adapter uses [computeRoutes](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes) with CAR→DRIVE, MOTORCYCLE→TWO_WHEELER, TRAFFIC_UNAWARE and fields `routes.duration,routes.distanceMeters`. No geometry requested. Google time is a road-network estimate, not current traffic/weather/road safety. No automatic retry/cross-request provider cache. One 10s deadline for all required routing, at most 27 calls/three concurrent. Missing key, mode/route failure, malformed output or deadline expiry become explicit missing travel data. DB failure remains technical.

[Routes policies](https://developers.google.com/maps/documentation/routes/policies) require attribution and applicable public terms/privacy. Google metrics are attributed in the text UI; live provider/attribution/legal acceptance and account/billing availability need Owner review before live use. No live Google/OpenAI calls are part of automated tests.

## Retry and resource boundary

No existing durable Trip/proposal model is used. A bounded process-local coordinator isolates by trusted principal/key, hashes the canonical request, single-flights identical retries, rejects changed payload, retains active results for 120s, rechecks selected destination snapshots on replay/completion, caps 64 records/three active producers/four new attempts per principal per minute. Failures release entries for exact-key retry. No DB writes or persistent health-note storage.

This is NOT distributed exactly-once billing or cross-instance abuse protection. Process restart/instance routing/TTL expiry can cause a repeated provider request. A durable distributed cost-admission/idempotency decision is a live-release limitation; no migration or inappropriate long-lived invalid proposal storage was introduced to hide it.

## UI handoff and review

Owner runtime decision, 2026-10-13: the sole user entrypoint is the main Next.js application on `http://localhost:3010/trips/new`. Analyze/evaluate/check/proposal requests use same-origin APIs. Port3012 belongs only to an isolated internal developer fixture; it is not navigation, a separate user frontend or a production dependency. No additional dev simulation mode is required for this integration.

`/trips/new` retains US-24–27. Successful authoritative `/check` passes the exact normalized snapshot plus edited review draft into an in-memory Planner flow; an explicit CTA calls the typed API. Back unmounts/invalidate proposal and reopens review with edits preserved; any edit needs a fresh server check. Same-key retry and regenerate/new-key are distinct, single-flight, abortable and fenced against stale responses. No browser storage or automatic post-auth replay.

Production components render summary chips, actual day tabs, numbered selectable stop timeline, checks and warning disclosures, MapLibre markers with zoom/fit/pan, synchronized destination preview and real detail links. Metrics are nullable and sourced from server output. Missing photo/description/route/candidate and technical states are explicit. Keyboard day tabs, aria-live/focus handling, responsive 360px+ and existing Header are retained. No mockup facts are copied into production.

## Verification evidence

Executed results are recorded in [the verification report](../implementation/us28-planner-verification.md) and `docs/ai-progress.md`. Fixtures are explicitly TEST/synthetic and isolated from runtime; they are not corpus or live Hà Giang/provider acceptance evidence. US-28 is NOT ACCEPTED until Owner reviews official AC/policy tuning, the UI and live data/provider behavior.
