# US-31 — My Trips và chi tiết hành trình

## Status

IMPLEMENTED — 2026-10-20 approved extension adds owner-scoped Delete and manual completion. Browser save/reload/mark/reload/unmark/delete/not-found and responsive light/dark PASS. Two-actor PostgreSQL fixture isolation PASS; two separate real browser accounts and injected browser FAILED/UNKNOWN NOT PROVEN. Latest extension evidence below supersedes earlier read-only scope.

## Goal / User Story

Traveler xem các chuyến đi đã lưu của chính mình, phân nhóm theo ngày lịch Việt Nam và xem lịch trình từng ngày theo đúng thứ tự.

## Source References

- `docs/product/product-spec.md`: Traveler-only private trips, Asia/Ho_Chi_Minh business dates, no shared ownership.
- `docs/flow/user-flow.md`: saved-trip review after confirmed persistence.
- `docs/stories/US-30-confirm-save-trip.md`: canonical Trip/Day/Visit schema and save gate.
- User Task 5: list/detail/status, owner-scoped reads, and UI states.
- Figma page `05 – Prototype Flow`: MH-07 `71:2`, MH-08 `57:573`, MH-09 `71:39`, inspected on 2026-10-19.

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

My Trips retains status-grouped full-width rows and factual metadata. The approved screenshot redesign on 2026-10-20 removes Favorite actions from all rendered Trip surfaces. Detail now follows reference image 1: full-width green hero, status badge at upper right, day headings and a vertical timeline with a separate time column and destination cards. Edit/In-trip actions remain below the itinerary. The former sidebar is removed because its factual information already appears in the hero. No API or persistence contract changes.

## Data / API Contract

- `GET /api/trips`: `{ success:true, data:{ items:[{ id,startDate,endDate,durationDays,transport,status,isFavorite,visitCount }] } }`; the query selects only per-day visit counts, not visit rows.
- `GET /api/trips/:id`: `{ success:true, data:{ trip:{ id,startDate,endDate,durationDays,transport,status,isFavorite,visitCount,days:[{ id,dayIndex,localDate,visits:[{ id,order,startMinute,plannedDurationMinutes,destination:{ id,name,area,visibility } }] }] } } }`.
- Both endpoints are private `no-store` reads. Error responses use shared `handleApiError`.

## Error / Recovery

Missing/other-owner detail is the same 404. Technical failures reach shared API error or a recoverable page error boundary. Empty list is a valid state.

## Write Semantics / Idempotency

N/A — read-only story.

## Acceptance Criteria

- [x] A sees only A's trips; B's list/detail is inaccessible to A at DB query level in service tests.
- [x] Status boundaries and one-day trip are deterministic in Asia/Ho_Chi_Minh.
- [x] Detail days and visits are ordered; list omits visit rows while returning a factual aggregate `visitCount`.
- [x] Guest/unsupported role denied and missing/foreign detail indistinguishable in service/API tests; ADMIN with traveler capability is owner-scoped.
- [x] My Trips and Detail render grouped/ordered content, loading/empty/error states; 360/390/768/1024/1440px light/dark browser checks found no horizontal overflow and retained the main CTA/navigation. Figma MH-07/MH-09 structure was inspected and applied without inventing data.

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

- A second authenticated Traveler session is needed to test ownership in both directions. One-sided denial and owner-scoped repository tests pass.
- Live browser fixtures for ONGOING, COMPLETED, multi-day, empty and controlled error states were not created because this audit does not rewrite dates or reset the shared development DB; component/service coverage passes.

## Re-audit evidence — 2026-10-19

