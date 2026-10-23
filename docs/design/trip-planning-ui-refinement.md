# Trip planning UI refinement — 2026-10-23

## Approved scope

Owner approved Q1–Q5 and then explicitly requested implementation with
ui-ux-pro-max, visual polish with design-taste-frontend and final review with
impeccable. Scope is the six supplied screenshots, all of `/trips/new`: Describe,
Supplement, Review, Ready to generate and the two selected days of a proposal.
Existing forest/cream palette, fonts, navigation, business services, auth, APIs,
dates, validation, confirmation/save gates and retry semantics remain authority.

UI source: DESIGN.md Trip-specific entries, US-24–30 and actual implementation.
Old global scaffold snapshots are historical. Exact Figma parity is not claimed.
Provider migration is a separate accepted decision; this task does not replace
map/routing implementations or change provider credits independently of them.

## Direction and component ownership

The task is an Operate surface. The question is: what does the traveler need to
provide, review or correct before the next action? The product-specific spine is
the four-stage needs-to-itinerary sequence, followed by the actual numbered
destination timeline. It stays visible while decorative hierarchy recedes.

ui-ux-pro-max searches: required-field indicators, submission feedback, field
labels, focus not obscured and React label association. Search output is advisory;
it does not replace project invariants or introduce another palette/font system.

design-taste-frontend app draw selected `framed-sheet` over `achromatic-ledger`:
flat surfaces and a single subtle boundary fit the incumbent form better than
financial-ledger styling. Explicit brief exceptions: keep existing cream/green,
serif heading family and application header; no new L-frame/sidebar, neutral-only
rebrand, chart, fabricated metric or changed business step is introduced.

Token path: existing `trip-form.css` tf colors/themes → route-scoped
`trip-planning-layout.css` composition and embedded planner semantic adapter →
the current shared editor and planner components. DESIGN.md records intent;
CSS remains the runtime authority. Other routes are outside the adapter scope.

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Date | VietnameseDateInput / StartDateEditor | date-only.ts; approved typed date contract | form / review instance | editor regression + browser |
| Form | TripRequirementForm / shared TripFieldEditors | existing schemas and server evaluate/check | structured / extracted / inline review | US-24–27 tests + browser |
| Toast | existing Sonner provider / completeTripSave | US-30 confirmed write contract | confirmed save | planner/save regression tests |
| Scrollbar | existing global styles; normal document scroll | current application shell | no new scroll owner | responsive browser measurements |
| CRUD | TripConfirmationSection / TripSavePanel | current server preview, save state and idempotency modules | pending / FAILED / UNKNOWN / SUCCESS | existing save suites; no live write |

Select/Listbox and Table Selection are not introduced or modified in this flow.

Existing reusable owners remain: FlowTabs; all seven field editors;
TripReadinessStatus; TripSummaryBar; ItineraryDayTabs/StopCard/ValidationPanel;
DestinationPreviewCard; ItineraryMap; TripConfirmationSection and TripSavePanel.
No duplicate form, map, date, validation or save implementation was created.

## Findings and implementation

- **Critical:** no confirmed Critical finding in the reviewed scope.
- **High:** review narrow-screen columns; shared editor duplicate IDs; unreadable
  mobile badges; dock collision risk. Stack review, scope editor IDs/radio groups,
  keep important metadata at 12px+, and move mobile actions into document flow.
- **High:** preserve one visible primary task, explicit acknowledgement and disabled
  save explanations. Existing confirm/check/save functions and guards are unchanged.
- **Medium:** unify form/planner hierarchy and semantic color mapping; relabel
  completeness as supplied information; replace misleading readiness heuristics in
  helper copy; convert summary shortcuts to native buttons and section navigation.
- **Medium:** retain keyboard focus after summary shortcuts, honor reduced motion,
  expose duration selection with aria-pressed, and place interests legend correctly.
- **Medium:** use canonical option labels and consistent Lucide icons, including
  mobility enum keys. The interest counter describes selected interests rather
  than suggesting eight available choices. Bounds/values are unchanged.
