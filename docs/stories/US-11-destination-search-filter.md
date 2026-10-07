# US-11 — Destination search and filters

## Status

IMPLEMENTED — functional checks and scoped Figma UI refactor PASS; full acceptance remains pending representative dataset/performance evidence. Exact full-screen visual parity is not claimed.

## Epic

Public discovery

## Owner

KLTN

## Goal / User Story

Là người dùng, tôi muốn tìm kiếm và lọc điểm đến để thu hẹp kết quả theo nhu cầu khám phá của mình.

## Outcome

Public Explore searches and filters the existing Destination dataset, with shareable URL state and browser Back restoration.

## Source References

- Current task: US-11 tasks and explicit API, URL, concurrency and minimalism requirements.
- `docs/product/product-spec.md`: public exploration, search/filter and public visibility.
- `docs/architecture/technical-architecture.md`, `docs/source-baselines.md`: Next.js App Router full-stack, Prisma/Neon and thin HTTP delivery.
- `docs/flow/user-flow.md`: Explore → Destination detail → return.
- `docs/stories/US-10-home-explore.md`: accepted public list/Culture foundation.
- Figma `oomNsNYfrcjnq2FQnYLOKN`, attached `KLTN – Trợ lý AI Du lịch Hà Giang – EDU (1).fig`: current linked design inspected through MCP and browser on 2026-10-05. Desktop Explore `6:47`, Destination Card `4:145`, Input `4:60/64/68/73`, Button `4:5/7/11/17`, neutral Badge `4:33`, mobile Explore `111:3`, shared states `111:243`. Earlier access limitation is resolved for these design references. The local binary export was not fully decoded or independently compared to the current remote version.

## Dependencies

Existing Destination schema, canonical visibility predicate, public DTO, list/map UI, public detail route and shared API envelope. Baseline HEAD `9457e27`, clean branch `ThaiAnh`.

## In Scope

- Read-only keyword/category/region search; public options in the same API response.
- URL-backed form, API fetch, native cancellation, loading/empty/error/retry/clear.
- Existing detail and browser history navigation; tests and documentation.

## Out of Scope

Map implementation/provider changes, Favorites, AI/RAG, Admin CMS, full detail changes, pagination, cache, new dependencies, taxonomy tables, fuzzy search, ranking engine or external search.

## Business Rules

