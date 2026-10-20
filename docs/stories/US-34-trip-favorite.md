# US-34 — Favorite saved Trip

## Status

API/schema implementation retained. **UI SCOPE OVERRIDE 2026-10-20:** user explicitly removed Favorite Trip controls from My Trips and Trip Detail. The original UI acceptance below is historical and is not a current PASS. See the override section.

## Epic

Traveler personal content.

## Owner

Current implementation session; no commit/push.

## Goal / User Story

Là Du khách, tôi muốn thêm hoặc bỏ yêu thích một hành trình đã lưu để truy cập nhanh chuyến đi mình quan tâm.

## Outcome

The original implementation added owned-Trip Favorite API/persistence and controls. The 2026-10-20 user-approved UI redesign removes those controls from `/trips` surfaces while retaining API, services, relations, stored data and other Favorite surfaces.

## Source References

- User US-34 contract: Product 6.7.4, 11.17, QTN-86/87/88/90, YCCN-64, MH-07/MH-09; System Specification 4.3/4.4 and 13.1–13.3. These precise citations are supplied by the task; source DOCX files are not present in this checkout.
- `docs/product/product-spec.md`: owned Trip favorite is a relation, no copying/ownership change, confirmed writes only.
- `docs/stories/US-16-favorites-list.md`, `US-30-confirm-save-trip.md`, `US-30-db-migration-fix.md`, `US-31-my-trips-detail.md`.
- Existing Trip/Favorite UI and shared design system. MH-07/MH-09 are not accessible in the connected Figma file; no pixel-parity claim.

## Dependencies

Audited clean `ThaiAnh` at `a5963ab`. Current Favorite enum supports Destination/Culture only; Trip/Day/Visit persistence, owner-scoped reads, Favorite toggle API/button, shared idempotency and Traveler authorization exist.

## In Scope

- Extend the same Favorite table, target parser/service/API/button to owned saved Trips.
- Return actor-scoped `isFavorite` in Trip list/detail with no per-card status fetch.
- Heart action on existing Trip cards and detail; preserve layout/theme.
- Ownership, uniqueness, no-copy/relation-only removal, client outcomes and development DB evidence.

## Out of Scope

Trip clone/create/edit, AI, routing/Validator/status changes, sharing/Admin Trip access, new stores/dependencies and a new Favorite subsystem. `/favorites` currently has only two functional groups and no Trip placeholder; the Trip group is deferred under the task's explicit scope rule.

## Business Rules

Only a persisted Trip with `id = targetId AND userId = session actor` is eligible. Add-existing remains a successful no-op. Remove changes only Favorite, never Trip/Day/Visit. Database unique `(userId, tripId)` prevents duplicate relations; the existing exactly-one-target CHECK extends to three target types.

## Roles / Authorization

Reuse `requireTraveler`; Guest 401, Admin 403, persisted role recheck inside the write transaction.

## Ownership Rules

Trip existence query is scoped by `id + userId` before adding a relation. Missing/foreign Trip share the existing unavailable 404. Favorite status and removal include actor `userId`; no client ownership fields are accepted.

## UX / UI Contract

Reuse `FavoriteButton`, Heart/LoaderCircle, Button, confirmed-state behavior and existing Trip semantic tokens. Clear Trip-specific accessible labels, pending disabled/busy feedback, focus ring, recoverable FAILED/UNKNOWN. Refresh server Trip data only after SUCCESS so list/detail navigation reflects confirmed state. No new visual system.

## Data Contract

Add `FavoriteTargetType.TRIP`, nullable `Favorite.tripId`, Trip relation, `@@unique([userId, tripId])`; retain other fields. Trip list/detail add `isFavorite: boolean`, loaded in the existing query with Favorite filtered by current actor.

## API Contract

Reuse `PUT /api/favorites/trips/:tripId`, `DELETE /api/favorites/trips/:tripId`, `GET /api/favorites/status?targetType=trips&targetId=:tripId`. Existing mutation envelope/result fields and Idempotency-Key remain unchanged. No owner/user body/query input.

## Error / Recovery

Unknown/foreign Trip add returns the same unavailable 404. FAILED keeps prior confirmed heart; UNKNOWN keeps state and identical key/method/target for retry. No raw provider errors.