- **Polish:** remove raised nested field surfaces, repeated empty-source badges,
  button gradients/glows, and excess header height. Show full destination prose
  through a disclosure while preserving actual preview details and links.

## Verification and limits

The local fixture mounts production components with synthetic repository, route,
extraction and evaluate/check adapters. It has an explicit test banner, local
MapLibre background style and self-hosted application fonts from `.next`. It is
not a production route and never imports into runtime application code. Browser
traffic is restricted to loopback in the automated test.

Commands from `apps/web`:

```powershell
# Start the isolated fixture (test-only server-only stub registration).
node --import tsx --input-type=module -e "import {registerHooks} from 'node:module'; registerHooks({resolve(s,c,n){return n(s==='server-only' ? new URL('./src/test/server-only-stub.ts',import.meta.url).href : s,c)}}); await import('./scripts/trip-planning-ui-fixture.mts');"
# PLAYWRIGHT_MODULE_DIR points to an existing installed Playwright package.
node scripts/test-trip-planning-ui.mjs
```

The browser matrix covers 1440/768/390/360px, Light/Dark and reduced motion;
Describe, Supplement, inline Review editor, Review, Ready and both generated days.
It checks document and input overflow, duplicate IDs, one visible h1, editor focus,
font loading, minimum badge size, acknowledgement, missing-date save blocking,
day switching, the manual path and analysis-error input recovery.

Final results are recorded below after verification. No live authentication,
database write, paid AI/routing request, real tile authorization, physical-device
touch or screen-reader acceptance is inferred from this fixture. Existing service
regressions separately cover confirmed writes and UNKNOWN recovery.


## Final evidence

- Root `npm run check-types`: PASS, four tasks. Root `npm run build`: PASS,
  including the final UI changes. No dependency, schema or migration changes.
- Final relevant Vitest: **474 PASS / 2 FAIL**, 36 files. Both failures are the
  unchanged `trip-theme.vitest.test.ts` expectations for old form CSS literals
  (`form background/card/text...` and `error/warning feedback...`). Their tested
  `trip-form.css` and test file are unchanged from HEAD (`git diff --quiet` exit 0),
  so these remain baseline debt. Excluding that unchanged 13-case file yields
  **463/463 PASS**, including the three new shared-editor accessibility cases.
- Final browser acceptance: **60 captures PASS** with the matrix and recovery
  cases above. Eight review-editor cases also assert enabled Cancel text contrast
  at least 4.5:1 in both themes. Physical touch and screen readers were not used.
- design-taste-frontend rendered inspector: **0 FAIL**, two explained warnings:
  the owner-pinned cream ground and 12px utility/metadata density. The final source
  lint has **0 FAIL / 43 WARN**: 30 matches are `box-shadow: none` resets, six
  eyebrow-class references are hidden in the route adapter (retained markup can
  serve standalone variants), and seven numbers describe real ordered stages or
  information groups. These are not reported as unexamined failures or waivers.
- Impeccable review found inherited pale dark-mode Cancel text and excess border
  emphasis; corrected through existing tokens and verified. Radius/color
  advisories were resolved by reusing tf radius tokens and semantic color mixes.
  Final detector output is `[]`, saved in `trip-planning-impeccable-review.json`.
- Scoped premium strict audit: **0 findings**, saved in
  `trip-planning-premium-audit.json`. `designmd lint DESIGN.md`: zero errors,
  four pre-existing Admin RAG orphan-token warnings; no unrelated token rewrite.
- `git diff --check`: PASS. Final receipts and screenshots are local ignored
  evidence under `apps/web/.cache/trip-ui/` and `.cache/trip-ui/` at repo root.

The fixture's blank local map style is deliberately synthetic. Its render proves
component layout, markers and controls, not live basemap/routing correctness.
No saved Trip, account, database, auth boundary, provider behavior, API, idempotency
or business state machine was changed. Concurrent Assistant launcher/provider
changes present in the working tree were preserved and are outside this task.
No commit, push, merge or deployment was performed.
