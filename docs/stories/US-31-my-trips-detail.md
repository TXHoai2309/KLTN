# US-31 — My Trips và chi tiết hành trình

## Status

IMPLEMENTED IN CODE — authenticated My Trips/detail and one-sided foreign-owner denial PASS on development DB; MH-07/MH-09 parity and complete browser status matrix remain NOT PROVEN (re-audit 2026-10-19).

## Goal / User Story

Traveler xem các chuyến đi đã lưu của chính mình, phân nhóm theo ngày lịch Việt Nam và xem lịch trình từng ngày theo đúng thứ tự.

## Source References

- `docs/product/product-spec.md`: Traveler-only private trips, Asia/Ho_Chi_Minh business dates, no shared ownership.
- `docs/flow/user-flow.md`: saved-trip review after confirmed persistence.
- `docs/stories/US-30-confirm-save-trip.md`: canonical Trip/Day/Visit schema and save gate.
- User Task 5: list/detail/status, owner-scoped reads, and UI states.
- Figma MH-07/MH-09 requested conditionally; connected file currently exposes only `01 – Components` (Itinerary Item `4:134`), not those frames.

## Dependencies

US-30 Trip, ItineraryDay and ItineraryVisit exist locally. The development DB migration history was reconciled in `US-30-db-migration-fix.md`; `20261015000000_us30_trip_save` is applied. Initial read-only 2026-10-19 audit found 23 finished migrations and 1 Trip/2 ItineraryDay/4 ItineraryVisit rows. Authenticated E2E save added one development test Trip (1 Day/3 Visits), then list/detail were checked in browser.

## In Scope

- Owner-scoped `GET /api/trips` and `GET /api/trips/:id` via existing shared read envelope.
- One pure calendar-derived status function and reuse of the canonical Vietnam date helper.
- `/trips` list grouped Upcoming/Ongoing/Completed and `/trips/[id]` ordered detail.
- Loading, empty, technical error, Guest/unsupported-role handling, responsive/light-dark styling, ownership tests.

## Out of Scope

Trip editing, AI changes, replanning, sharing, favorite trip, migration repair, new schema or write behavior.

## Business Rules

- `endDate = startDate + durationDays - 1` calendar days. Before start = UPCOMING; start through end inclusive = ONGOING; after end = COMPLETED. Completion describes dates only.
- `referenceDate` is supplied once per request from `vietnamDateOf(now)`; the pure status function does not read the clock.
- List query has `where: { userId: actor.userId }`. Detail query has `where: { id, userId: actor.userId }`; missing and other-owner IDs share 404.
- Days order by dayIndex ascending and visits by order ascending, with stable ID tie-breaks where useful.

## Roles / Authorization

Guest receives 401 API or login redirect in UI. Current RBAC V2 grants traveler capability to TRAVELER and ADMIN; either role reads only its own Trip. Unsupported roles receive 403. No client userId parameter. This replaces the outdated Admin-denied statement from the first US-31 implementation.

## UX / UI Contract

My Trips has a Create Trip action, three date-status groups, summary/date/vehicle/status, open-detail action and loading/empty/error states. Detail shows metadata and itinerary grouped by day. Existing semantic tokens, `@KLTN/ui`, Trip/Favorites conventions, and Figma Itinerary Item component inform styling; exact MH-07/MH-09 visual parity is NOT PROVEN because those frames are not accessible in the connected file.

## Data / API Contract

- `GET /api/trips`: `{ success:true, data:{ items:[{ id,startDate,endDate,durationDays,transport,status }] } }`; no visits in summaries.
- `GET /api/trips/:id`: `{ success:true, data:{ trip:{ id,startDate,endDate,durationDays,transport,status,days:[{ id,dayIndex,localDate,visits:[{ id,order,startMinute,plannedDurationMinutes,destination:{ id,name,area,visibility } }] }] } } }`.
- Both endpoints are private `no-store` reads. Error responses use shared `handleApiError`.

## Error / Recovery

Missing/other-owner detail is the same 404. Technical failures reach shared API error or a recoverable page error boundary. Empty list is a valid state.

## Write Semantics / Idempotency

N/A — read-only story.

## Acceptance Criteria

- [x] A sees only A's trips; B's list/detail is inaccessible to A at DB query level in service tests.
- [x] Status boundaries and one-day trip are deterministic in Asia/Ho_Chi_Minh.
- [x] Detail days and visits are ordered; list omits visits.
- [x] Guest/unsupported role denied and missing/foreign detail indistinguishable in service/API tests; ADMIN with traveler capability is owner-scoped.
- [x] My Trips and Detail render grouped/ordered content, loading/empty/error states; 360/390/768/1024/1440px light/dark browser checks found no stable horizontal overflow. Exact Figma screen matching remains NOT PROVEN.

## Test Plan

