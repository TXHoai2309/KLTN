# Destination Admin UX V3 — implementation and QA report

2026-10-14. Owner local acceptance pending. All approved implementation checkpoints are delivered; database integration acceptance is blocked by the local Docker runtime. No claim of fully proven live write acceptance.

```text
TASK=DESTINATION_ADMIN_UX_V3
IMPLEMENTATION_STATUS=IMPLEMENTED; QA_PARTIAL; OWNER_LOCAL_ACCEPTANCE_PENDING
BRANCH=TXH
REMOTE_BASELINE_AT_PHASE0=8b5ff486267fd66fd6a8418005d8b02b13b49d8c
VALIDATION_HEAD=b91f9c797546cf3aed4fb09a8fa643345cd6c660
REMOTE_TXH_BEFORE_COMMIT=b91f9c797546cf3aed4fb09a8fa643345cd6c660
INITIAL_WORKTREE=9 modified/1 untracked pre-existing paths preserved; unrelated changes excluded from the V3 commit
R1_AREA=IMPLEMENTED; server default; legacy preserved; generic area excluded from proximity bonus
R2_CATEGORY=IMPLEMENTED; six Destination categories; unchanged legacy retained; Culture taxonomy independent
R3_DESCRIPTION=IMPLEMENTED; deterministic summary; legacy unchanged unless description changes; shared preview
R4_ADDRESSKIT=IMPLEMENTED; server adapter/search/TTL/fallback; LIVE_READ_PASS; address text only
R5_GEOGRAPHIC_SCOPE=HIDDEN_FORM; relations preserved
R6_MAPS_RESOLVER=IMPLEMENTED_V3; explicit coordinates/safe redirects; server recheck; no Places live
R7_PRICE=HIDDEN_FORM_AND_PUBLIC; stored values preserved
R8_CULTURE_FLAG=OFF; public redirects; navigation/Explore/detail/favorites/loading hidden; legacy API/code/data retained
R9_SOURCES=IMPLEMENTED; title/HTTPS URL; stable child IDs; explicit owned deletion
PATCH_SEMANTICS=PASS_OFFLINE_SERVICE_AND_BROWSER; POSTGRES_NOT_PROVEN
LEGACY_DATA_PRESERVED=PASS_FIXTURE_SNAPSHOTS; main region read confirmed; no shared-DB writes
DATABASE_MIGRATION=NONE; packages/db schema/migrations unchanged; no db push
TRIP_PLANNER_REGRESSION=PASS_OFFLINE_US24_28; LIVE_GOOGLE_ROUTES_NOT_TESTED
RAG_COMPATIBILITY=PASS_OFFLINE; IDs/provenance/schema/ingestion untouched; no live OpenAI call
CULTURE_DATA_PRESERVED=No data/service/API deletion; existing legacy regression suites PASS
CREATE_DRAFT_BEHAVIOR=PASS_REAL_SERVICE_WITH_TEST_PERSISTENCE; main-app authenticated write NOT_TESTED
BROWSER_QA=11/11 isolated Chromium groups PASS; main3010 anonymous/read-only checks PASS
TYPECHECK=PASS; npm run check-types (4 tasks)
TEST_RESULTS=Full Vitest forks1129PASS/0FAIL/80SKIP; legacy328PASS/0FAIL/0SKIP; browser11 groupsPASS
BUILD=PASS; npm run build; local build only
DIFF_CHECK=PASS; CRLF warnings only
BLOCKERS=Docker Desktop startup failure; disposable PostgreSQL not available
REMAINING_RISKS=Real PG transactions/live Admin3010/Routes acceptance pending; environment-specific registry; process-local limiter/cache; default Windows test command failure noted below
MANUAL_TEST_STEPS=See checklist below
DEPLOY_STATUS=NOT DEPLOYED
```

## What is implemented

