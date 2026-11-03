# TC-01 — Publication form review fixes

Date: 2026-10-28. Owner explicitly requested fixing the three findings from the TC-01 code review. Scope is the publication form and its regression coverage; no TC-02 work or server/schema/migration change.

## Defects and cause

1. UNKNOWN retained only an idempotency key while request construction read the editable draft. Input/image callbacks could change the retried request.
2. Submitting the edit form called Publish directly, bypassing the required Guest preview.
3. An asynchronous preview result had no draft identity check; an edited draft could be published while an older preview was displayed.

The previous review already reproduced these paths, so this follow-up skipped speculative diagnosis and established a permanent failing regression loop before changing production code.

## Fix

- The edit form submits to Preview. Publish confirmation exists in the preview flow and also checks that a successful current preview snapshot is present.
- Each input change invalidates the reviewed snapshot and pending preview identity. Outdated preview successes/errors/finalizers cannot replace the current view or clear a newer request's loading state.
- Confirmation creates one complete attempted request containing Trip ID, normalized reviewed draft and idempotency key. Pending/UNKNOWN retries use that snapshot, not editable state.
- Inputs, image handlers and edit-tab actions reject changes while an attempt is pending/UNKNOWN; handlers enforce this even if their callbacks were captured before the UI lock.
- A known FAILED releases the attempt, preserves the input and requires a new preview before a fresh attempt/key. Unexpected write uncertainty remains UNKNOWN.
- Confirmed SUCCESS remains confirmed while navigating and rejects further confirmation callbacks. Editable hooks live in a keyed child instead of below the existing-publication conditional branch.

## Regression seam

`publication-form-flow.vitest.test.ts` bundles the actual component, shared schemas, client adapter and mutation transport in memory. Only React's hook runtime, visual/Next dependencies and fetch responses use an offline harness. Tests invoke the actual handlers and inspect actual serialized request bodies/headers. No HTTP server, user account, live database or provider is involved.

Seven scenarios:

1. Edit-form submit makes only a preview request; confirmation publishes exactly the reviewed fields.
2. UNKNOWN retains identical body/key despite stale title/image/edit-tab callbacks.
3. Editing while a preview is pending prevents the old result from being accepted.
4. Editing after preview rejects a stale confirmation callback and requires another preview.
5. Image changes during pending cannot alter the later retry payload.
6. Known failure preserves the draft and a corrected, reviewed attempt uses a new key.
7. Rapid double confirmation and callbacks after confirmed success do not send duplicate requests.

## Commands and results

From `apps/web`:

```powershell
node ../../node_modules/vitest/vitest.mjs run --config vitest.config.mts src/components/trip-companions/publication-form-flow.vitest.test.ts
```

After correcting the harness setup, this command failed **7/7 on the original form** for the actual old behavior: direct publish instead of preview, unlocked UNKNOWN editing, stale preview accepted, changed retry image/body, stale confirmation and duplicate post-success submission. It passed **7/7 after the fix**.

```powershell
node ../../node_modules/vitest/vitest.mjs run --config vitest.config.mts src/modules/trip-companions src/components/trip-companions src/app/trips/trips-view.vitest.test.ts src/modules/trip-save src/modules/trip-read
```

Final related regression: **14 files passed / 129 tests passed, 2 files / 11 PostgreSQL tests skipped**. Existing Save failure fixtures deliberately log simulated DB errors; their assertions passed. The existing static-render assertion was updated for the preview-first button, and the new handler suite carries the recovery/confirmation assertions previously missing from static coverage.

From repository root:

```powershell
npm run check-types --workspace web
$env:KLTN_PERF_BUILD='1'
npm run build --workspace web
git diff --check
```

Web typecheck **PASS**. Isolated local production build **PASS**, Next 16.3.8: compile 35.7s, TypeScript 18.4s, 48/48 static pages generated; publication page and APIs registered. Default `.next` development output is separate from this build. Whitespace check **PASS**.

## Limits and handoff

This is actual-handler/offline transport evidence, not authenticated Next browser or visual/mobile acceptance. No DB integration tests or Development/Production migration status were rerun for this FE-only change; the previously reviewed backend and migration hashes are unchanged. No live publication was created. No credentials/environment files, new dependencies, commit/push/merge/deploy or TC-02 implementation. Existing unrelated workspace edits were preserved.

This report supersedes earlier blanket claims that the static UI/client suites alone proved UNKNOWN payload retention or the complete preview-confirm interaction. Browser/product acceptance remains a separate check.