## Write Semantics / Idempotency

Reuse `executeIdempotentWrite`, `favorite:add`/`favorite:remove`, `apiMutationResult` and the shared client. Transaction contains only Favorite + idempotency writes; no Trip persistence or ownership update.

## External Services

Existing development Neon/Better Auth only; no new dependency or environment variable for production.

## Acceptance Criteria

- [x] Own saved Trip can be favorited; foreign/missing Trip rejected without resource enumeration.
- [x] Duplicate/racing add creates at most one relation.
- [x] Add/remove preserves original Trip/Days/Visits/owner, demonstrated against development DB fixtures.
- [x] Trip list/detail Favorite state belongs to current actor.
- [x] Guest/Admin denied; client identity cannot override actor.
- [ ] Original list/detail heart interaction criterion is superseded by the 2026-10-20 UI removal; it must not be reported as current UI PASS.
- [x] Responsive, light/dark and keyboard evidence reported without unverified visual claims.

## Test Plan

RED → GREEN for Trip target API/security and Trip read projection; shared Favorite state regression; explicit guarded development PostgreSQL fixture test for uniqueness, CHECK/FK and before/after Trip/Day/Visit counts. Run targeted + Favorite/Trip regressions, root tests/typecheck/build/diff check; browser checks with disposable fixtures when possible.

## Expected Modules / Files

Existing Favorite schema/service/parser/button; Trip schema relation/read service/view/CSS; Favorite and Trip tests; one opt-in DB test and additive migration; story and ai-progress.

## Migration Impact

Add enum value/nullable FK/unique index and extend CHECK, preserving existing rows. Review SQL and apply through Prisma development migration workflow, never db:push/reset. Check target before data-changing tests and clean only disposable fixture IDs.

## Environment Impact

No production environment change. Explicit opt-in `US34_DEV_DB=1` only for guarded test execution.

## Implementation Sequence

1. Add failing Trip target/ownership/read-state tests.
2. Extend schema and current Favorite service/parser; generate/review/apply additive migration.
3. Add initial Favorite projection and reuse shared button in both Trip views.
4. Run DB no-copy/security tests, regressions and browser checks; record acceptance evidence.

## Acceptance Evidence

### Current UI override — 2026-10-20

The user explicitly requested no Favorite Trip heart/add/remove action anywhere under `/trips`. Removed the remaining `TripFavoriteButton` render/import from `MyTripsView`; Detail already omitted the control after the earlier UI task. Unused Trip-only Favorite CSS was removed. The standalone button implementation, Favorite API/service, Prisma relation/migration, `isFavorite` DTO and `/favorites` are retained. This is a deliberate change to US-34's former list/detail UX, not proof that the original UI acceptance still passes. SSR regression now checks both isFavorite values on list and detail; browser list shows zero Favorite controls. Shared Favorite regression tests: 27/27 PASS. No Favorite mutation or database write was performed.

The remaining evidence below documents the earlier implementation and must be read as historical.

### Architecture and API

The current repository has one Favorite table, plural `modules/favorites` for target-based add/remove/status and singular `modules/favorite` for the existing US-16 list/relation removal. This task extends the plural flow without creating another subsystem or consolidating unrelated files. Existing `PUT/DELETE /api/favorites/:targetType/:targetId` now accepts `trips`; there are no new Route Handler files. Results remain `{success, operationStatus, data:{targetType,targetId,isFavorite,changed}}`; errors use the same shared mutation handlers. Status is a private read; Trip list/detail add actor-scoped `isFavorite` through a filtered nested Prisma selection.

`assertAvailableTarget` checks Trip by `{id: targetId, userId: actor.userId}`. Add/remove recheck the persisted Traveler role within the shared write transaction. Trip status also verifies ownership; the same unavailable 404 is used for foreign/missing targets. DB unique `(userId,tripId)` plus existing `createMany(skipDuplicates:true)` preserve add-existing SUCCESS/no-op behavior. Idempotency scopes and request hashing are unchanged.

### Database and no-copy evidence

