# Admin Destination & Culture — UI/UX redesign evidence

2026-10-12 · TXH · continuation of the supplied redesign request.

## Baseline and delivered behavior

Started at `861bee4d818315051607c90ec75c61a5102b9980` with unfinished changes to the two forms, TipTap dependencies and four shared UI files. Continued that work. No research/pilot document, other checkout, authorization route, database schema or RAG runtime was changed.

Destination now has ten navigable sections: basic information, geography, map and verification, durations, weekly hours, visit information, media, linked culture, sources and review/save. Culture has eight: basic information, geography, communities, authoring, media, optional destinations, sources and review/save. Desktop uses a sticky sidebar; mobile/tablet use a labeled section selector. The controls remain mounted when changing section. Completion only counts required values and does not certify facts or rights.

Both forms provide Vietnamese guidance, linked labels, keyboard focus, error summary with field focus, source cards that can collapse, selected taxonomy chips, loading/empty/retry states, HTTPS image previews with fallback, cover/reorder controls and a local preview. Preview reads selected taxonomy names, writes nothing, publishes nothing and grants no permissions. Pending and UNKNOWN attempts block departure; ordinary unsaved edits require a native confirmation. Standard unload protection and Chromium same-document Back protection are tested. No local autosave/draft or extra DB state is introduced.

The location picker implementation remains the existing MapLibre renderer. Coordinate changes still remove verification and evidence; the form now distinguishes missing, unconfirmed, confirmed and changed-needing-confirmation positions. Weekly OPEN/CLOSED/UNKNOWN semantics remain distinct. Choosing OPEN now leaves interval inputs empty instead of inventing operating hours. Explicit schedule copy preserves the selected status and intervals and asks before replacing other days.

## Rich content contract

`CultureContent.content` remains TEXT. Unmarked content is literal legacy prose. New edited content uses `KLTN_RICH_TEXT_V1\n` followed by a validated ProseMirror JSON document. No existing record is backfilled, and simply loading or locking the editor emits no content update. Editing unrelated fields preserves legacy body bytes under the existing NFC/trim API contract.

Supported structures are paragraphs, H2/H3, bold/italic, nested bullet/ordered lists (including start numbers), blockquotes, safe HTTP(S) links and hard breaks. Unsupported nodes/attributes, invalid documents and unsafe links are rejected on the server. Public detail and admin preview use the same React renderer, with escaped text and an explicit element allowlist; neither injects authored HTML. Paste removes scripts, embedded content, event/style attributes and dangerous URLs, while preserving supported structure. Outline and clear-formatting actions have undo boundaries. The original 20,000-character storage limit remains, including the JSON envelope; the editor displays both readable and stored character counts.

`richContentText` extracts text with headings for excerpts and future consumers. Public Culture list and related Destination excerpts use it. AF-7/domain-to-RAG export remains unimplemented; saving these forms does not index content or approve any source.

Categories have one shared contract with eleven stable keys and Vietnamese labels. Equivalent capitalization/spacing/diacritics normalize to the same known key. Unknown legacy values remain readable and unchanged; no semantic reclassification or single-to-multiple-category change is introduced. Public labels resolve stable keys using that same contract. Future filters can reuse it; this task does not add a new public filter flow.

## Acceptance and checks

| Area | Evidence | Result |
| --- | --- | --- |
| Rich editor | Browser H2/H3, bold/italic, supported paste, bullet/ordered lists, quote, toolbar link, undo/redo, clear/undo; save/reopen retains headings/lists/start number/link/quote | PASS, mocked writes |
| Security and legacy | Server format/link/length tests; escaped legacy HTML and rich renderer; unrelated-field legacy save stays literal; private image URL cannot be previewed | PASS |
| Category | Accent-insensitive keyboard search/select; stable stored key; legacy preservation | PASS |
| Navigation | Actual section anchors; same-state section changes; dirty Cancel and native Chromium Back cancellation; required-field focus | PASS |
| Saving | Synchronous duplicate guards, taxonomy UNKNOWN blocks parent save, identical key/payload retry; successful save clears unload guard | PASS, synthetic API |
| Destination | Verification/evidence invalidation, explicit status, seven-day UNKNOWN semantics, map renderer regression suite and existing map pin contract | PASS offline |
| Culture | Independent culture, multiple areas/communities, optional destinations, media/source rights retained | PASS offline |
| Responsive | 320/360/390/768/1280/1440 in light/dark; no document overflow; final section stays reachable above sticky actions | PASS, Chromium |
| Vitest + disposable PostgreSQL | 672/672 across 45 files, skipped 0; migrations and current ownership/rights/idempotency/US-21/US-22 checks; owned container/volume removed | PASS |
| Legacy tests | 328/328, skipped 0, all configured legacy commands | PASS |
| Typecheck | Root four configured tasks; final production build also typechecks web | PASS |
| Build | Local production build, 30/30 static pages, offline loopback DB configuration and QA/cleanup disabled | PASS |
| Diff/secrets | `git diff --check`, staged diff checks and scoped credential-pattern scan | PASS |