Create success opens the saved Admin Edit route; Edit success remains editable with the confirmed DTO/baseline and feedback. The same DestinationForm owns Create/Edit with four sections, native category select, one prose input, read-only generated summary and a shared simplified preview. Minimum duration remains an independent optional input per the locked Product contract. Existing aliases/media/ticket/geography/Culture/visit-note data are preserved.

V3 carries changed fields only and an optional expectedUpdatedAt concurrency check. The original protected endpoints remain. Unchanged parent/child rows are not updated; changed sources retain IDs, and changed schedules retain day IDs/unchanged interval IDs. Legacy payloads also reconcile retained children. V3 creation is HIDDEN with seven UNKNOWN days and nullable independent durations. A valid URL never approves a source. New sources have UNKNOWN rights; changing an existing source URL clears only that source's former rights/reviewer metadata because it is different evidence. RAG provenance remains separate.

Protected reads/mutations opt into child IDs with `X-KLTN-Form-Version: V3`; requests without it retain the legacy HTTP response shape. V3 input rejects manual coordinates, verification, role and visibility fields. Legacy Admin coordinate/taxonomy contracts remain available for compatibility. Stored idempotent responses are checked before external resolution, so exact retries are not dependent on provider availability.

Maps accepts explicit query/q point coordinates on supported search URLs, or a single unambiguous !3d/!4d pair on a place URL. Camera @, name searches, Place-ID-only and conflicting/invalid coordinates do not produce a location. Short URLs use HTTPS exact hosts/path checks, DNS public-IP checks with pinned lookup/family, TLS verification, no credentials/cookies, four redirects,5s deadline, bounded headers and no HTML scraping. Resolver admission is process-local12/actor/minute with a bounded map; it is not a distributed limiter. Current URLs/coordinates are preserved on Edit if unchanged. No Google Places adapter/key/billing is activated.

AddressKit calls fixed server URLs, validates Tuyên Quang08, caches6h with single-flight, bounds response500KB/time5s and searches Vietnamese with/without accents. Its administrative list does not prove old Hà Giang tourism coverage. Only text is persisted, commune code stays in the entry session; legacy addresses are not converted. A live server-adapter read for `ha giang` returned available=true/count2.

Culture presentation and ticket prices are OFF in one config. Public Culture list/detail redirect to Explore before data retrieval; loading/error surfaces do not reveal the module. Home cards remain balanced with two cards. Culture admin pages/services/APIs/models/relations, favorite records and RAG knowledge remain. Publication is separate and does not require every visible informational region to be routable.

## Registry and live data boundary

READ ONLY verification pinned URL and `neon.endpoint_id` to Development `ep-purple-pond-b3xujb8o`, database neondb. It found Đồng Văn region `cmv7kc5eu0003209w9ggzpolq`, VISIBLE, category công viên địa chất. No record named Cột cờ Lũng Cú was returned; POI tests use explicitly synthetic fixtures, not a live Lũng Cú claim.

Only that verified environment/ID is registered. It remains visible/public but is excluded from new Planner candidates. Unknown environments fail closed; further regions/environments require reviewed IDs. No name/category heuristics or backfill. Runtime Google Routes remains unchanged, US24–28 flow retained. Generic area is not treated as a locality cluster for ordering. There is no persisted Trip model/save API to test: SKIP — not implemented.

## Executed verification

