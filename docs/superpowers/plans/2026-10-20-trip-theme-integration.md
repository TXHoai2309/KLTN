# Trip theme integration — audit, plan and evidence

Source: user attachment `26b956c0-b9ac-4a21-80f5-6a868164fffd`. Preserve current design, branch ThaiAnh and prior uncommitted US-30/31 work. No dependency/provider/storage key, database/schema/migration, API or Trip business change.

## Audit
- One global Providers → ThemeProvider (next-themes, already installed), class attribute, default system, enableSystem and disableTransitionOnChange. Default storage key `theme`; pre-paint initializer and html suppressHydrationWarning already present. Header supports all three choices.
- Existing semantic background/card/foreground/muted/border/input/ring/destructive tokens in shared UI globals. HTML color-scheme already tracks resolved global theme.
- Browser RED: html dark/color-scheme dark, but /trips/new shell rgb(247,246,242), card white, text rgb(29,37,33). Form CSS has no theme adaptation. Planner dark styles incomplete for feedback, skeleton, badges, controls and map overlay. Other Trip screens already have matching dark styles, so audit rather than rewrite them.
- ItineraryMap and ManualLocationPicker include style in mounting effect dependencies; theme recreates maps. Reuse current map instance with setStyle and stable effect inputs. Existing DestinationMap demonstrates this pattern.
- Browser tool advertises viewport/visibility only; OS color-scheme emulation is unavailable. Verify current System preference and manual overrides in browser; test actual pre-paint script with simulated OS preferences. Live OS switching must be NOT VERIFIED unless a supported mechanism becomes available. No OS setting change or browser mutation hacks.

## Task 1 — Theme surfaces
1. RED browser computed styles plus targeted CSS tests for key surfaces/statuses.
2. Preserve Light literals using native light-dark() with existing global semantic tokens for Dark; keep fixed brand fills and on-brand white text. No new palette/context. Fix Planner's remaining surfaces/text and native controls.
3. Verify browser computed color/contrast, all form steps and existing screens; capture Light/Dark and viewport matrix.

## Task 2 — Map lifecycle
1. RED renderer tests demand style switching without map/marker recreation, camera changes or disposed access.
2. Add minimal setStyle method to existing renderers; use current style refs and separate theme effects in existing components. Do not change coordinates, routing or APIs.
3. Run renderer/legacy map tests and live planner marker/map preservation check.

## Task 3 — Regression and evidence
1. Test real global provider SSR initializer under System/Light/Dark preferences (no new theme implementation). Browser navigation/reload, draft text/selection preservation and no extra business requests.
2. Targeted theme/UI/Trip/map tests, full suite, legacy, typecheck, build, diff check.
3. Fresh final review, update ai-progress and this evidence ledger. No commit/push/branch change.

## Ledger
- Initial dirty tree is the preceding US-30/31 implementation; all prior work retained. Theme-only files distinguished in final report.

### Implementation and TDD
- PASS: form CSS now adapts surfaces/text/borders/focus/error/warning to existing semantic tokens. Light values retained in light-dark() first arguments; no size, spacing, typography, breakpoint or Hero redesign. CSS AST comparison against the initially clean HEAD styles checked 1,029 form and 723 planner declarations with no Light/geometry difference (new theme-only aliases excluded).
- PASS: explicit CSS color-scheme boundary on `.trip-shell` / `.dark .trip-shell` is necessary for Lightning CSS's compiled light-dark helper variables. It follows the existing global class; it does not introduce theme state or initialization JS.
- PASS: planner badges, loading, controls, overlay and feedback use adaptive colors. Standalone regeneration error/progress get a local alias to existing `--card`, since they can be siblings of `.planner-page`. Selected-day helper text uses dark ink on the pale Dark accent.
- PASS: map renderers expose a minimal guarded setStyle; React theme effects reuse the same renderer, markers, camera and selection. Latest style ref also handles asynchronous library mounting. Existing routing, coordinates, endpoints and business state unchanged.
- PASS TDD: initial theme/map run 4 failed / 10 passed before implementation; manual-picker extension failed for missing setStyle. Standalone error, active-day helper contrast and floating-progress alias each had a failing assertion before their CSS fix. Final fresh read-only reviewer identified progress alias issue, now covered/fixed; no other important finding.

