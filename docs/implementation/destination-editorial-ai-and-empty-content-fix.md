# Destination Editorial AI proposal and empty-content fix

Date: 2026-10-15. Authority: Owner's attached “FIX EDITORIAL AI PROPOSAL + SMART EMPTY CONTENT HIDING” request. Scope is the existing V3.5 Editorial flow and its shared public presentation. No schema or publication workflow change.

## Investigation and evidence

The existing development log contains `PROPOSAL_VALIDATION / PROPOSAL_INVALID`, but no rejected rule or field path. It does not retain the model response. Consequently the exact offending field in the historical request cannot be established, and no live provider request was made to recreate it.

Two validator contradictions were reproduced in offline tests:

- A permitted Hero change from its current title to the canonical Destination name was given paragraph-heading provenance. The subsequent reference check rejected the name when it was not also a substring of the description. Hero names now use the canonical name rule without creating paragraph provenance.
- An unchanged existing section label could be rejected by the stricter rule for newly extracted headings. Existing labels remain unchanged; newly proposed titles still require a short, exact, source-bound excerpt. Arbitrary facts, HTML, foreign IDs and invalid design enums remain rejected.

The previous Editor already declined a `FALLBACK` envelope; there is no evidence that HTTP 200 alone caused partial application. This fix strengthens that boundary to reject malformed `PROPOSED` responses too. Independently, renderer inspection found unconditional missing-value rows and implicit visit-section insertion. The deterministic seed path could also rename retained blocks or collide with generated IDs. These are separate findings, not attributed to an unobserved model response.

## AI behavior

- Preserved `gpt-6-luna`, Editorial's strict Structured Outputs adapter, reasoning configuration, deadline, token bound and mock-only testing. Preference Extraction and provider parameters are unchanged.
- Tightened model ID enums to the current block/media allowlists and aligned instructions with existing labels, hidden state, supported compositions and source-bound headings/decks. No block, prose, citation or source fact is generated or added by the model. Family/variant default to KEEP for an existing layout; explicit AUTO remains available.
- Invalid proposals return `status=FALLBACK` with `outcome=VALIDATION_FAILED`; provider failures use `outcome=PROVIDER_FAILED`; missing configuration uses `outcome=FALLBACK`; success is `status=PROPOSED, outcome=PROPOSED`. This preserves the existing response status contract while distinguishing all outcomes.
- Fallback returns the exact submitted layout, even when revoked media were removed from the separate model input. The Editor applies only a complete valid success after checking block identity, source prose/captions/citations, media eligibility, hidden state and selected direction. Failures preserve local layout, art direction, image selection, order, Undo history and draft state.
- The warning is: “AI chưa tạo được đề xuất hợp lệ. Bố cục hiện tại đã được giữ nguyên. Bạn có thể thử lại hoặc sử dụng Tự động dàn trang.”
- Safe server diagnostics now add an allowlisted `validationCode` and sanitized `fieldPath` to the existing phase/code/correlation metadata. JSON/schema, block IDs, duplicate media, media eligibility/role, provenance, composition, hidden-state and direction failures are distinguishable. No raw proposal, private text, actor/Destination IDs, headers, credentials or exception messages are logged.
- Deterministic regeneration retains stable manual IDs and unique prose, reserves manual empty/hidden blocks, reuses manually replaced Hero/utility blocks, and keeps supplementary story copy before practical sections. Repeated Auto → AI cycles do not grow the block list.

Reference: [official OpenAI Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=chat). Structured output shape is checked separately from application provenance, ownership and eligibility.

## Shared empty-field display policy

The pure policy and `resolveEditorialDisplay` project a renderable layout without modifying canonical Destination data, stored drafts or revisions. Admin Desktop/Mobile preview and published rendering share this projection. The Admin list distinguishes “Admin ẩn” from “Tự ẩn”, explains the reason and leaves each original block editable. Restoring data or eligible references makes configured blocks visible again.

