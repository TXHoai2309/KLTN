# Origin review fixes — 2026-11-04

Owner explicitly requested fixing the review findings. This is implementation of the scoped review fixes, not a claim that all ten vertical tickets or live acceptance are complete.

## Changes

- Shared origin picker now submits Nominatim search only by button/Enter, selects an unconfirmed result, confirms through the existing server validation, displays OSM attribution and keeps manual fallback. Abort/stale-result fencing prevents an old search from replacing a later selection. Confirmed selections preserve their source.
- Clearing the label no longer passes an invalid empty string into a throwing schema parser. Editing coordinate text invalidates confirmation; pin callbacks use current props rather than mount-time closures. Validation response fencing prevents an old pin confirmation from restoring superseded data.
- Shared journey editor supports the conditional return-only departure clock and preserves it in Assistant and saved-trip modals. Saved Trip and Assistant pass known return-only context. A preliminary brief can reveal the extra clock input when the return-only shape is not known yet.
- Journey apply freezes an exact candidate/revision/trip/key snapshot. UNKNOWN retains it and disables editing/closing/cancel; retry reuses the identical body and key. Known failure releases it for a new intent; an in-flight ref prevents duplicate rapid applies. No server write contract was weakened.
- Fixed frontend contract drift (OriginSelection, null clocks, picker props), restored boundary/travel-only presentation exports, and connected origin operation/presentation in Assistant and proposal views. Read-only proposal copies no longer expose a second Save action.
- Corrected malformed synthetic test fixtures to actual shared contracts and fixed async transport tests that previously returned an async function without executing their assertions.

## Evidence and limits

- Focused Vitest: 18 files PASS, 125 tests PASS, 15 opt-in PostgreSQL tests SKIPPED. Covers origin module, picker/review/saved views, Assistant origin/panel, journey presentation and edit/search transports.
- After fixing the false-positive async test callbacks, edit transport suite independently rerun: 4/4 PASS.
- Root typecheck: four tasks PASS. No schema or migration change in this fix; shared database migrations remain unapplied by this task.
- Actual React components in isolated Edge harness PASS: clear-label, no search on typing, explicit search/select/confirm, retained NOMINATIM source, return-start edit, 390px controls, UNKNOWN edit/close locks and byte-identical body/key retry. Test HTTP and map failure are fixtures, not live Nominatim/Stadia/auth/database acceptance. Harness is reusable as `node scripts/test-origin-review-fixes.mjs` from the web application.
- Screenshot inspected under ignored web cache; standalone harness lacks the complete application shell/theme. It is interaction evidence, not full product visual acceptance.
- Existing Trip list suite separately remains failing (5/8) because its next/navigation mock lacks useSearchParams; do not claim a full green repository suite. This list-test mock is outside the scoped origin fix.
- Production webpack build outside sandbox PASS: 56 generated pages, TypeScript and tracing completed; existing Varlock dynamic dependency warning remains. Default Turbopack build still fails creating its evaluation worker.
- Turbopack build fails creating its evaluation worker, including outside sandbox; webpack fallback used for production build verification. In-sandbox webpack also hit font DNS/write restrictions; rerun outside sandbox with reviewed approval.
- No product DB writes, migration apply, live provider calls, push/merge or deploy. Unrelated working-tree changes preserved.