| Check | Result and scope |
|---|---|
| `npm run check-types` | PASS4 configured tasks |
| `npm run build` | PASS local optimized build, no deployment |
| `npm run test --workspace web` | FAIL as executed: existing Blob SDK5s timeout and Windows native threads exit3221225477; not labelled PASS |
| `npx vitest run --config vitest.config.mts --pool=forks` | Final PASS1129, FAIL0, SKIP80;72 suites passed/8 PG suites skipped |
| `npm run test:legacy --workspace web` | PASS328, FAIL0, SKIP0 |
| Unchanged Blob SDK suite alone | PASS8/8; full forks rerun also passed; no unrelated test altered |
| New scoped V3 unit/service tests |55 tests, included in full counts; fixture rollback/ownership/preservation, not real PostgreSQL |
| New V3 PostgreSQL integration |9 SKIP, included in80; guarded disposable loopback only |
| Existing PostgreSQL integration |71 SKIP, included in80 |
| Browser harness |11/11 groups; actual production component/service + TEST in-memory adapter |
| Main3010 Guest APIs |401 for Create/Patch/Visibility/Maps/Address; no writes |
| Main3010 browser |Create→login preserving returnTo; Culture→Explore; no Culture nav/anchor; existing region detail renders with old ID/content/coords, price/related Culture hidden |
| Premium strict audit |FAIL1 pre-existing `content-profile-editor.tsx` textarea finding in untouched legacy editor; no broad out-of-scope change |
| `git diff --check` |PASS |

Docker Desktop was started for the authorized disposable tests but crashed at the dockerInference socket initialization. No factory reset, settings change, Production connection, shared Development write, container/database workaround or migration was attempted. PG rollback/FK/SQL acceptance is still NOT PROVEN. All fixture writes are disposable in-memory writes. Main3010 is the existing authenticated application, with no added runtime simulation mode. The agent's IAB session was Guest; authenticated main-app saves were not performed. Live Routes/provider/corpus/screen-reader acceptance is not claimed.

Checkpoint evidence: CP1 Destination63+V3 core9; CP2 combined Maps/Planner109; CP3 AddressKit7; CP4 flag+legacy regressions; CP5 full counts above. Checkpoint counts overlap and must not be added together.

## Browser evidence and manual localhost:3010 checklist

Harness: `node --import tsx scripts/test-destination-v3-ui.mjs` from apps/web. It extends the established Admin UI harness pattern and blocks non-loopback browser requests. Eleven groups cover removed inputs/four sections/no overflow360/390/768/1440, inline validation/focus including exact invalid opening-time focus, camera rejection, stale URL result, app-owned unsaved dialog/Escape, preview, double-submit/HIDDEN/public exclusion, legacy/address-provider failure snapshot, UNKNOWN exact retry and native select/light-dark evidence.

Screenshots use TEST data: [desktop](../../apps/web/.cache/destination-v3/edit-1440-light.png), [mobile](../../apps/web/.cache/destination-v3/edit-390-light.png), [dark mobile](../../apps/web/.cache/destination-v3/edit-390-dark.png). Logs/audit and before-worktree snapshot are ignored local files under apps/web/.cache/destination-v3.

1. Sign in as Admin on http://localhost:3010. Open `/admin/destinations/new`; confirm four sections and removed area/coordinates/pin/price/geography/Culture inputs.
2. Choose one approved category; enter one description; inspect derived summary/preview. Use an actual Google Maps link containing verified point coordinates. Camera-only/name links should show a specific unsupported message.
3. Try invalid fields/HTTPS source; error should be adjacent and focus the first invalid control. Change Maps URL rapidly; only the latest result should remain. Resolver rechecks on save.
4. Choose commune and optional detail, or retain plain text. Provider failure should preserve the address. No district is shown as a current administrative level.
5. Create only a deliberate test record with your own verified data. It must be HIDDEN/Admin-only, never automatically public. Publication is a separate action.
6. On a legacy record, inspect full data first; no-change Save should retain identity/metadata. A description-only edit should change the derived summary and leave coordinates/area/category/price/relations/media/sources/hours intact. Changed unresolved Maps URL must fail rather than overwrite position.
7. Rename an existing source with unchanged URL; ID/reviewer metadata should remain. Changing URL explicitly invalidates that source's old approval. Removing a source is an explicit owned operation. No arbitrary URL is fetched.
8. Cancel unsaved edits, confirm Stay/Escape, then inspect flag-OFF Home/Explore/detail/favorites and `/culture` redirect. Legacy Culture admin URLs/APIs remain; no data deletion.
9. Verify US24→28 and both transport modes using your authorized provider configuration. Đồng Văn region should remain discoverable but not appear as a direct waypoint. No live provider success is assumed from offline tests.
10. When Docker is repaired, rerun `node apps/web/scripts/test-qa-postgres.mjs --full` for real disposable PG acceptance; no new authorization is needed for that already-approved scope. Never repoint tests to Neon/Production.