Migration `20261015160000_us34_trip_favorite` was generated using Prisma diff and reviewed before `prisma migrate dev` applied it to the configured development DB. SQL adds one enum value, nullable FK column, unique index and extends the existing one-target CHECK. It does not rewrite existing Favorite rows or change Trip/Day/Visit tables. The CHECK compares enum text to permit adding the enum value safely in the same SQL transaction. The drop/add of the CHECK is a single ALTER TABLE statement.

DB `_prisma_migrations.finished_at`: `2026-10-15T15:28:56.919Z`, `rolled_back_at = NULL`; status reports **20 migrations, up to date**. Catalog queries verified `favorite_tripId_fkey` (Trip FK, DELETE RESTRICT/UPDATE CASCADE), `favorite_userId_tripId_key` and the three-branch `favorite_exactly_one_target_check`. Invalid zero/multiple targets, nonexistent Trip FK, duplicate direct insert and concurrent service adds were exercised against PostgreSQL.

The explicit DB test reported `before={trips:2,days:2,visits:2}`, `after={trips:2,days:2,visits:2}`, `ownerUnchanged=true`. It deep-compares the original Trip, all Days/Visits and timestamps after add/remove; the Favorite references the original Trip ID. Direct foreign-ID API calls return the same 404 as missing IDs. Two concurrent adds with different keys produce one relation, one changed=true and one changed=false. Fixtures were cleaned in finally. Browser fixtures were also logged out/deleted; final DB query found **0 US34 fixture users, 0 US34 fixture Trips**, with total Trip count restored to 0.

### UI evidence

`TripFavoriteButton` composes the existing `FavoriteButton` and refreshes the server route only after confirmed SUCCESS. Initial state comes with the Trip response, so no card-specific status fetch is needed. Trip cards/detail retain their existing layout and use the same Heart/LoaderCircle/Button; scoped Trip tokens cover both themes. Trip open/back Links disable prefetch to obtain current server state on navigation.

Browser checks used a production build locally at `localhost:3010` against the guarded development DB and a disposable Traveler/Trip. Add showed disabled pending with inactive heart, then active only after SUCCESS. Detail inherited the confirmed active state. Space on the remove button worked; success became inactive, and browser Back returned an inactive list card. Focus via Tab had `:focus-visible=true` and a solid outline; rendered element is BUTTON.

A persisted-role change limited to the fixture caused 403 FAILED on remove: active heart remained with recoverable feedback. After restoring its Traveler role, stopping only the owned local server caused UNKNOWN: active heart remained, the retry label and uncertainty message appeared. Restarting the server and retrying the mounted attempt succeeded and removed Favorite. Unit tests prove identical key/method/target retention; browser inspection did not capture network request headers. No post-commit lost-response case or production resilience claim is made.

Both list and detail were measured in Light/Dark at widths **390,768,1024,1440**: document scrollWidth equaled clientWidth in all 16 cases. Shared header/menu behavior was preserved. Theme returned to Light, viewport override reset, temporary tab closed and owned server stopped.

Screenshots outside Git: `C:/Users/Admin/.codex/visualizations/2026/10/05/01a10ada-9f55-7b53-82be-58318bebb2fe/us34/` includes `list-light-390.jpg`, `list-light-1440.jpg`, `list-dark-390.jpg`, `detail-dark-390.jpg`, `detail-dark-1440.jpg`, `failed-keeps-heart.jpg`, `unknown-keeps-heart.jpg`. These show disposable fixture content. The first Light detail capture was cropped during viewport resizing and is not used as visual evidence. Figma metadata again exposed only page `1:2` (`01 – Components`), so exact MH-07/MH-09 matching is BLOCKED.

### Acceptance matrix

| Criterion | Result | Evidence |
| --- | --- | --- |
| Own saved Trip can be favorited | PASS | Route tests, real PostgreSQL API/service test, browser |
| Other account Trip cannot be favorited | PASS | Owner predicate assertion, foreign/missing identical 404, real DB relation count 0 |
| Duplicate Favorite prevented | PASS | DB unique rejection, concurrent adds, same-key replay |
| Favorite creates no Trip copy | PASS | DB counts 2/2/2 unchanged; original graph deep-equal |
| Removing Favorite preserves original Trip | PASS | DB graph/counts/owner unchanged after remove |
| UI updates only after confirmed write | PASS | Shared reducer tests and mounted pending/SUCCESS/FAILED/UNKNOWN retry checks |
| Trip list/detail initial state belongs to actor | PASS | Filtered nested query tests and real DB reads |
| Responsive/light-dark/keyboard | PASS | 16 viewport measurements, screenshots, Space/Tab focus |
| Exact MH-07/MH-09 visual parity | BLOCKED | Frames unavailable in connected file |
| Production rollout and real user dataset | NOT PROVEN | Only disposable development fixtures used |

