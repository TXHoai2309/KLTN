# Chat-first Assistant planning — verification

Date: 2026-10-27. Scope: approved [Q1–Q7](assistant-chat-first-planning-design.md) and [follow-up story](../stories/ASSISTANT-CHAT-FIRST-PLANNING.md). Changes remain uncommitted on `master`; no push, merge or deployment.

## Result

The Assistant captures needs through one question at a time, reviews a message recap and accepts natural confirmation to generate. It offers real destination options for add/replace requests and accepts a number/name/button. Selected-point edits are scoped, revalidated and separated from official Save. Explicit exclusions and mandatory additions survive regeneration. Other-day timing changes require separate acceptance. Cancellation restores the preceding needs, including a durable versioned rollback when REVIEW has already committed.

The needs form is removed from chat; the separate form planner retains its behavior. Planning replies and interleaved knowledge answers share transcript order. No schedule/option persistence or new migration was introduced by this follow-up.

## Verification receipts

| Check | Result |
| --- | --- |
| Focused Assistant / assistant-planning / Planner / Validator / Save Vitest suites | 44 files / **461 tests PASS**; 3 opt-in files / 7 tests skipped in this command |
| Root `npm run check-types` | **4/4 workspace tasks PASS**; final production build also completed the web TypeScript check |
| Root `npm run build` | **PASS**, including `/assistant` and `/api/ai/planning` |
| Opt-in PostgreSQL integration on verified Development | **3/3 PASS**: ownership/context, versioned review replay, confirmed-intent recovery and lifecycle retention cleanup |
| Opt-in real provider + Development data | **1/1 PASS**, exercising real needs understanding, selection/validation, shorthand **“2”** after the days question, and proactive ADD options drawn from actual eligible unused destinations; no Trip write |
| Migration status/preflight | Verified Development, `pending: []`, planning table present; no migration applied in this follow-up |
| Local HTTP smoke | `/assistant` **200**; Guest planning POST **401**, `no-store, private` |
| Design source lint for panel | **0 FAIL**, 1 accepted WARN: zero-padding is the displayed HH:mm clock |
| Whitespace/scope/secret review | `git diff --check` PASS; 65 changed/new files checked, no credential patterns, environment files, trailing whitespace or temporary debug markers found |
| Authenticated browser / screenshots / mobile / focus | **NOT RUN**: CUA inventory reports local browser use disabled in Work settings |

The earlier root build attempt caught a test fixture calling the route provider without its required AbortSignal. The fixture was corrected to forward the provider's arguments; the final build passed. This was not suppressed as a passing check.

The previous nine-ticket report records broad-suite failures that reproduced at its pre-task baseline. That full-suite baseline has not been rerun or declared fixed by this follow-up. The focused suites above include the affected Assistant/Planner/Save boundaries.

## Standards

Independent Standards review inspected the working tree against pinned baseline `296d5097045e01d4f0ac677157595eab7c72e7c9`, including new untracked planning files. There are no feature commits; an empty three-dot commit diff was not mistaken for an absence of changes. Standards sources included root/app AGENTS, product/technical contracts, DESIGN, glossary and the approved design; Fowler smells were treated as judgment calls.

Findings about stale canceled operations and blocked explicit re-additions were repaired. Further targeted review caught failure → new correction → cancel losing its original rollback snapshot. `discardRejected` now separates a rejected draft from the original retained snapshot/version. The final targeted Standards review reports **0 residual findings**.

## Spec

Independent Spec review used the approved Q1–Q7 design. Findings repaired: explicit re-addition blocked by exclusions; uniquely matched short removal names not becoming exclusions; new must-visits incorrectly reduced to preferences; canceled edits retaining mutated needs; cancellation rollback missing from durable state; and normal needs corrections lacking a pre-change snapshot. Separate timing-impact acceptance also preserves the requested scope.

Regression tests cover direct cancellation, cancellation before/after REVIEW, failure → correction → cancel → reload, and same-key recovery of an uncertain rollback without generating a new itinerary. The final targeted Spec review reports **0 residual findings**. These are bounded code reviews, not a claim of exhaustive acceptance.

## Diagnosing-bugs loop

