# US-29B — Stadia routing and travel-time check

> **Provider note (2026-10-23):** superseded by [ADR-19](../decisions.md) and [US-40](US-40-vietmap-provider-migration.md). The travel-time check, the six failure reasons, the fail-closed `INSUFFICIENT_DATA` rule, the 10-second limit and the "no profile substitution" rule remain in force; the provider is now VietMap Route v4 and `provider` is `VIETMAP`. Dated spike evidence below is historical and was not re-run.

## Status

IMPLEMENTED — routing boundary, pure check and optional map line are in place. End-to-end Trip integration and production deployment remain unproven.

## Epic

Trip planning / deterministic Constraint Validator.

## Goal / User Story

Là Du khách, tôi muốn biết thời gian giữa hai điểm dừng có đủ để di chuyển bằng xe máy hoặc ô tô, để không xác nhận lịch trình không khả thi.

## Source References

- `docs/product/product-spec.md` — deterministic validator, three outcomes, required route data and 10-second limit.
- `docs/flow/user-flow.md` — itinerary generation and validation.
- `docs/stories/US-29A-opening-hours-minimum-duration-validator.md` — existing check status and result shape.
- Current Task 2 instruction replaces the prior Google technology choice with MapLibre + Stadia; business outcomes remain unchanged.
- [Stadia Standard Routing](https://docs.stadiamaps.com/routing/standard-routing/), [profile guide](https://docs.stadiamaps.com/guides/getting-the-best-routes-with-valhalla-turn-by-turn-directions-apis/), [authentication](https://docs.stadiamaps.com/authentication), [vector styles](https://docs.stadiamaps.com/vector/).

## Dependencies / Current State

- `DestinationMap`, `maplibre-gl`, Stadia Alidade Smooth/Dark styles, public coordinate projection and next-themes integration already exist. Explore and Destination detail use the same map component and keep a non-map list/detail path.
- US-29A has two pure checks. The current branch has no persisted itinerary Visit, route service or route UI consumer.
- Destination has coordinates; only two records exist in the development DB during this spike. One is a manual test record with unverified location. A Lũng Cú source payload in `docs/implementation/` supplies the third coordinate for the spike only.

## In Scope

- Server-only Stadia standard route request: canonical `CAR` → `auto`, `MOTORCYCLE` → `motorcycle`; normalize duration, optional distance and geometry; never use a different profile on failure.
- Pure travel-time check comparing the local same-day gap between adjacent visits with a route-duration snapshot.
- Reuse and narrowly extend DestinationMap for style changes on the mounted map and optional normalized route geometry.
- Separate live spike, offline tests, environment contract and deployment authentication documentation.

## Out of Scope

Google Maps/Routes, route optimization, traffic profile, matrix routing, a browser routing request, itinerary persistence/UI, aggregate validator, schedule-conflict validator, Map UI redesign, geocoder, caching and multi-provider fallback.

## Business Rules

- `availableSeconds = (nextStartMinute - previousStartMinute - previousPlannedDurationMinutes) * 60` for two adjacent visits on the same local trip day.
- Available time greater than or equal to a finite provider `durationSeconds` returns `PASS`; less returns `VIOLATION`. Missing/invalid visit time, missing coordinates, timeout, non-2xx response, missing route or invalid provider data returns `INSUFFICIENT_DATA`, never `PASS`.
- A route response is a snapshot for that one comparison. The pure comparison never fetches or uses a machine clock. The ordinary Stadia `auto` and `motorcycle` profiles are used without implicit current-traffic reference time; changing to traffic-aware routing requires a later decision.

## Roles / Authorization / Ownership

No public route or Trip write endpoint in this task. The server-only routing function must not be imported by client components. A later itinerary service must enforce Traveler ownership and eligible destinations before invoking it.

## UX / UI Contract

Existing Explore/Destination detail map and list remain. Map tiles and routing have independent failure handling. Map container stays labeled and responsive; geometry is optional presentation data and never controls validator outcome.

## Data Contract

Input: validated coordinates, canonical vehicle and adjacent local same-day visit minutes. Provider output: `ok` with duration seconds plus optional distance/GeoJSON route line, or `unavailable`. Check output: US-29A style `status`, `affectedVisitId`, `reason`.

## API Contract

No new HTTP route. Server function makes one `POST https://api.stadiamaps.com/route/v1` request with `Authorization: Stadia-Auth …` in a server-only header. Provider JSON is not returned to the browser.

## Error / Recovery

Reject unsupported vehicle. Do not retry or substitute `auto` for `motorcycle`. Missing key, invalid coordinates, timeout, provider failure, malformed response and no route normalize to `unavailable` for the travel-time check.

## Write Semantics / Idempotency

N/A; no writes.

## External Services

Stadia routing key is `STADIA_MAPS_API_KEY` in server environment only. Browser vector tiles use domain authentication; localhost is supported without key. Production domain must be registered under Stadia Dashboard → Manage Properties → Authentication Configuration. Preview domains require explicit configuration rather than unrestricted auth.

## Acceptance Criteria

- [x] Current DestinationMap renders actual public coordinates and changes light/dark style on the mounted map; browser review at 360px found no horizontal overflow.
- [x] Stadia `auto` and `motorcycle` returned real routes for the spike inputs; evidence and dataset limits are recorded below.
- [x] Server mapping, normalization, timeout and unavailable behavior have offline tests; the routing key is server-only and absent from the diff.
- [x] Pure travel-time check passes greater/equal gaps, violates shorter gaps and marks missing route/data insufficient.
- [x] Requested test, typecheck, build, diff and manual map checks were attempted and are reported below.

## Test Plan

Vitest TDD for mapping, real HTTP request shape via fake fetch, route normalization/failure and pure comparison. Existing map `node:test` suite plus focused style/geometry tests. Full repository test, types, build, diff check and manual viewport/theme review.

## Expected Modules / Files

`apps/web/src/modules/trip-validation/` for server route and pure check; existing map module/component for small presentation changes; `apps/web/scripts/probe-stadia-routes.mjs`; environment schema/example; this story, decisions and progress.

## Migration Impact

None.

## Environment Impact

Configure `STADIA_MAPS_API_KEY` on the server for each runtime. No `NEXT_PUBLIC_` routing key.

## Implementation Sequence

1. Audit current map, theme, transport and validator contracts; run live Stadia spike before production routing work.
2. Write failing offline route and comparison tests; implement the smallest server boundary and pure check.
3. Add focused DestinationMap style/optional geometry tests and implementation.
4. Run verification, document live evidence and remaining limitations.

## Acceptance Evidence

2026-10-14 live spike: the development DB has two visible points: verified Cao nguyên đá Đồng Văn (23.192222, 105.196944) and an unverified US09 manual test record (23.164, 105.409). The checked-in Lũng Cú payload supplies (23.3634061, 105.3163001), not a production DB record. `node --env-file=apps/web/.env apps/web/scripts/probe-stadia-routes.mjs` sent three pairs × two profiles. All six returned HTTP 200, finite duration, distance and encoded geometry in approximately 113–298 ms across two runs. No key or raw provider payload was printed. This proves this key can route those coordinates at the observed time; it does not prove the unverified point's geographic accuracy or a production dataset of 30–50 destinations.

| Pair | Profile | Duration (s) | Distance (km) | Geometry | HTTP |
| --- | --- | ---: | ---: | --- | ---: |
| Cao nguyên đá Đồng Văn → US09 manual test | auto / motorcycle | 2204.273 / 2204.273 | 53.510 / 53.510 | yes / yes | 200 / 200 |
| US09 manual test → Cột cờ Quốc gia Lũng Cú | auto / motorcycle | 2227.675 / 2227.675 | 48.099 / 48.099 | yes / yes | 200 / 200 |
| Cột cờ Quốc gia Lũng Cú → Cao nguyên đá Đồng Văn | auto / motorcycle | 2419.873 / 2419.873 | 52.280 / 52.280 | yes / yes | 200 / 200 |

## Open Questions / Blockers

- No itinerary Visit/service or route-line consumer exists; end-to-end Trip confirmation remains a later story.
- Production domain registration and preview authentication have not been verified.
- The development dataset is too small to prove route coverage across the planned 30–50 destinations.
- Repository-wide checks still fail on unrelated missing declared web packages, generated Prisma members and RAG tests. US-29B-focused suites pass; a clean build is not proven.

## Verification — 2026-10-14

- `npm run env:generate` — PASS. No Prisma schema change or migration; `db:generate` is not required for this task.
- `node --env-file=apps/web/.env apps/web/scripts/probe-stadia-routes.mjs` — six real Stadia calls PASS as tabulated above. The script only reads visible Destination rows, with the checked-in Lũng Cú payload as a clearly labeled third coordinate.
- From `apps/web`: `npm exec -- vitest run --config vitest.config.mts src/modules/trip-validation/travel-time.vitest.test.ts src/modules/trip-validation/visit-constraints.vitest.test.ts` — 31/31 PASS; `npm exec -- tsx --test src/modules/map/map.test.tsx` — 25/25 PASS.
- Browser: `/explore?view=map` on local development server rendered Stadia tiles, two current public markers and fallback list. Switching dark → light changed map tiles. Viewports 360/390/768/1024/1440px reported document scroll widths 345/375/753/1009/1425px respectively, without horizontal overflow. No browser console or hydration error was observed. Browser network-level credential inspection was not available; source uses a keyless style URL and server-only routing header.
- `npm run test` — FAIL outside US-29B: 50 test files passed, 21 failed; 734 tests passed, 8 failed. Failures include RAG Blob tests and missing declared web packages. `npm run check-types` and `npm run build` — FAIL on pre-existing missing declared packages (`@tiptap/*`, `@prisma/adapter-pg`, `js-tiktoken`, `fast-xml-parser`, `pdfjs-dist`) and stale generated Prisma members. A targeted TypeScript diagnostic scan found no errors in changed map/trip-validation files, but project-wide type/build success is NOT PROVEN.
- `git diff --check` — PASS. No commit or push.

## Handoff Notes

No commit or push.

## Shared boundary update — 2026-10-18

US-28 now calls the same server-only HTTP implementation as US-29B/30. New
`requestStadiaRoute` exposes safe failure reasons and supports caller AbortSignal;
`getTravelRoute` retains the original ok/unavailable shape, unsupported-mode
rejection, optional distance and optional polyline6 GeoJSON. Distance converts
kilometers × 1000 without rounding. Fetch/body cancellation and bounded JSON
reading apply to all consumers. No new vehicle fallback, cache or retry.

Real Development browser verification exercised both profiles and fresh US-30
save/replay/read/ownership using isolated fixture users and synthetic visit data;
coordinates came from verified real Destination rows. This proves integration,
not the completeness of the live tourism corpus or Production hostname admission.
Earlier evidence/limitations above remain historical. See
[US-28 migration report](../implementation/us28-stadia-routing-v2.md).