TDD focused service/status/API/UI tests; US-30 regression; full tests, typecheck, build, diff check; manual browser review if a migrated DB and authenticated Traveler are available.

## Expected Modules / Files

`apps/web/src/modules/trip-read/*`, `apps/web/src/app/api/trips/route.ts`, `apps/web/src/app/api/trips/[id]/route.ts`, `apps/web/src/app/trips/*`, this story and `docs/ai-progress.md`.

## Migration Impact

None for US-31. The prerequisite US-30 migration is applied to the configured development DB; US-31 added no schema or migration.

## Environment Impact

None.

## Implementation Sequence

1. Test and implement pure status/date logic.
2. Test and implement owner-scoped list/detail service and read endpoints.
3. Build list/detail pages and UI states using existing theme/components.
4. Verify and record evidence/blockers.

## Acceptance Evidence

US-31 focused Vitest: 20/20 PASS (service/status 11, HTTP 5, UI 4). Combined US-31 and US-30 regression: 37/37 PASS. Full Vitest: 1077 passed, 68 skipped (integration tests). `npm run build` and `npm run check-types` PASS after route types were regenerated. `npm run test` runs the Vitest phase but fails in the existing legacy Culture assertion that expects a `Văn hóa` header link; that assertion predates this story and its files were not changed. `git diff --check` PASS.

The API uses shared read envelopes and `private, no-store`. List selects only Trip summary fields with `where: { userId }`; detail selects ordered days/visits with `where: { id, userId }`. Guest/unsupported roles are rejected before Trip queries; ADMIN with traveler capability remains owner-scoped under current RBAC V2. UI has three status sections, a create action, day visit cards following the accessible Figma Itinerary Item example, hidden destinations marked unavailable, and loading/empty/error/not-found states.

Follow-up verification on 2026-10-15: US-30/31 targeted tests 37/37 PASS, `npm run check-types` PASS, and `npm run build` PASS. Full `npm test` still fails at the existing Culture header-link assertion. A local Next dev server at `localhost:3010` returned 401 for Guest requests to both Trip APIs; browser navigation to `/trips` showed `/login?returnTo=%2Ftrips`. Read-only development DB query counted zero Trip rows. Therefore authenticated My Trips/Detail with data, ownership navigation between two real Travelers, light/dark and 360px viewport checks remain NOT PROVEN. The connected Figma file metadata still exposes only `01 – Components`, so MH-07/MH-09 frame parity is BLOCKED. No code or schema change was needed for this re-audit.

## Open Questions

- MH-07/MH-09 screens are absent from the connected Figma file; visual fidelity to those frames is blocked.
- A second authenticated Traveler session is needed to test ownership in both directions. One-sided denial was verified using the pre-existing Trip owned by someone else.

## Re-audit evidence — 2026-10-19

- No US-31 runtime code change was needed. `listMyTrips` queries `where: { userId: actor.userId }`; `getMyTrip` queries `where: { id, userId: actor.userId }`. Days and visits have deterministic order. `deriveTripStatus` uses a supplied Vietnam calendar reference date.
- Development DB read-only inspection before E2E: 23 finished migrations, no rollback, US-30 migration applied; 1 Trip / 2 Days / 4 Visits predated this audit. E2E save added one Trip / 1 Day / 3 Visits for the signed-in Traveler; old rows were not modified.
- Focused US-29/30/31 Vitest 115/115 PASS; `npm run check-types`, `npm run build`, separate legacy tests and `git diff --check` PASS. Root `npm test` stops on six unrelated full-Vitest failures (US-35/36/37 in-trip, AI edit, preference-extraction env); 2602 passed, 134 skipped, 1 todo.
- Guest HTTP/browser at `localhost:3010`: both Trip reads returned 401 and `/trips` redirected to `/login?returnTo=%2Ftrips`. Authenticated Traveler browser: My Trips was empty before save, then showed exactly one Upcoming item for the new `cmvetgw4s0001a0k5cytvczml`; detail showed the saved date, vehicle and all three ordered visits. Trying the pre-existing other-owner Trip via API returned `TRIP_NOT_FOUND`, identical to a nonexistent ID, and the UI showed its not-found state.
- Light/dark browser checks on `/trips/new` (form and actual proposal), `/trips`, and new Trip detail at 360/390/768/1024/1440px measured `scrollWidth <= clientWidth` after layout settled; key links/buttons remained in the accessibility tree. MapLibre canvas briefly retained its old width during rapid artificial viewport changes, then resized without stable overflow. Viewport and original light theme were restored afterward. Visual design matching Figma MH-07/MH-09 remains BLOCKED; two-owner reverse check and ONGOING/COMPLETED live browser cases remain NOT PROVEN (pure status boundary tests PASS).
- Figma metadata exposed only page `01 – Components`; MH-07/MH-09 frames could not be inspected. Styling stays on the existing design tokens without claiming pixel parity.
