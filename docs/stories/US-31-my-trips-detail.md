# US-31 — My Trips và chi tiết hành trình

## Status

IMPLEMENTED IN CODE — US-30 migration is applied; authenticated Trip UI and MH-07/MH-09 visual acceptance remain NOT PROVEN.

## Goal / User Story

Traveler xem các chuyến đi đã lưu của chính mình, phân nhóm theo ngày lịch Việt Nam và xem lịch trình từng ngày theo đúng thứ tự.

## Source References

- `docs/product/product-spec.md`: Traveler-only private trips, Asia/Ho_Chi_Minh business dates, no shared ownership.
- `docs/flow/user-flow.md`: saved-trip review after confirmed persistence.
- `docs/stories/US-30-confirm-save-trip.md`: canonical Trip/Day/Visit schema and save gate.
- User Task 5: list/detail/status, owner-scoped reads, and UI states.
- Figma MH-07/MH-09 requested conditionally; connected file currently exposes only `01 – Components` (Itinerary Item `4:134`), not those frames.

## Dependencies

US-30 Trip, ItineraryDay and ItineraryVisit exist locally. The development DB migration history was reconciled in `US-30-db-migration-fix.md`; `20261015000000_us30_trip_save` is applied and `prisma migrate status` reports 19 migrations up to date. The development DB currently has zero Trip rows, so authenticated list/detail with saved data still needs live acceptance evidence.

## In Scope

- Owner-scoped `GET /api/trips` and `GET /api/trips/:id` via existing shared read envelope.
- One pure calendar-derived status function and reuse of the canonical Vietnam date helper.
- `/trips` list grouped Upcoming/Ongoing/Completed and `/trips/[id]` ordered detail.
- Loading, empty, technical error, Guest/Admin handling, responsive/light-dark styling, ownership tests.

## Out of Scope

Trip editing, AI changes, replanning, sharing, Admin trip access, favorite trip, migration repair, new schema or write behavior.

## Business Rules

- `endDate = startDate + durationDays - 1` calendar days. Before start = UPCOMING; start through end inclusive = ONGOING; after end = COMPLETED. Completion describes dates only.
- `referenceDate` is supplied once per request from `vietnamDateOf(now)`; the pure status function does not read the clock.
- List query has `where: { userId: actor.userId }`. Detail query has `where: { id, userId: actor.userId }`; missing and other-owner IDs share 404.
- Days order by dayIndex ascending and visits by order ascending, with stable ID tie-breaks where useful.

## Roles / Authorization

Guest receives 401 API or login redirect in UI. Admin receives 403 API or AccessDenied in UI. Traveler can read only own Trip. No client userId parameter.

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
- [x] Guest/Admin denied and missing/foreign detail indistinguishable in service/API tests.
- [x] My Trips and Detail render grouped/ordered content, loading/empty/error and light/dark responsive styles in code; browser/360px visual acceptance NOT PROVEN.

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

The API uses shared read envelopes and `private, no-store`. List selects only Trip summary fields with `where: { userId }`; detail selects ordered days/visits with `where: { id, userId }`. Guest/Admin are rejected before Trip queries. UI has three status sections, a create action, day visit cards following the accessible Figma Itinerary Item example, hidden destinations marked unavailable, and loading/empty/error/not-found states.

Follow-up verification on 2026-10-15: US-30/31 targeted tests 37/37 PASS, `npm run check-types` PASS, and `npm run build` PASS. Full `npm test` still fails at the existing Culture header-link assertion. A local Next dev server at `localhost:3010` returned 401 for Guest requests to both Trip APIs; browser navigation to `/trips` showed `/login?returnTo=%2Ftrips`. Read-only development DB query counted zero Trip rows. Therefore authenticated My Trips/Detail with data, ownership navigation between two real Travelers, light/dark and 360px viewport checks remain NOT PROVEN. The connected Figma file metadata still exposes only `01 – Components`, so MH-07/MH-09 frame parity is BLOCKED. No code or schema change was needed for this re-audit.

## Open Questions

- MH-07/MH-09 screens are absent from the connected Figma file; visual fidelity to those frames is blocked.
- A saved Trip and authenticated Traveler session are needed for live list/detail and ownership navigation checks; none was created during this audit.