- `listMyTrips` still queries `where: { userId: actor.userId }`; `getMyTrip` still queries `where: { id, userId: actor.userId }`. Days and visits retain deterministic order and `deriveTripStatus` retains the supplied Vietnam calendar reference date. The list query now selects nested `_count.visits` and sums it as `visitCount` without loading visit rows.
- Development DB read-only inspection before E2E: 23 finished migrations, no rollback, US-30 migration applied; 1 Trip / 2 Days / 4 Visits predated this audit. E2E save added one Trip / 1 Day / 3 Visits for the signed-in Traveler; old rows were not modified.
- Focused US-29/30/31 Vitest 115/115 PASS; `npm run check-types`, `npm run build`, separate legacy tests and `git diff --check` PASS. Root `npm test` stops on six unrelated full-Vitest failures (US-35/36/37 in-trip, AI edit, preference-extraction env); 2602 passed, 134 skipped, 1 todo.
- Guest HTTP/browser at `localhost:3010`: both Trip reads returned 401 and `/trips` redirected to `/login?returnTo=%2Ftrips`. Authenticated Traveler browser: My Trips was empty before save, then showed exactly one Upcoming item for the new `cmvetgw4s0001a0k5cytvczml`; detail showed the saved date, vehicle and all three ordered visits. Trying the pre-existing other-owner Trip via API returned `TRIP_NOT_FOUND`, identical to a nonexistent ID, and the UI showed its not-found state.
- Light/dark browser checks on `/trips` and new Trip detail at 360/390/768/1024/1440px measured `scrollWidth <= clientWidth`; the create/back/edit actions and visit order 1,2,3 remained present. Original light theme was restored afterward.
- Figma MH-07 (`71:2`) and MH-09 (`71:39`) were inspected. The implementation uses their list-row grouping, green summary hero, timeline and side-information hierarchy while retaining current header/tokens and factual application data.

## Completion changes and fresh evidence — 2026-10-19

- Replaced the loose card grid with full-width, status-accented Trip rows and added factual visit totals. One and multiple Trip layouts start at the top of their status section.
- Reworked Trip Detail into a summary hero plus ordered itinerary timeline and information sidebar. No travel-time number, image or validator snapshot is invented. Existing Favorite, Edit and In-trip links remain wired to their real routes.
- Updated list loading skeleton and recoverable error copy. Empty state retains `Tạo chuyến đi đầu tiên`.
- Browser verified five owner Trips immediately after save and after reload; direct links open the exact saved Trip. Development DB confirms each of four audit-created Trips has one Day and three ordered Visits.
- Focused US-29/30/31 suite: **115/115 PASS**. Root typecheck/build PASS. Full `npm test` remains FAILED outside US-30/31 with 2603 passed, 6 failed, 134 skipped, 1 todo.
- Changed runtime files: `apps/web/src/modules/trip-read/trip-read-service.ts`, `apps/web/src/app/trips/trips-view.tsx`, `trips.css`, `loading.tsx`, `error.tsx`; updated focused tests in `trip-read.vitest.test.ts` and `trips-view.vitest.test.ts`. No schema, migration, auth, save API or cache mechanism changed.

## Screenshot redesign — 2026-10-20

- User supplied three screenshots as the primary visual target. Current page components, shared Card/Button, Lora heading font, Be Vietnam Pro body font, Lucide icons and existing theme were reused.
- Trip list and detail omit the Favorite control for both `isFavorite=false` and `true`. API/database/relations and `/favorites` are unchanged by this task; see the US-34 UI override.
- Detail has an aligned ArrowLeft link to `/trips`, a full-width hero and a full-width itinerary. Visit end times are derived from persisted startMinute + plannedDurationMinutes, never routing estimates. Current Trip DTO has no photo/summary, so neutral placeholders appear and no destination description is invented.
- In-trip uses a clock banner with cream/amber light and muted amber dark colors; visit time badges, individual timeline nodes, factual metadata, locked label and concise remaining empty state. Passed-schedule text explicitly does not confirm actual sightseeing.
- Edit uses a factual Trip summary to the right of the title, equal desktop columns, AI chips that populate text without submitting, destination search/add, compact proposal timeline and native details for existing visit tools. The separate result section contains the unchanged four-group Validator. Existing cancellation/FAILED/UNKNOWN/apply handlers are retained.

### Browser evidence