The initial command below reproduced the user's visible symptoms: two tests failed because the form rendered and the same answer occurred twice.

```powershell
# From apps/web
npx vitest run src/components/assistant/planning-panel.vitest.test.ts
```

The reply was assigned to both the transcript and status and rendered in both places. It now appears once; needs capture uses chat prompts. Additional tight loops reproduced cancellation/reload and exclusion/must-visit failures before fixes:

```powershell
npx vitest run src/components/assistant/planning-chat-flow.vitest.test.ts src/modules/assistant-planning/planning-understanding.vitest.test.ts src/modules/assistant-planning/planning-engine.vitest.test.ts
```

The conversation suite contains 17 cases with the real scheduling/Validator boundary and controlled understanding/routing/persistence fixtures. They cover ordered questions/skips/recap, corrections, proactive choices, number selection, scoped replacement, exclusions, mandatory additions, Q&A interruptions, natural semantic confirmation, cancellation/reload, cross-day timing acceptance, duplicate selection and identical Save/rollback recovery. Named-stop filtering and scoped-edit tests exercise server functions separately. Vietnamese uppercase **Đ** was also normalized correctly after tests reproduced “Đúng rồi, tạo đi” / “Đồng ý” not reaching the current confirmation.

No temporary provider logs, private request capture or debug instrumentation was retained.

## Reproduce

From repo root:

```powershell
npm run check-types
npm run build
node scripts/assistant-planning-migration.mjs
```

From `apps/web`:

```powershell
npx vitest run src/modules/assistant-planning src/components/assistant src/modules/trip-save src/modules/trip-validation src/modules/trip-planner

$env:ASSISTANT_PLANNING_DB_TESTS='1'
node --env-file=.env ../../node_modules/vitest/vitest.mjs run src/modules/assistant-planning/planning-postgres.vitest.test.ts

$env:ASSISTANT_PLANNING_LIVE_TEST='1'
node --env-file=.env ../../node_modules/vitest/vitest.mjs run src/modules/assistant-planning/planning-live.vitest.test.ts
```

Opt-in tests verify the Development endpoint and clean their own test users, conversations and replay records. The live command invokes the configured paid provider; it is separate from the normal fixture suite. No production migration, release or manual visual acceptance is implied.

## Browser handoff

Use the [16-case manual checklist](assistant-chat-first-planning-manual-test.md) on the local Assistant. Real model coverage is a smoke test, not quality certification for arbitrary multi-turn Vietnamese or thesis RQ2 evidence. The style reference was `framed-sheet`, seed `1319196880`, keeping the existing Assistant palette/type/shell. Browser inspection and screenshot comparison remain open; no alternate driver bypassed the Work setting.

## Owner screenshot regression follow-up — 2026-10-27

The earlier browser-unavailable statement describes the prior session. This follow-up could use the in-app browser. It read the referenced chat and preserved its approved date rule: explicit deferral permits a preliminary trip, while a specific date and authoritative passing checks are required to save.

### Diagnosis and changes

- Regression assertions reproduced an unrelated AI `dateDeferred` flag skipping the date question, an empty assistant bubble for a pending message, and an impossible extracted date throwing instead of asking for clarification. The date flag now requires an explicit user statement. Invalid/past extracted dates clarify without changing needs.
- Planning messages are queued before START/ANALYZE. The composer clears synchronously; the final reply replaces its pending exchange, and a newer draft survives. The actual Assistant submit handler is covered by a delayed-response regression. Q&A routing and identical-key uncertain retries retain their existing boundaries.
- Recaps omit unknown optional fields. The understanding prompt explicitly prevents interpreting “trải nghiệm nhiều nhất có thể” as invented companions or interests. A real-provider smoke used the production PlanningClient and understanding function for the screenshot's Vietnamese sequence, without a database or routing/write calls.
- The schedule is shown before collapsible checks; repeated messages group affected destinations. Missing-date and disabled-Save explanations are visible. Map host dimensions/styles also cover loading/error states. Mobile input uses its full row.
- Per the owner's further request, Assistant reuses the existing MapLibre/Stadia component in overview-only mode. There is no day dropdown or scope switch in chat. Existing Trip controls remain available, with regression coverage.