### Verification and commands

RED: 4 expected failures for unsupported `trips` target and absent `isFavorite`; existing tests remained green. GREEN: focused Favorite/Trip selection **54/54**; legacy Favorite **24/24**; explicit PostgreSQL **1/1**, no skip. Root Vitest phase **1083 passed/68 skipped**. `npm test` exits 1 at existing `apps/web/src/app/culture/culture-page.test.tsx:37` header-link assertion, so full suite PASS is not claimed. Typecheck/build and final `git diff --check` PASS (line-ending notices only). Independent read-only review found no correctness/security issue; its minor pending-documentation observation was addressed in this evidence update.

Root:

```powershell
npm run db:generate
npm run test:favorite --workspace web
npm test
npm run check-types
npm run build
git diff --check
```

DB workspace:

```powershell
npx prisma migrate status
npx prisma migrate dev --create-only --name us34_trip_favorite
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema --script --output prisma/migrations/20261015160000_us34_trip_favorite/migration.sql
npx prisma migrate dev
npx prisma validate
```

`migrate dev --create-only` stopped at the non-interactive unique-constraint warning and produced no migration. Prisma diff then generated the additive SQL, the CHECK was extended before review/apply, and ordinary `migrate dev` applied the reviewed pending migration successfully. An attempted launch with an unnecessary BETTER_AUTH_URL override was blocked by automatic approval; the configured URL was already localhost:3010, so normal `npm run start --workspace web -- --port 3010` ran without any config override.

Web workspace:

```powershell
npx vitest run --config vitest.config.mts src/modules/favorites/us15-favorites.vitest.test.ts src/components/us15-favorite-client.vitest.test.ts src/modules/trip-read/trip-read.vitest.test.ts src/modules/trip-read/trip-read-http.vitest.test.ts src/app/trips/trips-view.vitest.test.ts src/modules/trip-save/trip-save.vitest.test.ts src/modules/trip-save/trip-save-http.vitest.test.ts src/modules/trip-save/trip-save-client.vitest.test.ts src/modules/trip-save/trip-save-panel.vitest.test.ts
$env:US34_DEV_DB='1'
npx varlock run -- tsx --test src/modules/favorites/us34-trip-favorite.integration.test.ts
Remove-Item Env:US34_DEV_DB
```

### Exact changed files

```text
apps/web/src/app/trips/trip-favorite-button.tsx
apps/web/src/app/trips/trips-view.tsx
apps/web/src/app/trips/trips-view.vitest.test.ts
apps/web/src/app/trips/trips.css
apps/web/src/components/favorite-button.tsx
apps/web/src/components/us15-favorite-client.vitest.test.ts
apps/web/src/modules/favorites/favorites.schema.ts
apps/web/src/modules/favorites/favorites.service.ts
apps/web/src/modules/favorites/us15-favorites.vitest.test.ts
apps/web/src/modules/favorites/us34-trip-favorite.integration.test.ts
apps/web/src/modules/trip-read/trip-read-http.vitest.test.ts
apps/web/src/modules/trip-read/trip-read-service.ts
apps/web/src/modules/trip-read/trip-read.vitest.test.ts
packages/db/prisma/schema/favorite.prisma
packages/db/prisma/schema/trip.prisma
packages/db/prisma/migrations/20261015160000_us34_trip_favorite/migration.sql
docs/stories/US-34-trip-favorite.md
docs/ai-progress.md
```

## Open Questions

Figma MH-07/MH-09 visual parity remains unavailable. `/favorites` Trip group is explicitly deferred because the current page has no Trip placeholder and this task does not require that group.

## Handoff Notes

Stop after US-34. No commit/push.
