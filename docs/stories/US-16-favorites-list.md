# US-16 — Danh sách và quản lý Yêu thích

## Status

IMPLEMENTED — US-16 scoped acceptance verified with disposable development fixtures, 2026-10-05. READY contract was completed before code. Broader add-favorite/product rollout is not claimed.

## Epic

Traveler personal content.

## Owner

Current implementation session; no commit/push.

## Goal / User Story

Là Du khách, tôi muốn xem và quản lý các điểm đến và nội dung văn hóa đã yêu thích để truy cập lại nhanh các nội dung mình quan tâm.

## Outcome

Traveler-only list, original-object navigation and confirmed relation removal.

## Source References

- Current user-supplied US-16 contract (Destination + Culture only).
- Product document.docx: LD-07, MH-10, YCCN-19/20/21, NT-32/34; roles, ownership and write confirmation. Local source inspected through DOCX XML.
- System Specification.docx: 4.1 purpose, 4.2 Traveler access, 4.3 relation-only removal/duplicates, 4.4 original-object navigation, 4.5 hidden/unavailable; local source inspected.
- Figma remote `oomNsNYfrcjnq2FQnYLOKN`, MH-10 `7:158`, cards `7:174/181/188`: design context and screenshot inspected directly. No static image assets in returned frame; accent strips are native gradients.
- AGENTS, accepted architecture, US-09/13/11, shared authorization and mutation contracts.

## Dependencies

Baseline HEAD `343628a` (done us11), clean working tree. Destination/Culture visibility enums and canonical predicates, Better Auth persisted role guard, Prisma/Neon, shared idempotency and UI components exist. Favorite model/API/UI and public Culture detail do not exist.

## In Scope

- Minimal Favorite relation, private list/delete APIs, two functional groups, original links, loading/empty/error/unavailable/pending states.
- Minimal original Culture read-only page with server public visibility enforcement; no full Culture detail story.

## Out of Scope

Trip favorites, add-favorite flow (separate story), Map/AI/Trip redesign, pagination, sorting controls, bulk actions, folders, caching, global state, new dependencies, snapshot copies.

## Business Rules

One user/target relation; exactly one Destination or Culture FK. Hidden targets remain in history with title only, no summary or detail link. Removing a relation never removes its target.

## Roles / Authorization

Canonical requireActor + traveler permission on page/API/service. Guest 401 (page redirects with returnTo), Admin 403/access denied, no inheritance. Recheck persisted role within delete transaction.

## Ownership Rules

Database list WHERE userId = trusted actor.id. Database DELETE WHERE id AND userId; missing/foreign IDs identical 404. No client-supplied identity. Private no-store responses.

## UX / UI Contract

Reuse shared Header, Button/Card/Empty/Skeleton. Scoped Noto Serif 600 and Be Vietnam Pro, page #f7f6f2, surface white, text #1d2521/#66716b, border #dde3de, primary #24513b. Title 36px; pills 44px; cards radius20/padding18/shadow0 5px16 .05; accent strip36px; actions44px/radius10. Responsive grid1/2/3 at mobile/tablet/desktop; controls wrap, content can grow for long text. Culture adapts same shell. No dead Trip tab. Header's existing visual treatment preserved.

Two local-state group buttons with aria-pressed and labelled section; keyboard focus, semantic headings, actual Links/buttons. Loading retains title/groups, accessible skeleton status. Independent empty messages; technical error safe message + Retry. Unavailable retains title/remove with no open action. Pending is card-local. SUCCESS removes card; FAILED and UNKNOWN retain card with recovery; UNKNOWN retries exact key and favorite ID.

## Data Contract

Favorite(id, userId, destinationId?, cultureId?, createdAt): FK user Cascade, targets Restrict, unique(userId,destinationId), unique(userId,cultureId), CHECK exactly one target. No taxonomy/media/trip fields. DTO {favoriteId,targetId,title,availability,href}; no hidden body. Supporting copy is UI description of relation, not fabricated target summary.

## API Contract

GET /api/favorites, no query/body identity, shared {success:true,data:{destinations:[],cultureContents:[]}}. Stable createdAt DESC/id ASC. Each item availability AVAILABLE|UNAVAILABLE and original href or null.

