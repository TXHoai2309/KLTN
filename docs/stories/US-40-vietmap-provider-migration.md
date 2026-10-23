# US-40 — VietMap replaces Stadia for map and routing

## Status

READY — scope, decisions and acceptance criteria confirmed by the owner on 2026-10-23. Implementation not started; no code, environment value or deployment was changed by this contract. See [migration plan](../implementation/vietmap-migration-plan.md) and [ADR-19](../decisions.md).

## Epic

Trip planning foundation — map provider and travel-time evidence

## Owner

Product owner (duybinh)

## Goal / User Story

As a traveler planning a Hà Giang trip, I want the map and travel times to come from a Vietnam-specific provider so that road labels, POI names and motorcycle travel estimates match the actual roads I will ride.

## Outcome

MapLibre GL renders VietMap vector tiles in light and dark themes, and every travel-time check across Planner, Save, Manual/AI edit and In-trip is served by one server-only VietMap Route v4 adapter behind the unchanged `getTravelRoute` contract. Stadia is removed: no code path, environment variable, style URL or script remains.

## Source References

- Product Specification: [Trip requirements and validation](../product/product-spec.md)
- Technical Architecture: [Map and routing boundary](../architecture/technical-architecture.md)
- Decisions: [ADR-19](../decisions.md) (supersedes [ADR-17](../decisions.md) and [ADR-18](../decisions.md))
- Repository contracts: [US-28](US-28-trip-planner.md), [US-29B](US-29B-stadia-routing-travel-time.md), [US-30](US-30-confirm-save-trip.md), [US-32](US-32-manual-itinerary-edit.md), [US-35](US-35-current-manual-location.md), [US-36](US-36-in-trip-replan.md), [US-37](US-37-in-trip-validate-confirm.md)
- UI reference: existing map frames only (Explore map, Destination detail, Admin pin picker, Itinerary map, In-trip picker). No layout change.
- VietMap sources: [Route v4](https://maps.vietmap.vn/docs/vi/map-api/route-version/route-v4/), [Tilemap](https://maps.vietmap.vn/docs/vi/map-api/tilemap/)

## Dependencies

- A VietMap account with a **tilemap key** (referer-restricted) and a separate **routing key** must exist before implementation starts. Without them no live evidence can be produced and every provider claim stays `NOT PROVEN`.
- Builds on the existing MapLibre renderer and the existing `RouteProvider` / `getTravelRoute` seams.

## In Scope

- Replace `stadiaStyles` with `vietmapStyles` (`tm` light, `dm` dark) and read the tile key from `NEXT_PUBLIC_VIETMAP_MAP_KEY`.
- Add explicit `© VIETMAP` attribution to every MapLibre mount.
- Add `modules/trip-validation/vietmap-route.ts` (Route v4 adapter) with the same public functions and result types as the removed Stadia module.
- Point `createVietmapRoutesProvider`, `planner-runtime`, the four trip Route Handlers and `trip-save-server` at the new adapter.
- Change the travel-leg `provider` value to the literal `VIETMAP`.
- Add the in-adapter circuit breaker for `OVER_DAILY_LIMIT`.
- Replace every Stadia string in UI, tests, fixtures, scripts and environment schema/example.
- Delete `stadia-route.ts`, `probe-stadia-routes.mjs` and the three `us28-*` Stadia harnesses; add `probe-vietmap-routes.mjs`.
- Update ADR-17/18 status, architecture, product spec, environment guide, story banners and `docs/ai-progress.md`.

## Out of Scope

- Replacing MapLibre with the VietMap Web SDK.
- Changing the planner algorithm, the 27-pair / three-in-flight / 10-second budget, the Validator, US-35/36/37 behaviour, or the idempotent write contract.
- Matrix, TSP, Autocomplete, Geocoding, Reverse Geocoding, Map Matching, traffic overlay or toll annotations.
- Prisma schema or migration changes (no route snapshot is persisted).
- Any deployment, Stadia account change, or removal of historical evidence documents.
- Automated browser E2E harness (owner chose a manual checklist for this story).

## Business Rules

- Missing, unavailable, timed-out or quota-blocked routing remains `INSUFFICIENT_DATA`, never `PASS`. AI never guesses travel time.
- `CAR → car`, `MOTORCYCLE → motorcycle`; no profile substitution on failure.
- `paths[0].time` is milliseconds and becomes `durationSeconds`; `paths[0].distance` is metres and stays `distanceMeters`; neither may be defaulted to zero.
- The routing key is server-only and never appears in a browser bundle, log line, error message or API response.
- The tile key is a publishable key restricted by referer; it is not a server secret.
- Route v4 has no real-time traffic guarantee, so UI copy must not claim traffic awareness.

## Roles / Authorization

N/A — no role, ownership or visibility rule changes. Existing Traveler/Admin checks in US-28/30/35/36/37 stay untouched.

## Ownership Rules

N/A — no new owned data.

## UX / UI Contract

- Map states unchanged: loading, ready, "Bản đồ chưa khả dụng" with retry, and the list fallback when the map provider is unavailable.
- Light and dark themes both render real VietMap tiles; exactly one canvas after a theme switch.
- Attribution `© VIETMAP` is visible in the compact attribution control at 360px without horizontal overflow.
- Travel-leg credit becomes `VietMap · Thời gian di chuyển ước tính` and appears only when at least one inbound leg has `provider === "VIETMAP"`.

## Data Contract

- `travelLegSchema.provider` becomes `z.literal("VIETMAP").nullable()`. All other fields, including the six failure reasons, are unchanged.
- `TravelRoute` keeps its shape; no new field is added.
- No database change.

## API Contract

- No new or removed endpoint. The four trip Route Handlers keep their request/response envelopes and auth-before-body ordering.
- Planner proposal responses now carry `provider: "VIETMAP"` on verified legs.

## Error / Recovery

| Condition | Reason | User effect |
| --- | --- | --- |
| Missing routing key | `NOT_CONFIGURED` | `INSUFFICIENT_DATA` |
| Unsupported vehicle | `UNSUPPORTED_MODE` | Existing 422 transport error |
| Abort/timeout (≤10s) | `TIMEOUT` | `INSUFFICIENT_DATA` |
| `code: ZERO_RESULTS` | `NO_ROUTE` | `INSUFFICIENT_DATA` |
| `code: OVER_DAILY_LIMIT` | `UNAVAILABLE` | `INSUFFICIENT_DATA`, breaker opens |
| `code: INVALID_REQUEST` / `MAX_POINTS_EXCEED` | `INVALID_RESPONSE` | `INSUFFICIENT_DATA` |
| `code: ERROR_UNKNOWN`, non-2xx, thrown fetch | `UNAVAILABLE` | `INSUFFICIENT_DATA` |
| Malformed JSON / oversized body / bad coordinate | `INVALID_RESPONSE` | `INSUFFICIENT_DATA` |

## Write Semantics / Idempotency

N/A — no write path changes. Trip save still fetches fresh routing and revalidates inside its existing transaction; the breaker never returns a cached route.

## External Services

- VietMap Route v4 `GET https://maps.vietmap.vn/api/route/v4` (server-only, key in query string, no logging of the URL).
- VietMap vector style `https://maps.vietmap.vn/maps/styles/{tm|dm}/style.json` (browser, publishable key, referer-restricted).
- Stadia Maps: removed.

## Acceptance Criteria

- [ ] Given both VietMap keys are configured, when any of the five map surfaces loads, then real VietMap tiles render in light and dark with visible `© VIETMAP` attribution and no second canvas after a theme switch.
- [ ] Given the routing key is valid, when a CAR and a MOTORCYCLE leg is requested, then `provider === "VIETMAP"`, `durationSeconds` equals `time / 1000` and `distanceMeters` equals the returned metres.
- [ ] Given route results, when the geometry is normalised, then every coordinate is `[lng, lat]` and passes `isValidMapCoordinate`.
- [ ] Given each error row above, when the adapter runs, then the mapped reason is produced and no leg is ever `VERIFIED`.
- [ ] Given `OVER_DAILY_LIMIT`, when the breaker opens, then subsequent calls return `UNAVAILABLE` without contacting VietMap, and `ZERO_RESULTS` never opens it.
- [ ] Given the full test suite and a production build, when run, then they pass with no `STADIA_MAPS` literal, no `stadiaStyles` and no reference to `api.stadiamaps.com` / `tiles.stadiamaps.com` anywhere in `apps/web/src`, `apps/web/scripts` or `scripts`.
- [ ] Given the routing key, when the client bundle and API responses are searched, then the key value never appears.
- [ ] Given the completed work, when `docs/ai-progress.md` is read, then a dated entry records checks run, evidence and every `NOT_RUN` item honestly.

## Test Plan

- Focused Vitest for the adapter: vehicle mapping, unit conversion, all nine failure rows, key non-leakage, coordinate order, oversized body, abort.
- Provider test: `createVietmapRoutesProvider` produces a schema-valid `VERIFIED` leg or the correct `INSUFFICIENT_DATA` reason.
- Breaker test: opens on `OVER_DAILY_LIMIT`, does not open on `ZERO_RESULTS`/`UNAVAILABLE`, expires after its TTL, and never returns a stale route.
- Existing Planner, travel-time, In-trip, Trip Save, theme and map tests updated rather than deleted.
- `probe-vietmap-routes.mjs` against the real key: ≥3 Hà Giang coordinate pairs × CAR/MOTORCYCLE, durations and distances recorded.
- Manual browser checklist: five map surfaces × light/dark × 360px/1280px, DevTools filtered to `.pbf` shows no 401, and one full Planner → preview → save run.
- `npm run check-types`, `npm run test`, `npm run build`, `git diff --check`.

## Expected Modules / Files

`modules/map/map-config.ts`, `maplibre-renderer.ts`, `itinerary-map-renderer.ts`, `modules/trip-validation/vietmap-route.ts`, `modules/trip-planner/{planner-routes,planner-runtime,planner-contract,planner-service}.ts`, `modules/trip-save/{trip-save-server,trip-save-service}.ts`, `modules/trip-edit/trip-edit-service.ts`, the four trip Route Handlers, `components/trip-planner/planner-presentation.tsx`, twelve test files, `.env.schema`, `.env.example`, and the script list in the plan. Full list: [migration plan §7](../implementation/vietmap-migration-plan.md).

## Migration Impact

No database migration and no schema change. Environment: remove `STADIA_MAPS_API_KEY`, add `NEXT_PUBLIC_VIETMAP_MAP_KEY` and `VIETMAP_ROUTING_API_KEY`, then run `npm run env:generate`.

## Environment Impact

VietMap tile requests require a valid referer on every environment, including localhost; there is no keyless development mode. Authorized hosts: the Production domain and `http://localhost:3010`. Preview URLs are known-broken for tiles and fall back to the list. Record the key expiry date in `docs/implementation/environment-deployment.md`.

## Implementation Sequence

1. Create the two VietMap keys and run the routing probe.
2. Basemap: style, attribution, five surfaces.
3. Adapter: `vietmap-route.ts` with unit and error tests.
4. Provider wiring: planner provider/runtime, four handlers, trip save.
5. Contract and UI: `VIETMAP` literal, credit copy.
6. Delete Stadia code, scripts and environment variable; replace tests.
7. Docs: ADR statuses, architecture, product spec, environment guide, `ai-progress.md`.

## Acceptance Evidence

N/A until implemented.

## Open Questions

- Exact key expiry date and whether a VietMap educational extension is granted — owner to confirm; recorded in the environment guide when known.
- Whether the in-memory breaker is acceptable given it only protects a single serverless instance — accepted by the owner on 2026-10-23 as best-effort, not an absolute quota guarantee.

## Handoff Notes

- Do not hand this to an implementer without the [migration plan](../implementation/vietmap-migration-plan.md); it carries the verified provider facts (`time` in ms, `distance` in metres, conflicting `points_encoded` docs, style 200 with tile 401, missing attribution) that are easy to get wrong.
- Preserve historical evidence under `docs/implementation/us28-stadia-v2-evidence/`; do not rewrite past progress entries.