### Browser evidence — localhost:3010
- PASS: all five routes inspected in Light/Dark using real signed-in owned Trip `cmvetgw4s0001a0k5cytvczml`; My Trips/detail/edit/in-trip already supported the theme and needed no source rewrite.
- PASS: 50 responsive cases = five routes × two themes × widths 360/390/768/1024/1440; document scrollWidth == clientWidth, no measured control clipping. Captures and computed colors inspected; no breakpoint changes. Viewport reset afterwards.
- PASS: natural-language text, manual date/duration/vehicle/interests/note survive theme changes. Real generated proposal, selected stop, four-group Validator text and Save eligibility remain equal across theme changes. Edit AI textarea and selected Destination/proposal also retained. No Save/Update/Delete/Complete action clicked.
- PASS: observed HTML class/color-scheme and actual surfaces follow manual choices; manual Light overrides current OS Dark. System resolves current OS Dark, including navigation and reload. Browser warnings/errors empty after the 50-case matrix; no hydration warning observed. Bounded dev-server log observation during theme-only actions showed no new AI/Validator/Save/Update requests.
- PASS unit evidence: six actual next-themes pre-paint script cases cover System Light/Dark, manual preference overriding opposite OS, and absent preference. This verifies the existing initialization script, not a replacement implementation.
- NOT VERIFIED: live OS Light↔Dark media switching and manual Dark against a live OS Light. Browser only exposes viewport/visibility, not color-scheme emulation; no system settings or injected matchMedia mutation used. First-paint flash has script evidence but no frame-by-frame live recording.
- NOT VERIFIED: every injected network FAILED/UNKNOWN/error scenario in browser; in-trip HAS_REMAINING/manual picker live state (owned fixture has no remaining visits). Existing service/UI tests and renderer tests cover their relevant contracts; no live E2E claim for those states.
- Evidence directory outside repo: `C:/Users/Admin/.codex/visualizations/2026/10/05/01a10ada-9f55-7b53-82be-58318bebb2fe/trip-theme-evidence/`. `responsive.json` stores all 50 measurements. Images: new/proposal/my-trips/detail/edit/in-trip Light and Dark pairs.

### Final commands and results
From repo root:
```powershell
npm run check-types
npm run build
npm test
git diff --check
```
From `apps/web`:
```powershell
& ../../node_modules/.bin/vitest.cmd run --config vitest.config.mts src/components/trip-planner/trip-theme.vitest.test.ts
& ../../node_modules/.bin/vitest.cmd run --config vitest.config.mts src/app/trips src/components/trip-planner src/modules/map src/modules/trip-requirement src/modules/trip-validation src/modules/trip-save src/modules/trip-read src/components/in-trip
npm run test:map
npm run test:legacy
```
- PASS: final targeted 411 passed / one opt-in PostgreSQL integration skipped; includes all 13 theme tests. Map legacy 41 passed; full legacy 336 passed. Typecheck 4/4; build 1/1; git diff whitespace check exit0.
- FAILED: root npm test, 2,640 passed / six failed / 135 skipped / one todo. Same six baseline files: in-trip-validation, replan-http, us35-location-source-audit, us36-test, preference-extraction-env, ai-edit-http. Failures concern existing Admin expectations, static href guard and model sensitivity; these files unchanged in this task. Root script stops before legacy on Vitest failure, so legacy was run separately above.
- NOT VERIFIED: opt-in DB integration deliberately not enabled for this frontend-only task. No schema/migration/DB command or Trip save/update/delete/completion action performed; proposal generation used the existing flow. No dependency/provider/storage key/API change; no branch change/commit/push.

### Files changed in this task only
1. `apps/web/src/app/trips/new/trip-form.css` — adaptive form/review surfaces and color-scheme boundary.
2. `apps/web/src/components/trip-planner/trip-planner.css` — adaptive planner/feedback colors; standalone surface aliases.
3. `apps/web/src/components/trip-planner/itinerary-map.tsx` — theme updates existing map.
4. `apps/web/src/components/in-trip/manual-location-picker.tsx` — same for existing manual pin picker.
5. `apps/web/src/modules/map/itinerary-map-renderer.ts` — guarded style update.
6. `apps/web/src/modules/map/maplibre-renderer.ts` — guarded pin-picker style update.
7. `apps/web/src/modules/map/itinerary-map-renderer.vitest.test.ts` — same-map/marker/camera/disposal regression.
8. `apps/web/src/modules/map/map-location-picker.test.ts` — style/coordinates/callback/disposal regression.
9. `apps/web/src/components/trip-planner/trip-theme.vitest.test.ts` — theme/bootstrap/CSS regression.
10. This plan/evidence ledger.
11. `docs/ai-progress.md` — task summary.