### Verification

- Focused suite: **49 files / 500 tests PASS**, 8 opt-in skips. Command: `npx vitest run src/modules/assistant-planning src/components/assistant src/components/trip-planner src/modules/trip-save src/modules/trip-validation src/modules/trip-planner src/modules/map/itinerary-map-model.vitest.test.ts src/modules/map/itinerary-map-renderer.vitest.test.ts`.
- Root `npm run check-types`: **4/4 PASS**. Final root `npm run build`: Turbo reported **1/1 successful**, 1m17s including Next TypeScript and static generation; its Windows runner lingered after the successful receipt and was interrupted during cleanup. `git diff --check`: **PASS**.
- Real language smoke: **1/1 PASS**, 22.6s. From `apps/web`: `$env:ASSISTANT_PLANNING_LANGUAGE_TEST='1'` then `node --env-file=.env ../../node_modules/vitest/vitest.mjs run src/modules/assistant-planning/planning-language-live.vitest.test.ts`. No fixture user, conversation, Trip, or DB write.
- Browser used the actual AssistantChat/Shell/PlanningPanel/ItineraryMap and scheduler with synthetic loopback HTTP data and a local empty MapLibre style. Immediate question display/empty composer, date prompt/skip, recap, proposal, Save blocker, grouped issues, map readiness/three markers and light/dark layout were checked. The temporary harness/server were removed/stopped afterward.
- At **1440/768/360px**, document width matched viewport width; proposal scroll width matched client width (**818/737/305px**), map height was **360px**, all three markers were present, and day selectors/scope controls numbered **zero**. Mobile textarea width was **314px**. Local ignored evidence: `apps/web/.cache/planning-ux/layout.json`, `desktop.jpg`, `desktop-overview.jpg`, `mobile-overview.jpg`.
- Panel design lint: **0 FAIL**, one legitimate HH:mm `padStart` warning. No dependency, schema or migration change for this follow-up.

Limits: the browser used synthetic data, so live Stadia tiles, authenticated owner acceptance and production rollout remain unverified. The language smoke is bounded evidence, not general model-quality certification. No full-suite green claim replaces the previously recorded baseline failures. No commit, push, merge or deployment.

## Live-map comparison and automatic display — 2026-10-27

The owner compared the earlier empty-style fixture screenshot with the Trip's road-map screenshot. The empty background was a deliberate fixture style, not the application's configured Stadia style. A separate regression test also confirmed that PlanningPanel kept its map collapsed after generation. It now opens the map for every new proposal and remembers a manual collapse only for that proposal ID.

- `planning-panel.vitest.test.ts` failed before the fix because the generated panel lacked `assistant-planning-map`; it passes afterward. Focused panel/Assistant integration/shared-map tests: **5 files / 28 PASS**. Root typecheck: **4/4 PASS**. `npm run build -w web`: **PASS, exit 0**, including Next TypeScript/static generation. Whitespace check and panel design lint pass (one legitimate HH:mm warning).
- A temporary loopback viewer mounted the production PlanningPanel/ItineraryMap with the actual `map-config.ts`, actual worker assets and official Stadia style. A read-only Development inventory supplied seven currently public points, including six existing `[TEST]` records. No destination was created or modified. The proposal used the production scheduler and Stadia routing adapter, with no model, auth/session, conversation or Trip write.
- First routing attempt returned four shapes and two missing legs under the existing global deadline; no route was fabricated. A separate verification run returned **6/6 verified shapes**, normalized to **512/512/512/512/512/447** points. The browser rendered seven numbered markers, six colored road lines, actual road/place labels and Stadia/OpenMapTiles/OpenStreetMap attribution, with no day scope control.
- Browser collapse/reopen remained available. One isolated next-themes client-script warning came from the temporary viewer; no map provider failure was observed in the successful browser capture. Evidence: ignored `apps/web/.cache/planning-live-map/receipt.json` and `stadia-overview.jpg`.
- The live check establishes real routing/tile rendering on localhost. The owner's own authenticated conversation, arbitrary route-service availability, official Save and production rollout remain separate. No routing timeout, retry policy, provider configuration, credential boundary, schema or migration change.
