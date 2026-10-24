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
| Dialog | TripReviewDialog / native dialog | existing TripReviewScreen and check contract | bounded modal, narrow single-column list | native focus/Escape/close/read-cancellation browser checks |
| Toast | existing Sonner provider / completeTripSave | US-30 confirmed write contract | confirmed save | planner/save regression tests |
| Scrollbar | existing global styles; document and native review modal | current application shell | bounded modal only while reviewing | responsive browser measurements |
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

## 2026-10-24 amendment — two steps and review popup

Owner approved removing the dedicated description and review steps. This
supersedes the four-stage presentation above: open structured inputs directly,
keep AI entry as an optional disclosure, submit to a review modal, then enter the
existing planner after authoritative check and acknowledgement. TripReviewDialog
is the presentation owner; TripReviewScreen, field editors, readiness/check and
save services remain canonical. No new UI kit or business decision engine.

The modal uses the existing tf palette/radii, compact editable rows, 44px close
control, a bounded viewport and native top-layer behavior. Tab/Shift+Tab remain
inside; Escape cancels an active editor first, otherwise closes the modal.
Closing restores the opening control and saved edits; reopening clears the
acknowledgement. Pending read checks abort on dismissal. Review/check errors
stay in the modal and allow retry; they never unlock the planner. Planner Back
returns to the populated form. Missing dates still prevent official save.

Revalidated after the owner stabilized the checkout: 284 focused tests plus
36 save regressions PASS; root production build and typecheck PASS. Browser
fixture: 61 captures PASS across 1440/768/390/360px, light/dark, reduced motion,
including native modal bounds/inertness/focus, editor cancellation, dismissal,
retained edits, re-acknowledgement, failed/pending checks, planner recovery and
missing-date save gate. Synthetic auth/repository/routing only; no live DB/auth,
paid provider, physical touch or screen-reader acceptance. Full suite not run;
the previously documented unchanged theme snapshot file remains excluded.

Scoped form premium audit and Impeccable component scan: zero findings. Broader
planner audit still flags the native date prompt versus the recorded typed-date
owner, and CSS scan notes three literal colors in the existing planner image
placeholder; those concurrent planner changes were preserved outside this task.
Taste inspector warnings about approved cream, metadata size and unequal
form/sidebar heights are contextual, not new modal failures. Closed AI content
is explicitly hidden to keep layout/visibility probes aligned with disclosure
state. Receipts: `.cache/trip-ui/resumed-*` and `apps/web/.cache/trip-ui/`.

Final handoff: explicit closed-disclosure styling verified with a fresh fixture
after production compilation (avoiding font files being regenerated during
fixture startup). Browser 61/61 PASS; Taste rendered inspector 0 FAIL / 3
contextual WARN; final production compilation PASS and `git diff --check` PASS.
Latest receipts use `.cache/trip-ui/handoff-*` and
`apps/web/.cache/trip-ui/handoff-modal-browser-final.log`.

## 2026-10-24 PO decision — Collapsible AI helper and direct proposal for manual entry

Product Owner overrides the earlier design with two key requirements to streamline the form:

1. **Collapsible AI helper (`.trip-ai-accordion`):**
   - The AI natural-language input is closed by default inside a `<details className="trip-ai-accordion">` element positioned immediately below the required fields block.
   - Clickable full-width card with subtle border, rotating chevron indicator (`transform: rotate(180deg)`), explanatory subtitle "Gõ một câu, AI điền giúp bạn", and toggle text "Mở" / "Đóng".
   - Upon successful AI extraction, the accordion automatically collapses while relevant optional collapsible sections containing filled suggestions (personalization, special notes) automatically expand.

2. **Direct proposal step transition for manual form entry:**
   - Manual form submission bypasses the intermediate `TripReviewDialog` review modal entirely.
   - Form submission performs a single authoritative server check (`/api/trip-requirements/check`), removing the duplicate `/evaluate` pre-check.
   - If the draft is valid and confirmable (`confirmable: true`), `confirmDraft` is called and the user transitions directly to the proposal step (`planner`), enabling a 2-step / 1-click creation workflow.
   - `TripReviewDialog` is retained strictly for:
     (a) AI-assisted entry with at least one unreviewed AI-applied field (`status === "APPLIED"`).
     (b) Non-confirmable drafts or clarification requests returned by the server, opening directly at the first error field (`initialEditingKey`).
   - If user unassigns/dismisses all AI fields, the draft is treated as manual entry (bypassing the modal).

3. **Date synchronization and save gates:**
   - Departure date minimum uses Vietnam calendar date `vietnamDateOf(new Date())`.
   - Preliminary proposals without a departure date display numbered relative days ("Ngày 1, Ngày 2").
   - Departure date selected in the proposal step synchronizes back to the parent form state (`onUpdateStartDate`).
   - Planner "Quay lại" action returns to the form with all field values intact.
