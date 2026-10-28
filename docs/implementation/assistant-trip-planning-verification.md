# Assistant trip planning — verification and handoff

Date: 2026-10-27. Baseline: `296d5097045e01d4f0ac677157595eab7c72e7c9`. Changes are uncommitted on `master`; no push, merge or deployment.

## Delivered behavior

The [story](../stories/ASSISTANT-CONVERSATIONAL-PLANNING.md) and nine [tickets](../../.scratch/assistant-trip-planning/README.md) cover conversational needs review, named/mandatory destinations, AI selection, deterministic scheduling/validation, bounded repair, unsaved edits, explicit canonical Save, history/reconciliation and shared panel/map views. The existing form planner keeps its behavior.

Runtime: `POST /api/ai/planning`. UI: **Lập hành trình cùng AI**, or a planning request in the existing composer. Open/minimize/expand never dispatches a model request automatically. The local dev server is available at `http://localhost:3010/assistant` at handoff.

## Verification receipts

| Check | Result |
| --- | --- |
| `npm run db:generate` | PASS, Prisma 7.10 client generated |
| `npm run check-types` | PASS, four workspace tasks; final receipt refreshed after implementation |
| `npm run build` | PASS, including `/api/ai/planning`; final web build repeated after final CSS/request-bound adjustment |
| Focused `vitest run` across assistant-planning, Assistant, trip-save, trip-validation and trip-planner | 43 files / 438 tests PASS; 7 opt-in tests skipped in this offline command |
| Opt-in Development PostgreSQL integration | 3/3 PASS: ownership/context, review replay/versioning, confirmed-intent retention/release, QA tombstone/replay-data scrubbing |
| Opt-in real model + Development data smoke | 1/1 PASS after a reproduced candidate-data fix; real understanding and selection, actual eligible destinations, deterministic validation; no Trip write |
| Actual localhost HTTP smoke | `/assistant` HTTP200 contains planning entry; Guest POST planning returns401/UNAUTHENTICATED with private/no-store |
| Full web Vitest run | 240 files PASS, 7 fail, 19 skip; 2,992 tests PASS, 19 fail, 150 skip, 1 todo |
| Before-task snapshot comparison | The same 19 failing tests reproduced against the baseline in an ignored source snapshot: 7 failing files / 19 failures; no task code included |
| Legacy tests run separately | Stops at one public Destination rendering expectation; same failure reproduced in baseline (18 pass / 1 fail for that file) |
| Whitespace/scope/secret review | Final `git diff --check` and scoped file review performed; no environment/credential file is part of the change |
| Browser interaction/visual QA | NOT RUN: CUA reports local browser use disabled in Work settings; no alternate driver used |

The remaining full-suite failures concern existing advanced-QA fixtures, knowledge-mode snapshots, old Admin-denial assertions in in-trip/AI-edit tests and an in-trip source audit. Admin-denial expectations conflict with the accepted RBAC V2 capability inheritance. They are not hidden or redefined as passing. Legacy Destination rendering remains a separate baseline issue. The old Assistant hook harness was extended for the newly used `useMemo`; its 12 integration cases pass.

## Standards

Independent review used root/app instructions, product/architecture, DESIGN and shared auth/idempotency standards. The final targeted verification reports no residual findings. Fixed findings include committed/UNKNOWN replay ordering, exact key/hash replay, canonical destination context, cross-day fresh validation and deletion of reviewed needs from permanent replay JSON.

## Spec

Independent review used the approved design and the nine ticket contracts. The final targeted verification reports no residual findings. Fixed findings include lost day-specific edit instructions, ambiguous mandatory requests disappearing across turns, removal disambiguation accidentally adding a stop, missing server proposal versioning, interrupted-save recovery, restored-state unlocking and QA after a saved-trip edit guard.

The reviews inspected working-tree changes plus new files against the pinned baseline; there are no feature commits to compare. Findings were fixed with regression coverage before handoff. Zero residual review findings is not a claim of exhaustive correctness or browser acceptance.

## Diagnosing-bugs feedback loops

`npx vitest run src/components/assistant/planning-client.vitest.test.ts src/modules/assistant-planning/planning-engine.vitest.test.ts` initially reproduced lost-START recovery and stale-account response defects. The client now retains immutable operation identity, routes retry by action and rejects results from invalidated sessions.

The opt-in live smoke twice reproduced `INVALID_AI_PLAN`. Safe temporary diagnostics distinguished unknown IDs, day-count mismatch and missing duration: 9 public candidates, 7 with usable duration, 0 invented IDs, correct day count, and 1 selected point missing duration. A deterministic regression failed on that exact path before the fix. AI now receives only the same usable candidate set the scheduler admits. That regression and the live smoke pass; temporary diagnostics were removed.

Review findings added tests for changed-needs edits, outstanding/removal disambiguation, server versions, committed and uncommitted UNKNOWN, terminal reconciliation failure, after-save QA and fresh cross-day route failure. PostgreSQL tests exercise actual transactions, replay records, scope and retention triggers. Task-owned synthetic users/conversations/replay rows are cleaned; existing user data is untouched.

## Reproduce focused checks

From `apps/web`:

```powershell
npx vitest run src/modules/assistant-planning src/modules/trip-save src/modules/trip-validation src/modules/trip-planner src/components/assistant

$env:ASSISTANT_PLANNING_DB_TESTS='1'
node --env-file=.env ../../node_modules/vitest/vitest.mjs run src/modules/assistant-planning/planning-postgres.vitest.test.ts

$env:ASSISTANT_PLANNING_LIVE_TEST='1'
node --env-file=.env ../../node_modules/vitest/vitest.mjs run src/modules/assistant-planning/planning-live.vitest.test.ts

$env:ASSISTANT_PLANNING_EVALUATION='1'
npx vitest run src/modules/assistant-planning/planning-evaluation.vitest.test.ts
```

The DB/live commands are opt-in, verify the known Development endpoint before writing test-owned rows and never print credentials. The live test invokes a paid configured model; it is not part of the normal offline suite. Migration preflight/status: `node scripts/assistant-planning-migration.mjs` from the repo root; `--apply` admits only this feature's migrations on the verified Development database.

## Evaluation and limits

[Synthetic evaluation JSON](assistant-trip-planning-evaluation.json) contains seven controlled requests: ready, actionable repair, relative dates, missing routing, invalid destination, provider failure and no itinerary. Initial PASS is1/7; post-adjustment PASS is2/7; failed and insufficient requests remain in the denominator. These intentionally designed fixture rates test the harness, not travel quality or model accuracy.

The baseline is the same initial AI-selected ordering before automatic repair, with the existing deterministic scheduler. It is not a full experiment in which an unconstrained LLM directly invents visit times. A thesis RQ2 study still needs a representative annotated corpus, frozen model/data/prompts, matched direct-LLM comparison, real route evidence and human/academic acceptance.

No visual/360px/mobile-focus or authenticated end-to-end browser claim is made. Real-provider accuracy over arbitrary multi-turn requests and production routing-corpus admission remain outside the single live smoke. Admission limits are per process instance, as in the existing planner; they are not a distributed quota. Production release needs its own migration/configuration verification.