The initial plain Vitest threads invocation printed 586 passing/68 environment-gated tests but exited with a Windows worker crash. It is not the final test gate. The isolated full PostgreSQL runner subsequently completed normally with all 672 tests and zero skips. Source-contract assertions in the legacy suites were updated for the shared shell/guard and extra schedule-copy selector; authorization and write assertions remain.

Browser tests mount actual client form components in an isolated local fixture, intercept all APIs and block non-loopback network requests. The fixture stubs Next navigation and the provider map canvas; it is not an authentication bypass or an authenticated live Next/Neon session. Map picker behavior is covered by existing renderer/coordinate regression tests and the owner's prior live acceptance, not a newly performed provider acceptance. Chromium was tested; Firefox/Safari and assistive-technology/live-screen-reader acceptance were not performed. Same-document Back interception depends on Navigation API support; link and unload guards remain available otherwise.

## Reproduce and visual evidence

- `node apps/web/scripts/test-qa-postgres.mjs --full`
- `npm run test:legacy --workspace web`
- `npm run check-types`
- `node apps/web/scripts/test-admin-redesign-ui.mjs` with `PLAYWRIGHT_MODULE_DIR` pointing to the available Playwright package directory.
- Set `ADMIN_UI_BASELINE=1` to capture the original `861bee4` form sources without modifying the checkout.

Screenshots and logs are local, ignored artifacts under `apps/web/.cache/admin-redesign-ui` and `apps/web/.cache/admin-redesign-*.log`. All sample content is synthetic, never persisted to Neon.

| View | Before | After |
| --- | --- | --- |
| Culture mobile | [360px baseline](../../apps/web/.cache/admin-redesign-ui/before-culture-360.png) | [390px viewport](../../apps/web/.cache/admin-redesign-ui/after-culture-390-light-top.png) |
| Destination desktop | [1440px baseline](../../apps/web/.cache/admin-redesign-ui/before-destination-1440.png) | [1440px viewport](../../apps/web/.cache/admin-redesign-ui/after-destination-1440-light-top.png) |

Full-page screenshots exist for both forms at every tested viewport/theme. Baseline captures use empty original forms; after captures use synthetic editor fixtures. They demonstrate layout, not factual Hà Giang content.

## Requested final report

```text
BASELINE_HEAD=861bee4d818315051607c90ec75c61a5102b9980
UX1_UI_FOUNDATION=IMPLEMENTED; shared shell/icons/field help/styles
UX2_NAVIGATION=IMPLEMENTED; anchors/active sections/required progress/errors/guards/sticky actions
UX3_RICH_TEXT_EDITOR=IMPLEMENTED; TipTap, safe paste/links, toolbar, counts and preview
RICH_TEXT_STORAGE_FORMAT=KLTN_RICH_TEXT_V1 + validated ProseMirror JSON in existing TEXT
LEGACY_CONTENT_COMPATIBILITY=PASS; literal legacy read; no open-time conversion/backfill
UX4_CATEGORY_TAXONOMY=IMPLEMENTED; 11 shared stable keys, keyboard/accent search, legacy support
UX5_DESTINATION_FORM=IMPLEMENTED; ten sections, existing map/coordinate contract, explicit schedule copy
UX6_CULTURE_FORM=IMPLEMENTED; eight sections, independent content, optional relations, media/sources
UX7_TESTING=PASS offline; authenticated live acceptance not performed
ACCESSIBILITY=Labels, keyboard controls, visible focus, native confirmations, announced errors; no formal screen-reader audit
MOBILE_RESPONSIVE=PASS at 320/360/390/768/1280/1440, light/dark Chromium
DESTINATION_PREVIEW=IMPLEMENTED; draft metadata/media/hours/relations and safe map link
CULTURE_PREVIEW=IMPLEMENTED; same safe body renderer, media/sources/geography/community
UNSAVED_CHANGES_GUARD=PASS link/native Chromium Back; beforeunload handler; cleared on confirmed save
MAP_PICKER_REGRESSION=PASS offline existing map tests; provider canvas mocked in form fixture
DATABASE_MIGRATION_NEEDED=NO; no Neon migration/query/write in this task
TESTS=672/672 full disposable-PostgreSQL Vitest; 328/328 legacy; browser fixture PASS
TYPECHECK=PASS
BUILD=PASS; 30/30 static pages; no deployment
COMMITS=8d3c94a rich content/categories; 048adf4 redesigned forms; QA/evidence commit contains this report
VISUAL_EVIDENCE=apps/web/.cache/admin-redesign-ui; before/after plus six viewport/theme pairs
BLOCKERS=No offline implementation blocker; live authenticated/provider acceptance remains separate
OWNER_APPROVAL_NEEDED=Separate authorization before any live DB canary, push or deployment
```

No Production/Neon writes, OpenAI calls, RAG indexing/allowlist changes, push/deployment, force/reset or unrelated worktree operations. US-22 stays IMPLEMENTED — LIVE ACCEPTANCE PENDING. Existing admin story acceptance is not rewritten by these offline results.