DELETE /api/favorites/[favoriteId], no body/query, same-origin + Idempotency-Key required. apiMutationResult data {favoriteId}; shared SUCCESS/FAILED/UNKNOWN, 401/403/404/400 as appropriate, UNKNOWN503. Both endpoints Cache-Control private,no-store.

## Error / Recovery

Read error distinct from empty/unavailable, Retry refetches. Delete failure/unknown retains card, safe feedback. Original detail rechecks public visibility on every navigation; no stale favorite authorization bypass.

## Write Semantics / Idempotency

executeIdempotentWrite actor scope favorite:remove, input {favoriteId}; relation delete and success record atomic. Same key/request replay. Native existing mutation client, no optimistic removal; duplicate-click ref lock.

## External Services

Existing Neon and Better Auth only; Figma used for design inspection.

## Acceptance Criteria

- [x] Traveler reads only own Destination and Culture favorites; Guest/Admin denied.
- [x] Hidden targets stay UNAVAILABLE, title only, href null.
- [x] Available targets open original public pages; hidden detail cannot be opened via stale links.
- [x] Foreign/missing removal returns identical404; removal affects relation only.
- [x] SUCCESS only updates card; FAILED/UNKNOWN retain, UNKNOWN same-key retry.
- [x] Two groups, independent empty states, loading/error/retry and card-local pending accessible.
- [x] No horizontal scroll at360/390/768/1024/1440; MH-10 visual baseline applied.

## Test Plan

node:test/assert/tsx service/API tests for ownership, visibility, empty, denied roles, relation-only deletion, idempotency; client transport/outcome and rendered state tests. Development DB integration for FK/check/uniqueness/removal if target verified. Browser responsive/navigation/states where authenticated fixtures possible.

## Expected Modules / Files

Favorite schema + migration, favorite contract/service/server/HTTP/client/tests, /api/favorites handlers, /favorites UI/layout/CSS, shared UserMenu link; minimal /culture/[id] page and culture read service. Package test script; this story + ai-progress.

## Migration Impact

Additive relation table only. Review SQL, verify development endpoint before apply. No db:push, production changes or existing content edits.

## Environment Impact

No new variables/dependencies.

## Implementation Sequence

1. Story + failing tests.
2. Schema/migration/client generation, service/API ownership and mutation rules.
3. Client outcomes + original Culture read shell.
4. Figma UI/navigation/states.
5. Tests/types/build/migration/runtime checks and evidence update.

## Acceptance Evidence

### Acceptance matrix

| Requirement | Result | Evidence |
| --- | --- | --- |
| Own Destination favorites | PASS | Owner-constrained Prisma query; deterministic test + real DB + live HTTP |
| Own Culture favorites | PASS | Same owner query, separate cultureContents group; deterministic + DB + live HTTP |
| Empty dataset/groups | PASS | Valid empty DTO and rendered tests; browser removed final Destination while Culture remained, then removed final Culture |
| Hidden Destination remains | PASS | UNAVAILABLE/title-only/null href in service, DB and browser |
| Hidden Culture remains | PASS | Same rule; browser hidden card removal succeeded |
| No hidden original link/detail leak | PASS | DTO null href; card no Link; canonical public detail predicate tests and hidden Culture live body check |
| A never reads B | PASS | WHERE userId at DB level; fixtures A/B, live own DTO excludes B favorite |
| A cannot remove B | PASS | Scoped deleteMany; missing/foreign identical NOT_FOUND404, live DELETE404 |
| Relation-only delete | PASS | No target delegates written; actual DB verifies Destination/Culture/other owner's relation retained |
| SUCCESS only updates UI | PASS | confirmedRemoval transport tests + browser pending/disabled then card removed after confirmation |
| FAILED keeps card | PASS | Unit tests; externally removed disposable relation produces404 and browser keeps stale card with recoverable message |
| UNKNOWN keeps card/retries key | PASS | Shared transport test asserts same ID/key; browser stopped only owned3002 server, retained card/uncertainty across group switches, restarted and retried successfully; mounted refs preserve key |
| Guest denied | PASS | Service/API tests, real DB, live HTTP401; browser redirect /login?returnTo=%2Ffavorites |
| Admin denied | PASS | Persisted role checks, API/service tests + real DB + live HTTP403; no admin inheritance |
| Responsive/keyboard | PASS | Browser360/390/768/1024/1440 measurements below; Space/Enter group buttons, semantic links and pending disabled buttons observed |
| Loading/read error/Retry | PASS | Actual loading AX status, read-only test proxy injecting only GET favorites500; safe error retained title/groups, Retry restored data without reload |
| Exact shared Header vs Figma | NOT PROVEN | Existing Header intentionally reused; its styling/height differs from MH-10 and was outside redesign scope |
| Production user dataset/add-to-list flow | NOT PROVEN | No add-favorite flow exists in baseline; no fake permanent favorites or production records created |
| Separate Chrome + Edge / assistive-technology suite | NOT PROVEN | Current IAB browser tested; no independent Edge/NVDA run or full WCAG claim |

