# Companion recruitment UI and Host itinerary save investigation

## Scope and sources

Task attachment: `25431bfc-a3c0-4733-8a0f-13943c42077d/Pasted text.txt`.
Baseline: Product travel-companions extension, ADR-23, companion design Q6 and delivery contract; US-32 edit/preview/apply contract. Google testing document could not be opened by the web tool. The two referenced screenshots were not attached to this request.

## BUG-01: Fixed; local close/reopen verified

Verified source cause: closed recruitment selected `companion-primary-button`, which has no definition in companion.css. The same missing class was used by the neighboring republication action. Both now reuse existing `companion-cta-button`; existing open-state secondary controls remain. Recruitment heading/badge may wrap, status badge/icon do not shrink, closed label uses the theme muted token. Status-card actions have 44px minimum height, disabled/active feedback. Recruitment shows a spinner and busy state during management writes.

The existing handler retains its synchronous duplicate lock, server-confirmed state updates, UNKNOWN immutable retry, validation, revision and capacity rules. No backend/API/schema changes.

Component and client tests: 54 PASS. Recruitment PostgreSQL tests: 4 skipped because opt-in disposable test DB is not configured. Follow-up Host login and explicit owner permission allowed one close/reopen cycle on the test publication: management revision 8 → 9 (closed), refresh retained closed, then 10 (reopened). Member count stayed 2 and capacity stayed 4. Publication is open again. Checked desktop 1440px/light and mobile 390px/light+dark; mobile DOM clientWidth and scrollWidth both 375px (scrollbar excluded), no horizontal overflow. Restored original light theme and viewport override. No cancellation or member writes were performed. Before-fix screenshots were not captured.

## BUG-02: Preview contract defect fixed; full save acceptance remains partial

Traced `/trips/[id]/edit` through SavedTripAssistantPage, EditTripClient, preview/apply helpers, applyEdit and recordCompanionItineraryChange. Current code does not lock editing merely because a publication exists: `hasCompanionPublication` renders the group notice only. Save requires a changed candidate and a current matching preview/revision; server rechecks ownership, completed visits and Validator before transactional persistence.

Companion publication references Trip directly; public dates/transport/route are projected from current Trip. Existing apply transaction updates itinerary and appends the system notice/revision together. Member identities and recruitment state are not replaced. Existing integration tests cover this seam, but were skipped without the disposable PostgreSQL configuration. No speculative authorization or save-gate changes were made.

Follow-up with the supplied Host account (credentials not retained in source/docs): management access works. On the linked edit page, the browser showed `Phản hồi kiểm tra hành trình không hợp lệ.` and disabled Save. Server `snapshotRoutesWithLegs` returns optional routing `provider`, while client `previewLegMetricSchema.strict()` did not accept that field. Two RED tests reproduced `INVALID_RESPONSE` for GOOGLE_MAPS and STADIA_MAPS. One optional enum field aligns the client with the existing PreviewLegMetric contract; both tests are GREEN. No backend or business gate changed.

After reload the same live preview is accepted and shows three satisfied groups plus Travel Time violations: five internal legs have insufficient travel gaps, and the outbound arrival is 18:19 while the first visit starts at 15:03. This itinerary legitimately cannot be saved until corrected; no itinerary changes or group notifications were persisted in this investigation. End-to-end successful Trip save/reload and its group notice are NOT PROVEN. No raw HTTP payload/network capture was recorded; evidence is the live error before/validator result after plus the server-to-client contract and RED/GREEN parser tests.

Fresh focused run: 6 files / 91 tests PASS, including client preview/apply, server apply/ownership/validation, recruitment view/client. Disposable PostgreSQL suites remain skipped; Docker daemon is unavailable. Screenshots are local artifacts outside the Git checkout: `D:/Bai tap Code/KLTN/host-edit-validation-after.jpg`, `companion-closed-desktop.jpg`, `companion-closed-mobile.jpg`, `companion-closed-mobile-dark.jpg`.

## Verification

- `npm exec -- vitest run --config vitest.config.mts src/components/trip-companions/companion-management.vitest.test.ts src/modules/trip-companions/companion-client.vitest.test.ts src/modules/trip-companions/companion-management.postgres.integration.vitest.test.ts`: 54 PASS, 4 skipped.
- `npm exec -- vitest run --config vitest.config.mts src/modules/trip-edit/apply-edit.vitest.test.ts src/modules/trip-edit/trip-edit-service.vitest.test.ts src/modules/trip-edit/edit-preview-state.vitest.test.ts src/modules/trip-companions/companion-notice.postgres.integration.vitest.test.ts src/modules/trip-companions/companion-cancel.postgres.integration.vitest.test.ts`: 31 PASS, 8 skipped.
- `npm run check-types` (apps/web), repeated after preview fix: PASS.
- Impeccable detector ran once on both UI targets; it reports existing palette/radius deviations across the incumbent large stylesheet. No redesign was undertaken.
- `npm run build` (root): PASS, 59 pages; two existing dynamic filesystem tracing warnings in tripsage-price-reference.ts.
- `git diff --check`: PASS.
- No lint script, full-suite run, production verification, migration, commit or push in this task.

Follow-up command: `npm exec -- vitest run --config vitest.config.mts src/lib/trip-edit-client.vitest.test.ts src/modules/trip-edit/apply-edit.vitest.test.ts src/modules/trip-edit/trip-edit-service.vitest.test.ts src/modules/trip-edit/edit-preview-state.vitest.test.ts src/components/trip-companions/companion-management.vitest.test.ts src/modules/trip-companions/companion-client.vitest.test.ts` (apps/web): 91 PASS. Build repeated after client fix: 1 successful task, 59 generated pages, exit code 0 observed on final poll (it remained alive briefly after its summary).