- Every item query and option query includes `visibility: VISIBLE` on the server, regardless of role.
- `q` searches name OR description using case-insensitive substring matching; accents are significant. PostgreSQL pattern characters `%`, `_`, and `\` are escaped for literal matching. No transliteration, stemming or ranking.
- `category` matches Destination.category exactly; `region` matches Destination.area exactly. Taxonomy values follow existing NFC/trim/collapsed-whitespace/lowercase Vietnamese convention.
- AND between q/category/region groups. Trimmed blank parameters are absent. q ≤200 characters; category/region ≤100. Duplicate/unknown parameters and invalid view values produce 400. Unknown well-formed taxonomy values yield empty results.
- Order by name ASC, id ASC. No-filter and filtered reads return all matching MVP destinations (30–50 target), without pagination. This replaces the US-10 Destination page contract per current task; Culture pagination remains independent.
- Options are sorted unique nonblank category/area strings from ALL public destinations, independent of current filters; hidden-only values never leak.
- `view=list|map` is accepted for existing Explore compatibility; API UI calls only send q/category/region. Map receives the same filtered items through existing wiring.

## Roles / Authorization

Guest, Traveler and Admin use the same public endpoint; no auth changes.

## Ownership Rules

N/A — public read only.

## UX / UI Contract

- Scoped Explore presentation follows the inspected Figma: off-white page, shared Input/Button/Card/Skeleton with local tokens, Be Vietnam Pro body and Noto Serif headings, category/region chip disclosures with native radio choices, Search and contextual Clear. Existing List/Map behavior and independent Culture content are retained; no new content-type search is implied.
- Submit commits q/category/region to URL using Next App Router `router.push`, creating a normal history entry; initial direct URL, reload and Back hydrate controls from the URL. No global memory/store.
- Existing visible detail links keep the list URL as the browser history entry. No new detail shell is needed.
- Requests begin on committed URL filter changes and on Retry. Abort and ignore completions of obsolete requests.
- Loading has accessible text/aria-busy, zero matches have a distinct status message, technical/validation failure has an alert and retry/clear recovery. Culture does not depend on Destination filtering.
- Controls and content fit ≥360px; keyboard submission/selects/buttons and visible focus.

## Data Contract

Existing schema only: id, name, description (search only), category, area, visibility, coordinates. Public item fields remain id/name/area/category/latitude/longitude. No hidden fields or description payload expansion.

## API Contract

`GET /api/destinations?q=<text>&category=<value>&region=<value>`

200: `{ success: true, data: { items: PublicLocation[], filters: { categories: string[], regions: string[] } } }` including items: [] for zero matches.

400: shared failure, code `INVALID_EXPLORE_QUERY`; 500: shared sanitized `INTERNAL_SERVER_ERROR`. All responses `Cache-Control: no-store`. Route delivery reads/normalizes query, invokes module service and maps shared response/errors; no database rules in route.

## Error / Recovery

No empty-on-failure substitution. Retry reads current URL. Clear resets unsaved form values and removes q/category/region, obsolete Destination page and unsupported destination URL keys, preserving valid view/culturePage. Invalid direct URLs retain error feedback during client hydration; Clear repairs them. API requests contain only normalized q/category/region; changing valid view or culturePage alone does not refetch Destination data.

## Write Semantics / Idempotency

N/A — read only.

## External Services

Existing Prisma/Neon; no new external service. Existing Map provider is unchanged.

## Acceptance Criteria

- [x] No-filter, keyword, individual and combined filters return exactly the public matching destinations.
- [x] Hidden matching rows/options never reach public DTOs; blank input equals no filter.
- [x] Zero results return 200/items: []; invalid/technical errors use the shared contract.
- [x] URL builds/clears/hydrates filters and survives detail → Back without a store.
- [x] Loading/empty/error/retry are distinct and obsolete responses cannot overwrite current results.
- [x] ≥360px, keyboard labels/focus and existing US-10 public Culture behavior remain intact.
- [ ] Search/filter ≤2s for ≥95% of measured MVP requests (runtime environment must be identified; no production extrapolation).

## Test Plan

node:test + assert/strict via tsx: public query semantics, both server predicates, options, invalid/technical envelopes, empty dataset; URL build/clear/hydration; transport loading/error/empty/cancellation and rendered controls/states. Regress US-10, Destination, Culture and Map. Typecheck/build/diff; read-only development runtime checks where available. Fixtures are not production data.

## Expected Modules / Files

Destination public-list service and shared search contract, Explore results/form/styles/page, destination search tests, Map compatibility tests, web test script, story and ai-progress.

## Migration Impact

None — existing area/category/visibility fields and indices suffice; no speculative index.

## Environment Impact

None.

## Implementation Sequence

1. Record this contract and write failing query/API tests.
2. Implement shared input/result contract and service with canonical visibility.
3. Write failing URL/request/UI-state tests; implement URL form and cancellable API requests.
4. Adapt existing Map collection regression tests to the unpaginated contract.
5. Run required checks, inspect diff and record acceptance limits/evidence.

## Acceptance Evidence

### 2026-10-05 — verified functional scope

- US-11 29/29, US-10 Explore 14/14, Map 23/23, Destination 61/61, Culture 26/26, authorization 21/21, account 18/18, auth UI 36/36: **228/228 PASS**. Server fixtures exercise name/description, nonmatch, individual and AND filters, matching hidden rows, hidden-only options, both query visibility predicates, blanks, unknown taxonomy, duplicate/unknown/oversized parameters, sanitized500, empty dataset and literal PostgreSQL wildcard escaping. The 50-row fixture verifies the result is not truncated.
- Client tests cover URL encoding/clear/preservation, unavailable selected option hydration, validated direct URLs, list/map/Culture request scope, no-store/signal, success-empty vs network400/500/malformed failures, cleanup, aborted old success/error and retry. Rendered HTML assertions cover labels and distinct accessible states; no new JSX source-regex tests.
- Browser smoke used the local **production build** at localhost:3001 with existing development data, Guest/no login. Enter submitted `q=Manual`, `category=văn hóa`, `region=đồng văn`; observed loading then one matching public record. Opened existing Detail and browser Back returned the exact URL and all three values. Unsaved keyword/category followed by Clear reset form values. Nonmatch produced zero-result feedback while Culture remained visible. Invalid `view=evil` remained an error after hydration; Clear recovered to Explore.
- Real network failure: stopped only the smoke server process, submitted on the existing page, observed technical error; restarted it and Retry restored results without page reload. Fixture tests cover 500 sanitization and race cancellation; a real DB outage or network response reordering was not induced.
- Responsive measurements: width/scrollWidth = 360/345, 768/753, 1280/1265; no horizontal overflow. Controls at360 were44px high. Final separate label/control markup was rebuilt and verified with exact label selectors. Viewport reset. Screenshot outside Git: `D:/KLTN/us11-evidence/explore-360.jpg`. Existing light/dark tokens/styles reused; only current dark browser theme exercised in this run.
- Read-only HTTP sample:30 sequential requests cycling no filter, q, category, region, all three, and nonmatch; warmed local production build, existing development DB with **1 public row**. p95 **84ms**, max86ms,30/30≤2s. Literal `%` query returned0; duplicate q returned400; no-store verified. **NOT PROVEN:** target performance with30–50 realistic destinations, cold starts, remote deployment or production concurrency.
- Independent Superpowers review found wildcard escaping, invalid-URL hydration and unsaved-Clear issues; each corrected. Test runner UI JSX required a test-local React shim (restored afterward); shared UI source unchanged. Initial typecheck failed stale generated Prisma/routes and missing already-declared MapLibre; restored existing dependencies/generated artifacts. A test shim typing error was fixed before final successful typecheck/build.
- No database writes, invented production data, migration, auth change, dependency declaration, lockfile change, commit or push. `db:generate` regenerated ignored Prisma client only. Existing API route and server Explore page reuse the updated service without edits. Existing Map provider/detail/Culture implementation remains intact; this turn does not accept the separate US-12 story.

### Exact verification commands

Repository root: `D:/Bai tap Code/KLTN/KLTN`

```powershell
npm run env:generate
npm install --ignore-scripts --package-lock=false
npm run db:generate
npm run check-types
npm run build
git diff --check
```

Web workspace: `D:/Bai tap Code/KLTN/KLTN/apps/web`

```powershell
npx next typegen
npx tsx --test src/modules/destination/destination-search.test.ts
npx tsx --test src/modules/destination/destination-search-client.test.tsx
npx tsx --tsconfig tsconfig.json --test src/modules/destination/destination-search-client.test.tsx
npm run test:search
npm run test:explore
npm run test:map
npm run test:destination
npm run test:culture
npm run test:authorization
npm run test:account
npm run test:auth-ui
npm run start -- --port 3001
```

The direct tsx runs include the expected initial failing stage; final script runs all pass. Browser checks use the CUA browser API, not a new test dependency. A read-only inline Node script (`@' ... '@ | node --input-type=module` from repo root) measured the30 HTTP samples described above; it created no repository file. New-file whitespace was additionally checked with `git diff --no-index --check -- NUL <each-untracked-file>`.

### Exact files added / changed

- `apps/web/package.json`
- `apps/web/src/app/explore/explore-results.tsx`
- `apps/web/src/app/explore/explore.css`
- `apps/web/src/app/explore/destination-search-form.tsx` (new)
- `apps/web/src/modules/destination/public-destination-list.ts`
- `apps/web/src/modules/destination/public-destination-query.ts` (new)
- `apps/web/src/modules/destination/destination-search-client.ts` (new)
- `apps/web/src/modules/destination/destination-search.test.ts` (new)
- `apps/web/src/modules/destination/destination-search-client.test.tsx` (new)
- `apps/web/src/modules/map/map.test.tsx` (adapted to the current collection contract)
- `apps/web/src/modules/culture/public-culture-list.test.tsx` (moved empty-state assertion into rendered state tests)
- `docs/stories/US-11-destination-search-filter.md` (new)
- `docs/ai-progress.md`

## Open Questions

- BLOCKED: FIGMA frame/token access; existing styles fallback authorized by prior task.
- Production Destination dataset completeness and supported taxonomy vocabulary remain unproven; options derive only from actual public rows, no fabricated locations.
- Actual production p95 performance is not established by fixture tests or local development measurements.

## Handoff Notes

No commit/push. Preserve US-10 Culture pagination and existing auth/Map/detail architecture.

## 2026-10-05 — Figma UI refactor evidence

Scope: US-11 presentation only, on the existing uncommitted implementation. API/service/Prisma/auth/visibility/normalization/AND semantics/AbortController/history helpers were not changed in this UI task. No dependencies, migration, DB writes, commit or push.

Design inspection succeeded after resolving the actual frame IDs: get_design_context returned desktop Explore 6:47 code and screenshot, and Destination Card 4:145 code and screenshot. Read-only use_figma inspected component fills, borders, radii, spacing, fonts, mobile 111:3 and feedback 111:243. Initial calls against page IDs returned no selection; no Figma content was modified. The local .fig archive is not independently version-verified against the linked remote document.

Implemented:
- Scoped #f7f6f2 page, #24513b brand, #dde3de border, #f1f3ef media/skeleton surface; Be Vietnam Pro and Noto Serif self-hosted through next/font. Search Input uses the component's 48px height, 10px radius and existing Lucide Search icon. Focus, disabled and aria-invalid styles are scoped, without changing shared primitives globally.
- Region/category use the desktop chip pattern (40px, radius16); native details/summary plus labelled radio groups. Selection closes the disclosure and returns focus to summary. Form draft is local; committed q/category/region remain URL source of truth. Submit/Enter semantics unchanged; Clear appears only with active draft filters, and error/empty recovery can clear committed filters.
- One canonical DestinationCard reuses shared Card/CardContent and semantic Link to the existing detail. Desktop component geometry:330px at1440, media330:210, padding16, radius16, title22px; mobile follows350:92 media, padding14, title18px and title before metadata. Grid1/2/3 columns; no fixed height truncating long content.
- PublicLocation does not include image or excerpt. The component's neutral media slot explicitly says 'Chưa có ảnh'; no stock/sample image, invented summary, sample destination, schema field or API expansion was introduced. This prevents exact parity with photographed desktop sample cards. Header/Home/Culture/Map/full Detail redesigns and content-type chips are outside this task.
- Loading reuses shared Skeleton with card geometry and accessible text; committed filter refetch keeps controls visible. Initial streaming fallbacks are presentation only, with no extra client request. Empty success: 'Không tìm thấy điểm đến phù hợp.' plus Clear when filtered. Technical error: sanitized Vietnamese message, alert, Retry and contextual Clear.
- Figma accent #b85e3c is4.46:1 on white for small text; metadata uses minimal text-only adjustment #b65d3b (4.55:1). Body muted text #66716b is5.07:1 on white. These are color-pair calculations, not a full WCAG audit.

Verification:
- Final test:search31/31, test:explore14/14, test:map23/23 PASS (68 total). Updated hydration assertions for radio selection; added contextual Clear/empty action and canonical detail-link/text-escaping tests. Initial expected test-first failures were followed by PASS. Loading test needed a test-local classic JSX React shim after shared Skeleton was introduced; shared UI source was not changed.
- npm run check-types and npm run build PASS; git diff --check PASS. No lint script exists in root/web manifests.
- Browser: existing development dataset, Guest, dev3002 and final production build3001. q=Manual/category=văn hóa/region=đồng văn returned one public row; detail then Back restored exact URL, input and checked radios. Enter submits; Enter opens category and Space selects its radio, then focus returns to summary. Nonmatch is distinct successful-empty with Culture still visible; Clear removes committed params and resets values.
- Width/scrollWidth at360/390/768/1024/1440:360/345,390/375,768/753,1024/1009,1440/1425 in the dev browser (scrollbar gutter included). Grid1/1/2/3/3 columns, input48px, card widths305/335/323.84/285.08/330px. Final production360 measured360/360. Dropdown selection was exercised at360. No horizontal overflow observed; no physical touch-device or full assistive-technology audit claimed.
- Final production failure probe stopped only the owned smoke-server session, submitted q=Manual on the loaded page, and observed the technical error with controls/Culture retained. Restarted the same production build and clicked Retry: one public card returned at the same /explore?q=Manual URL without F5. Cleared filters afterward; viewport reset.
- Screenshots outside Git: D:/KLTN/us11-ui-evidence/explore-1440.jpg, explore-360.jpg, error-production-360.jpg. Visual comparison checked fonts, colors, control/card geometry, mobile wrapping and state treatment against inspected Figma. Not a pixel-diff equality claim.

## 2026-10-07 — Task 144 browser-history regression hardening

- Explore search/filter submissions and List/Map changes now use Next App Router `router.push(..., { scroll: false })`; no `replace`, custom Back interception or storage was added. Same-URL Retry still reruns the current request. The exact reported return-to-Home symptom did not reproduce on this checkout before the change; the mixed native `pushState` and App Router `Link` history handling was the identified risk and is now consistent.
- Regression coverage exercises the combined q/category/region URL, push (not replace) semantics, canonical Destination detail href, remount/reload URL hydration, List/Map preservation including `culturePage`, and independent Culture query/request state.
- Real browser smoke from Home: `/` → `/explore` → `/explore?q=Manual&category=v%C4%83n+h%C3%B3a&region=%C4%91%E1%BB%93ng+v%C4%83n` → `/destinations/cmutr90km00015o9w4t64ozfd` → Back returns to the exact filtered URL and controls/results; Forward returns to detail; Back again restores filtered Explore. Reload restored the same URL/input/chips/result. List/Map preserved q/category/region and `culturePage=1`; Culture remained visible.
- Regression checks: test:search 32/32, test:explore 14/14, test:map 24/24, test:destination 61/61 PASS. `npm run check-types` PASS after aligning typed-route usage. Build/diff results are recorded in this task's progress entry.
- No schema/migration change, mutation, database write, commit or push.

Files touched in this UI task:
- apps/web/src/app/explore/destination-search-form.tsx
- apps/web/src/app/explore/destination-card.tsx (new)
- apps/web/src/app/explore/layout.tsx (new, scoped fonts)
- apps/web/src/app/explore/explore-results.tsx
- apps/web/src/app/explore/explore.css
- apps/web/src/app/explore/page.tsx
- apps/web/src/app/explore/loading.tsx
- apps/web/src/modules/destination/destination-search-client.test.tsx
- apps/web/src/modules/culture/public-culture-list.test.tsx
- docs/stories/US-11-destination-search-filter.md
- docs/ai-progress.md

Commands (root unless specified):
- npm run check-types
- npm run build
- git diff --check
- apps/web: npm run test:search
- apps/web: npm run test:explore
- apps/web: npm run test:map
- apps/web: npm run dev -- --port 3002 (temporary browser check, stopped)
- apps/web: npm run start -- --port 3001 (production browser check; restarted for Retry probe)

Acceptance: scoped UI/search/filter/state/responsive regression PASS. NOT PROVEN: identical local-export/remote version; pixel-perfect full Explore; photographed cards/real summaries without public media/excerpt data; realistic30–50 production dataset and deployed/cold/concurrent p95. Earlier functional evidence is retained above as historical evidence; earlier FIGMA BLOCKED statements are superseded by this section.