## Worktree preservation and task files

Original dirty Culture page test, Detail CSS, PublishedProfile CSS and US28 documents/untracked report remained byte-identical. Header, DestinationDetail and PublishedContentProfile retained existing content with scoped flag wrappers; progress history was appended without rewriting its original prefix. No secrets/env/package/schema files were changed. Before the owner requested delivery, origin/TXH was rechecked at the validation HEAD above.

Task files (delta from the captured working tree; pre-existing unrelated dirty paths are excluded):
- `D:/KLTN/KLTN/apps/web/scripts/audit-destination-v3-regions.mts`
- `D:/KLTN/KLTN/apps/web/scripts/test-destination-v3-ui.mjs`
- `D:/KLTN/KLTN/apps/web/src/app/admin/destinations/destination-address-field.tsx`
- `D:/KLTN/KLTN/apps/web/src/app/admin/destinations/destination-form.tsx`
- `D:/KLTN/KLTN/apps/web/src/app/admin/destinations/destination-maps-field.tsx`
- `D:/KLTN/KLTN/apps/web/src/app/admin/destinations/destination-v3-form-model.ts`
- `D:/KLTN/KLTN/apps/web/src/app/admin/destinations/destination-v3.css`
- `D:/KLTN/KLTN/apps/web/src/app/api/admin/destinations/[id]/route.ts`
- `D:/KLTN/KLTN/apps/web/src/app/api/admin/destinations/[id]/visibility/route.ts`
- `D:/KLTN/KLTN/apps/web/src/app/api/admin/destinations/address/route.ts`
- `D:/KLTN/KLTN/apps/web/src/app/api/admin/destinations/resolve-maps/route.ts`
- `D:/KLTN/KLTN/apps/web/src/app/api/admin/destinations/route.ts`
- `D:/KLTN/KLTN/apps/web/src/app/culture/[slug]/error.tsx`
- `D:/KLTN/KLTN/apps/web/src/app/culture/[slug]/loading.tsx`
- `D:/KLTN/KLTN/apps/web/src/app/culture/[slug]/not-found.tsx`
- `D:/KLTN/KLTN/apps/web/src/app/culture/[slug]/page.tsx`
- `D:/KLTN/KLTN/apps/web/src/app/culture/error.tsx`
- `D:/KLTN/KLTN/apps/web/src/app/culture/loading.tsx`
- `D:/KLTN/KLTN/apps/web/src/app/culture/page.tsx`
- `D:/KLTN/KLTN/apps/web/src/app/destinations/[id]/destination-detail.tsx`
- `D:/KLTN/KLTN/apps/web/src/app/explore/explore-results.tsx`
- `D:/KLTN/KLTN/apps/web/src/app/explore/loading.tsx`
- `D:/KLTN/KLTN/apps/web/src/app/explore/page.tsx`
- `D:/KLTN/KLTN/apps/web/src/app/favorites/favorites-view.tsx`
- `D:/KLTN/KLTN/apps/web/src/app/home.css`
- `D:/KLTN/KLTN/apps/web/src/app/page.tsx`
- `D:/KLTN/KLTN/apps/web/src/components/admin/admin-content-preview.tsx`
- `D:/KLTN/KLTN/apps/web/src/components/admin/admin-form-shell.css`
- `D:/KLTN/KLTN/apps/web/src/components/admin/admin-form-shell.tsx`
- `D:/KLTN/KLTN/apps/web/src/components/admin/use-unsaved-changes.ts`
- `D:/KLTN/KLTN/apps/web/src/components/header.tsx`
- `D:/KLTN/KLTN/apps/web/src/components/published-content-profile.tsx`
- `D:/KLTN/KLTN/apps/web/src/components/user-menu.tsx`
- `D:/KLTN/KLTN/apps/web/src/lib/destination-client.ts`
- `D:/KLTN/KLTN/apps/web/src/lib/mvp-features.ts`
- `D:/KLTN/KLTN/apps/web/src/modules/content-profile/content-profile-contract.ts`
- `D:/KLTN/KLTN/apps/web/src/modules/content-profile/content-profile-service.ts`
- `D:/KLTN/KLTN/apps/web/src/modules/culture/culture.test.ts`
- `D:/KLTN/KLTN/apps/web/src/modules/culture/public-culture-list.test.tsx`
- `D:/KLTN/KLTN/apps/web/src/modules/destination/__fixtures__/v3-store.ts`
- `D:/KLTN/KLTN/apps/web/src/modules/destination/address-contract.ts`
- `D:/KLTN/KLTN/apps/web/src/modules/destination/addresskit.ts`
- `D:/KLTN/KLTN/apps/web/src/modules/destination/addresskit.vitest.test.ts`
- `D:/KLTN/KLTN/apps/web/src/modules/destination/culture-mvp.vitest.test.ts`
- `D:/KLTN/KLTN/apps/web/src/modules/destination/destination-categories.ts`
- `D:/KLTN/KLTN/apps/web/src/modules/destination/destination-http.ts`
- `D:/KLTN/KLTN/apps/web/src/modules/destination/destination-routing-registry.ts`
- `D:/KLTN/KLTN/apps/web/src/modules/destination/destination-safe-write.ts`
- `D:/KLTN/KLTN/apps/web/src/modules/destination/destination-service.ts`
- `D:/KLTN/KLTN/apps/web/src/modules/destination/destination-v3-contract.ts`
- `D:/KLTN/KLTN/apps/web/src/modules/destination/destination-v3-service.ts`
- `D:/KLTN/KLTN/apps/web/src/modules/destination/destination-v3-service.vitest.test.ts`
- `D:/KLTN/KLTN/apps/web/src/modules/destination/destination-v3.postgres.integration.vitest.test.ts`
- `D:/KLTN/KLTN/apps/web/src/modules/destination/destination-v3.vitest.test.ts`
- `D:/KLTN/KLTN/apps/web/src/modules/destination/destination.test.ts`
- `D:/KLTN/KLTN/apps/web/src/modules/destination/maps-url-resolver.ts`
- `D:/KLTN/KLTN/apps/web/src/modules/destination/maps-url-resolver.vitest.test.ts`
- `D:/KLTN/KLTN/apps/web/src/modules/destination/public-destination.test.ts`
- `D:/KLTN/KLTN/apps/web/src/modules/destination/short-description.ts`
- `D:/KLTN/KLTN/apps/web/src/modules/trip-planner/planner-candidates.ts`
- `D:/KLTN/KLTN/apps/web/src/modules/trip-planner/planner-engine.ts`
- `D:/KLTN/KLTN/apps/web/src/modules/trip-planner/planner-runtime.ts`
- `D:/KLTN/KLTN/docs/ai-progress.md`
- `D:/KLTN/KLTN/docs/implementation/admin-content-contract.md`
- `D:/KLTN/KLTN/docs/stories/DESTINATION-ADMIN-UX-V3.md`

- `D:/KLTN/KLTN/docs/implementation/destination-admin-ux-v3-report.md`

- `D:/KLTN/KLTN/DESIGN.md`

- `D:/KLTN/KLTN/docs/design/admin-forms-profile-ui.md`

- `D:/KLTN/KLTN/docs/design/admin-forms-premium-ui.json`