- PASS: signed-in current-owner Trip selected from the real My Trips list; all three routes at 360/390/768/1024/1440px in light and dark (30 measurements) have document scrollWidth <= viewport. Edit stacks at 768px and below and has equal columns at 1024/1440px. Header is unchanged.
- PASS: back link returns to `/trips`; list has five Trip cards and zero Favorite controls. Detail Back and hero left edges match.
- PASS: AI chip populates textarea and enables Send without a request. Manual reorder survives an empty destination search. A real public Destination is added only to local proposal (3→4 visits); cancel returns to the saved 3 visits. No confirm/save action was invoked.
- PASS: read-only live preview of the original candidate renders all four Validator groups as SATISFIED; no apply request was made.
- Screenshot files outside Git: `C:/Users/Admin/AppData/Local/Temp/trip-redesign-detail-before.png`, `trip-redesign-detail-after.png`, `trip-redesign-in-trip-after.png`, `trip-redesign-edit-after.png`, `trip-redesign-edit-dark.png` and `trip-redesign-*-mobile-dark.png`. Measurements: `trip-redesign-responsive.json`.
- NOT VERIFIED: usable before screenshots for Edit/In-trip. Those captures caught the loading skeleton, so they are not visual evidence for the old loaded layout. The Detail before screenshot is usable; after screenshots were inspected after rendering settled.
- BLOCKED: exact photo/description/mountain-art parity. These fields are not in current Trip presentation contracts and no matching decorative asset was found. No backend/data extension or arbitrary image mapping was added.
- NOT VERIFIED: live AI submission, changed-proposal apply, controlled FAILED/UNKNOWN, GPS and a live HAS_REMAINING fixture. Their existing business/session tests run; this task did not mutate DB data to manufacture fixtures.

### Verification

- PASS: 79 targeted tests in 11 files (Trip views, Planner UI, US-32/manual cancel/apply state, AI edit session, In-trip session/split, Validator and presentation labels).
- PASS: Favorite legacy regression 27/27.
- FAILED: root `npm test`: 2607 passed, 6 failed, 134 skipped, 1 todo. Same six failures recorded before this task: US-35 source guard flags the existing static `href`, US-36/replan and US-37 tests retain Admin-denied expectations, AI edit HTTP retains Admin-denied expectation, preference-extraction env expects different model sensitivity. No newly failing test identified.
- Full legacy suite, root typecheck/build and final diff check are recorded in the corresponding progress entry.

## Approved extension — 2026-10-20 (current behavior)

User task `dd773ed8-494a-4aa9-b36b-3774956d1208` explicitly extends the original read-only/date-derived baseline with Delete and manual completion. Historical sections above describe prior work. No Trip editing, in-trip semantics, Favorite UI, header or global theme redesign is included.

### API, authorization and transaction

| Endpoint | Request | Confirmed SUCCESS data |
| --- | --- | --- |
| `DELETE /api/trips/:id` | Empty body, same-origin, `Idempotency-Key` | `{ tripId, deleted: true }` |
| `PATCH /api/trips/:id/completion` | Strict JSON `{ completed: boolean }`, same-origin, `Idempotency-Key` | `{ tripId, manuallyCompletedAt: ISO-or-null, status, endDate }` |

Both use shared SUCCESS/FAILED/UNKNOWN envelopes and `private, no-store`. Query owner overrides, body owner overrides, invalid types/JSON and missing keys are rejected. Actor comes from authenticated session plus persisted authorization. Existing RBAC V2 Admin inheritance of traveler capability on **own** records is preserved; no Admin ownership bypass was added. Guest mutations fail. Foreign/missing Trip consistently returns 404.

`trip-management-service.ts` uses actor-scoped `executeIdempotentWrite`. It rechecks authorization inside the transaction and scopes Trip find/delete/update predicates by `{ id, userId: actor.userId }`. Replay lookup precedes another write, including replay after the Trip has been deleted. Different payload with the same operation/key fails 409. Lookup/technical uncertainty is UNKNOWN, never a fabricated confirmed result.

Hard delete chosen because Trip has no soft-delete contract. Live FK audit found only Favorite and ItineraryDay referencing Trip; ItineraryVisit references Day. The transaction deletes Favorite links only after proving Trip ownership, then deletes the owned Trip. Existing cascade removes Day/Visit. Destination is a RESTRICT target, never deleted by this service. Idempotency/audit data is retained; other Trips are untouched. Concurrent missing target rolls back the transaction.

### Completion model and status