| Material | Rendering policy |
| --- | --- |
| Optional text | Whitespace and exact empty sentinels are absent; phrases inside genuine prose are preserved. Heading-only meaningful text and distinct manual prose remain. |
| Visit information | Positive finite duration only; known OPEN intervals/CLOSED days only, labeled by weekday key. `24:00` end times remain valid. No UNKNOWN placeholders. Area is omitted here when already in Facts; an otherwise empty visit section disappears. No implicit reinsertion of hidden/absent visit blocks. |
| Facts | Only meaningful area/category and valid duration; no filled fields means no section. Exact repeated canonical Facts/Visit/Map blocks are suppressed in the display projection. |
| Map | Finite coordinates in legal latitude/longitude ranges only. Copy calls them reference coordinates, not an exact entrance/pickup/navigation point. Real map load errors and retry remain visible. |
| Images | Existing V3.4 ownership/eligibility rechecks remain; REJECTED/revoked, foreign and untagged legacy UNKNOWN do not pass. Empty image sections disappear. A split with copy but no eligible image becomes text-only. |
| Sources | Approved usable source references only; empty/invalid references and repeated source lists disappear. Distinct eligible sources remain. |
| Legacy public detail | Reuses optional-value/hours/coordinate rules; missing optional rows and empty related-content sections are omitted. Profile placeholder filtering is explicitly enabled for Destination detail, leaving Culture behavior intact. Real system errors remain unchanged. |

## Verification

- Full web Vitest: **1,320 passed**, 91 PostgreSQL cases skipped in 10 files. Includes Cloudinary, image UX/eligibility, AddressKit, RAG, Planner, Preference Extraction and Editorial. A 15-second per-test timeout was used for the full existing suite.
- Final focused Editorial run: **127 passed**, 6 disposable PostgreSQL cases skipped. New coverage includes canonical Hero provenance, existing labels, invalid schema/IDs/media/design, safe diagnostic paths, exact fallback despite revoked media, real adapter timeout with mocked transport, partial fields, reversible hiding, source deduplication, hidden blocks and repeated Auto/AI cycles.
- Legacy suite: **328 passed**. Updated the old seven-day placeholder rendering expectation to require only known operating days; duration formatting API behavior is unchanged.
- Browser suite: **24 groups passed**. Covers draft/save/publish/rollback, HIDDEN/public separation, KEEP/AUTO/Undo, all 12 family/variant compositions, responsive themes, media revocation, and an atomic-failure matrix (FALLBACK, malformed success, duplicate IDs, foreign media, changed prose, 401/403/429/500 and timeout).
- Smart-empty visual matrix: **42 screenshots** for seven cases at 390/768/1440 in light/dark, with Desktop/Mobile Preview/Public markup equality. Includes full/sparse/partial/no-photo/many-photo fixtures, a named Đồng Văn fixture and an isolated copy of the Owner's actual Destination. No placeholders, empty headings/lists, repeated body paragraphs, horizontal/text overflow, image load failures or split overlap in this matrix. Screenshots were visually inspected.
- Root workspace typecheck, production web build and `git diff --check`: **PASS**.

Local test artifacts are under `apps/web/.cache/editorial-ai-empty/`: `vitest.log`, `focused.log`, `legacy.log`, `browser.log`, `build.log`, `visual-results.json`, and `screenshots/`. The Owner snapshot is private local test input, not committed, published, or included in diagnostic output. Browser image/map transport is replaced by local synthetic fixtures.

## Safety and limits

The exact Owner Destination was read in an explicit repeatable-read `READ ONLY` transaction, then rolled back; no Neon records, image assets, saved layouts or publication states were changed. No automated test calls OpenAI or uploads/deletes a Cloudinary asset. No `.env` change or migration.

Docker did not respond to the bounded availability probe, so disposable PostgreSQL writes were not run; shared Neon was not used as a substitute. Live GPT output/account access and the precise historical rejected field remain unverified. The new diagnostic subcodes support the next manual attempt without logging its content.

The session began on `7ecdaec` with uncommitted prior changes. A separate actor created `23b7525` (`tmP`) during implementation and further edited the Editor UI. Those changes were retained and the final browser/build checks use the resulting working tree. This agent did not commit, push, reset, stash, deploy or revert that work.

READY_FOR_MANUAL_TEST=YES. BLOCKERS=No implementation blocker; live model acceptance and disposable PostgreSQL execution remain verification limits.