### Checks and runtime evidence

- New deterministic suite: **15/15 PASS**; guarded development DB integration **1/1 PASS**, no skipped tests in explicit DB run.
- Regression suites: auth-ui36, account18, authorization21, destination61, culture26, Explore14, search31, Map23: **230/230 PASS**. Total **246 tests PASS** including new tests and DB integration.
- Root check-types PASS (all4 configured packages); root build PASS, including dynamic /favorites, /api/favorites, /api/favorites/[favoriteId], /culture/[id]. git diff --check PASS.
- Independent Superpowers review: no critical/important findings. Initial review did not independently exercise mounted card events; subsequent browser evidence covers pending, UNKNOWN/group switch/retry, FAILED and successful removal. Transport assertions prove retry key equality, not a browser network capture of a lost response after commit.
- Development target verified: NODE_ENV=development and accepted endpoint prefix ep-purple-pond-b3xujb8o. SQL reviewed: one new table, three FKs, two unique indexes, exactly-one-target CHECK; no existing data rewrite/drop. Applied with Prisma migrate dev; migrate status reports7 migrations/up to date. Production DB untouched.
- Browser measurement width/client/scroll:360/345/345,390/375/375,768/768/768,1024/1024/1024,1440/1440/1440. Grid columns1/1/2/3/3. Scrollbar accounts for15px mobile difference. No horizontal overflow. Current browser theme's existing Header is preserved.
- Real HTTP probes against local dev3001 and local production build3002 (both development DB): Guest401, Admin403, own groups200, hidden title-only, foreign deletion404, hidden Culture body absent. Original Culture opened successfully; original Destination opened successfully after correcting disposable fixture schedules to canonical seven UNKNOWN days. Initial invalid fixture triggered existing detail validation/error, not a product code change.
- Screenshots outside Git: D:/KLTN/us16-ui-evidence/favorites-1440.jpg, favorites-360.jpg, unknown-keeps-card.jpg, failed-keeps-card.jpg, read-error-360.jpg, empty-destinations.jpg, empty-culture.jpg. Screenshot card text is disposable fixture content, not production destination data.
- Runtime fixtures A/B/Admin, their sessions/accounts, Favorite/target rows and idempotency records were cleaned. Test manifest containing temporary credentials removed. Test account logged out, browser viewport restored, temporary test tabs/owned3002 server/read-only3004 proxy closed. Existing user dev server3001 preserved.

### Exact commands run

From repo root unless noted:

```powershell
npm run env:generate
npm run db:generate
npm run db:migrate --workspace @KLTN/db -- --name add_favorites
npm run test:favorite --workspace web
npm run test:auth-ui --workspace web
npm run test:account --workspace web
npm run test:authorization --workspace web
npm run test:destination --workspace web
npm run test:culture --workspace web
npm run test:explore --workspace web
npm run test:search --workspace web
npm run test:map --workspace web
npm run check-types
npm run build
git diff --check
git status --short
git diff --name-only
git ls-files --others --exclude-standard
```

DB workspace:

```powershell
npm run db:generate
npx prisma migrate diff --help
npx varlock run -- node -e "const u=new URL(process.env.DATABASE_URL); console.log(JSON.stringify({nodeEnv:process.env.NODE_ENV,developmentEndpoint:u.hostname.startsWith('ep-purple-pond-b3xujb8o')}))"
npx prisma migrate diff --from-schema (Join-Path $env:TEMP 'kltn-us16-baseline-343628a') --to-schema prisma/schema --script --output prisma/migrations/20261005120000_add_favorites/migration.sql
npx prisma migrate status
```

The baseline schema directory was populated using git show HEAD:packages/db/prisma/schema/{auth,culture,destination,idempotency,schema}.prisma. CHECK was added to generated SQL before apply. No db:push.

Web workspace:

```powershell
npx tsx --test src/modules/favorite/favorite.test.ts
npx tsx --test src/modules/favorite/favorite-client.test.tsx
npx tsx --test src/modules/culture/public-culture-detail.test.ts
npx next typegen
npm run check-types
$env:US16_DEV_DB='1'
npx varlock run -- tsx --test src/modules/favorite/favorite.integration.test.ts
Remove-Item Env:US16_DEV_DB
npm run start -- --port 3002
```

Temporary runtime harness commands (harness removed after cleanup): npx varlock run -- tsx scripts/us16-runtime-smoke.mts setup / probe / repair-fixture / simulate-failed / cleanup, each mode invoked separately. Read-only fault proxy: node D:/KLTN/us16-ui-evidence/proxy.mjs, controlled read-mode.txt error/healthy. Servers terminated through their owned execution sessions.

Initial failing commands: three test-first runs failed because implementation modules did not yet exist; first migration-diff invoked from root could not resolve workspace DATABASE_URL and was rerun in DB workspace; next typegen at root could not find app and was rerun in web; initial typecheck before route type generation and later test-stub PrismaPromise type mismatch were fixed. Temporary .ts harness top-level await failed under web CJS, renamed .mts. Final checks above pass. No secrets printed.

### Exact changed files (30)

```text
apps/web/package.json
apps/web/src/components/user-menu.tsx
apps/web/src/app/api/favorites/route.ts
apps/web/src/app/api/favorites/[favoriteId]/route.ts
apps/web/src/app/favorites/page.tsx
apps/web/src/app/favorites/layout.tsx
apps/web/src/app/favorites/loading.tsx
apps/web/src/app/favorites/error.tsx
apps/web/src/app/favorites/favorites-view.tsx
apps/web/src/app/favorites/favorites.css
apps/web/src/app/culture/[id]/page.tsx
apps/web/src/app/culture/[id]/not-found.tsx
apps/web/src/app/culture/[id]/error.tsx
apps/web/src/modules/favorite/favorite-contract.ts
apps/web/src/modules/favorite/favorite-service.ts
apps/web/src/modules/favorite/favorite-server.ts
apps/web/src/modules/favorite/favorite-http.ts
apps/web/src/modules/favorite/favorite-client.ts
apps/web/src/modules/favorite/favorite.test.ts
apps/web/src/modules/favorite/favorite-client.test.tsx
apps/web/src/modules/favorite/favorite.integration.test.ts
apps/web/src/modules/culture/public-culture-detail.ts
apps/web/src/modules/culture/public-culture-detail.test.ts
packages/db/prisma/schema/favorite.prisma
packages/db/prisma/schema/auth.prisma
packages/db/prisma/schema/destination.prisma
packages/db/prisma/schema/culture.prisma
packages/db/prisma/migrations/20261005120000_add_favorites/migration.sql
docs/stories/US-16-favorites-list.md
docs/ai-progress.md
```

## Open Questions

- No add-favorite flow exists: real favorites depend on upstream add story/import. Tests use disposable fixtures, never production sample favorites.
- Local .fig vs remote version equivalence not independently proven; this implementation uses the directly inspected remote node.

## Handoff Notes

Header navigation now includes a direct `Yêu thích` link to `/favorites`; the existing Traveler-only UserMenu link remains as a secondary entry point. Server-side Traveler authorization continues to protect the page for Guest/Admin users.

No commit or push. Preserve existing Explore/UI implementation.