One nullable Trip field: `manuallyCompletedAt DateTime?`. `deriveTripStatus` remains unchanged. Shared `effectiveTripStatus` returns COMPLETED if this timestamp exists, otherwise uses the calendar result. Both list/detail select and return the timestamp and use this helper. The completion update writes only the timestamp (and Prisma's conventional updatedAt); no dates, duration, order, visits or in-trip visit classification are changed.

Mark/unmark only changes UI after confirmed SUCCESS. Unmark explains that an already elapsed trip remains COMPLETED by calendar. Manual and calendar completion have different visible copy. No checked control is inferred from elapsed dates.

### Development DB audit and migration

Verified the configured development endpoint against the existing reviewed registry; no production connection or secret was printed.

| Migration state | Disk before | DB before | Disk/DB after |
| --- | --- | --- | --- |
| Existing 23 migrations through `20261017210000_admin_user_management` | Present | Finished | Present/finished |
| `20261020044507_destination_soft_delete` | Missing | Finished | Restored exact Git original / already finished |
| `20261020100000_rag_document_soft_delete` | Missing | Finished | Restored exact Git original / already finished |
| `20261020170000_trip_manual_completion` | New | Not applied | Present / finished `2026-10-20T16:02:38.218Z` |
| Total | 23 | 25 | 26 / 26 |

Drift was reported before proceeding. User explicitly approved restoration of original migrations and corresponding schema fields/index. Originals came from `2eb8757` (Destination) and `4e0e0de` (RAG); SHA256 checksums match ledger allowing LF/CRLF variants. No migration was deleted/rewritten, no manual ledger write or resolve was used. After restoration, `prisma migrate diff` returned an empty migration. A second diff then showed exactly the new nullable Trip column. Reviewed SQL:

```sql
ALTER TABLE "trip" ADD COLUMN "manuallyCompletedAt" TIMESTAMP(3);
```

Applied the reviewed pending migration via Prisma `migrate deploy`; already-applied restored migrations were not executed again. Final migrate status is up to date and final DB-to-schema diff is empty. Column confirmed nullable `timestamp without time zone`.

Verified catalog FKs: Trip→User CASCADE; Day→Trip CASCADE; Visit→Day CASCADE; Visit→Destination RESTRICT; Favorite→Trip RESTRICT. Existing indexes retained: trip PK and `(userId,createdAt)`, Day PK/unique `(tripId,dayIndex)`, Visit PK/unique `(dayId,order)`/index destinationId. No speculative new index.

### UI and browser evidence

- Existing Trip card and shared Button reused. Primary detail link is separated from secondary completion/destructive controls. Native modal dialog has labelled heading/description, initial focus on Hủy, native focus containment/Escape, pending lock and irreversible deletion wording.
- FAILED/UNKNOWN retains list and counts. UNKNOWN locks changing the intended action and retries the same request/key for server reconciliation. A malformed/mismatched success response is treated as UNKNOWN. Confirmed completion updates only that Trip and group counts; router refresh reconciles current server data without emptying the list.
- A live browser fixture passed mark → COMPLETED, reload retained timestamp/group, unmark → UPCOMING. Delete cancel retained the row. The user then explicitly approved deleting this exact disposable Trip; pending was observed, row/count removed only on SUCCESS. Its direct detail/edit/in-trip showed not-found; authenticated detail API returned `TRIP_NOT_FOUND`.
- Final DB counts: seven pre-existing Trips remain; browser test Trip/Day count zero; disposable integration users zero. The PostgreSQL test verifies descendant Visit and Favorite counts zero and original test Destination survives Trip deletion, before fixture cleanup.
- Light and Dark measured at 360/390/768/1024/1440: document widths 345/375/753/1009/1425 respectively (15px vertical scrollbar), no horizontal overflow. Dialog fits mobile, actions wrap, theme tokens respond. Temporary viewport reset afterward.
- A new screen-reader announcement initially inherited the direct-child container width and caused overflow; excluding `.sr-only` from that width rule fixed the measured root cause.
- Screenshot artifacts: `trip-management-evidence/my-trips-desktop-light.jpg`, `delete-dialog-mobile-dark.jpg`, completion/list captures in the task's local artifact directory. They contain development UI only, no secrets.

### Tests and remaining evidence limits

| Check | Result |
| --- | --- |
| Targeted Validator/save/read/planner/UI/edit/in-trip regression | PASS: 184 tests, one opt-in DB test skipped in this run |
| Opt-in live PostgreSQL integration (two disposable TRAVELER users) | PASS: 1/1; save/replay/read/completion/isolation/FK cleanup |
| Full Vitest via root `npm test` | FAILED: 2626 pass, six known baseline failures, 135 skip, one todo |
| Legacy suite including auth/authorization/Favorite/idempotency | PASS: 336 tests |
| Root check-types / build / diff whitespace | PASS; final command results in ai-progress |
| Real browser Save + reload + mark + reload + unmark + cancel/delete + not-found | PASS |
| Browser injected FAILED/UNKNOWN and two separately signed-in users | NOT PROVEN; covered at service/client/HTTP/DB levels instead |

The six full-suite failures are unchanged from the previous progress baseline: US-35 static navigation source guard, US-36 Admin-denied assertions (replan HTTP and end-to-end), US-37 Admin-denied assertion, AI-edit HTTP Admin-denied assertion, preference env model sensitivity expectation. This extension did not edit those production/test files. No new failing test remains; no unrelated failure was suppressed.

### Commands run

Root working directory:
```powershell
npm run db:generate
npm run check-types
npm run build
npm test
git diff --check
```
Web working directory (`apps/web`), Windows binaries:
```powershell
& ../../node_modules/.bin/varlock.cmd run -- node ../../node_modules/tsx/dist/cli.mjs .trip-management-audit.ts
& ../../node_modules/.bin/varlock.cmd run -- node ../../node_modules/prisma/build/index.js migrate diff --from-config-datasource --to-schema ../../packages/db/prisma/schema --config ../../packages/db/prisma.config.ts --script
& ../../node_modules/.bin/varlock.cmd run -- node ../../node_modules/prisma/build/index.js migrate deploy --config ../../packages/db/prisma.config.ts
& ../../node_modules/.bin/varlock.cmd run -- node ../../node_modules/prisma/build/index.js migrate status --config ../../packages/db/prisma.config.ts
& ../../node_modules/.bin/vitest.cmd run --config vitest.config.mts src/modules/trip-validation src/modules/trip-save src/modules/trip-read src/components/trip-planner/planner-ui.vitest.test.ts src/app/trips/trips-view.vitest.test.ts src/modules/trip-edit/us32-test.vitest.test.ts src/modules/trip-edit/edit-apply-state.vitest.test.ts src/modules/trip-edit/ai-edit-session.vitest.test.ts src/modules/in-trip/in-trip-proposal-session.vitest.test.ts src/modules/in-trip/in-trip-session.vitest.test.ts src/modules/in-trip/split-trip.vitest.test.ts
$env:RUN_TRIP_MANAGEMENT_DB_TESTS='1'
& ../../node_modules/.bin/varlock.cmd run -- node ../../node_modules/vitest/vitest.mjs run --config vitest.config.mts src/modules/trip-read/trip-management.postgres.integration.vitest.test.ts
Remove-Item Env:RUN_TRIP_MANAGEMENT_DB_TESTS
npm run test:legacy
```
Audit script was temporary and removed after recording results. Its read-only SQL included migration ledger ordered by started_at, information_schema nullable column, pg_constraint FK definitions and pg_indexes. No env file was changed.

### Exact management files added/changed

- `packages/db/prisma/schema/{trip.prisma,destination.prisma,rag-document.prisma}`.
- `packages/db/prisma/migrations/{20261020044507_destination_soft_delete,20261020100000_rag_document_soft_delete,20261020170000_trip_manual_completion}/migration.sql` (first two restored, last new).
- `apps/web/src/app/api/trips/[id]/route.ts`; new `[id]/completion/route.ts`.
- `apps/web/src/modules/trip-read/{trip-status.ts,trip-read-service.ts,trip-read.vitest.test.ts}`.
- New `apps/web/src/modules/trip-read/{trip-management-service.ts,trip-management-http.ts,trip-management-client.ts,trip-management.vitest.test.ts,trip-management-client.vitest.test.ts,trip-management.postgres.integration.vitest.test.ts}`.
- `apps/web/src/app/trips/{trips-view.tsx,trips-view.vitest.test.ts,trips.css}`; new `trip-management-actions.tsx`.
- Save files listed in US-30; these two stories, `docs/ai-progress.md`, `docs/superpowers/plans/2026-10-20-trip-management-extension.md`.

Fresh read-only reviewer found no critical/important code issue. No commit/push/merge/reset, dependency, new global store/provider or generic management engine.
