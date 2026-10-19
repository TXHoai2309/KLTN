# Destination E-Magazine V4.0 — current handoff

## Supported workflow

Owner decision on 2026-10-16: keep **AI dàn trang** only. Editor requests
PROPOSE/version 2 and starts new unsaved layouts in V4. Alternative and V3.6
controls, template regeneration, alternative retry branches and their dedicated
QA harness/tests were removed. HTTP rejects retired modes/versions before a model
call. Existing V1 JSON still reads/renders for saved articles, Undo and Rollback;
no automatic conversion, database rewrite or migration is performed.

The “Chuẩn bị cho chuyến đi” panel is removed from both Preview and Public,
including saved V1/V2 layouts. V4 auto-layout and the provider grammar no longer
create VISIT_INFORMATION. Destination metadata and canonical prose remain intact.

## Retained implementation

- Strict Layout DSL v2 bounds and contextual title/media/source enums; safe
  path/stage/issue diagnostics without raw responses or secrets.
- Canonical Content AST references, exact hydration and complete description
  preservation. No invented event citations or implicit first-source attribution.
- Compiler-backed rendering, text-weight grid balance, stacking unsuitable
  columns, shared Hero image-quality rules and original-ratio image handling.
- Manual locks, atomic proposal acceptance, exact Undo, dirty-state guards,
  authenticated writes and Draft/Publish/Rollback compatibility.

## Cleanup

Temporary browser harness, 57 QA artifact files (about 17.9 MB), six superseded
implementation reports and the dedicated alternative-variation test were moved
outside the repository to:

C:/Users/User/AppData/Local/Temp/kltn-v4-retired-20261016

The remaining fixture/contract/compiler tests are maintained regression coverage;
they are not runtime routes or generated artifacts. This document replaces the
per-error reports. Earlier ai-progress entries are historical; alternative
acceptance claims there do not describe the current supported workflow.

## Verification

- Full Vitest: 1,472 PASS / 91 DB integration SKIP / 0 failures.
- Legacy suites: 328 PASS / 0 failures.
- Root typecheck: PASS across 4 configured workspaces.
- Production build: PASS after final unused CSS cleanup.
- Diff check: PASS; no new secret patterns in changed lines.
- Real browser: authenticated Editor exposes only AI dàn trang; Preview and
  read-only Public show no preparation heading/panel. Public retains five images
  and references. Draft r13 / publication r7 were observed without writes.
- Current browser pass was scoped to removal/UI checks, not a new three-width
  composition acceptance or a paid provider test. Map showed its unavailable
  fallback in Admin and was not changed by this task.
- Screenshots are in the Temp archive, outside the commit.
No live paid provider request or Save/Publish was performed. Owner live AI
acceptance remains pending; offline fixtures do not establish provider reliability.

## Commit preparation

Review the diff on TXH, include the required V4 source files and regression tests,
and exclude local/secret configuration. Pre-existing changes in .env.schema and
other files were preserved, not reverted or staged. Nothing was committed,
pushed or deployed by this task.

## Reading scale adjustment

Owner requested a smaller presentation on the Đồng Văn Public article. Shared
CSS now uses body16–17px/1.75, lead17–20px/1.7 (max42rem), and smaller section
headings/initial letters/Split Hero titles. Measured real browser at1440/768/390:
no overflow; desktop lead19.95px, body17px; mobile lead17px, body16px.
Screenshots remain outside the repo in Temp/kltn-editorial-reading-20261016.
This CSS-only follow-up did not repeat the full test suite above.
Reading-scale production build and diff check: PASS.

## Shared body alignment

The Owner requested a single straight body rail. editorial.css now owns48rem
for lead, body, media rows, map and references, replacing independent lead/prose
width caps. Nested V4 wrappers no longer accumulate horizontal padding; featured
prose no longer adds a left inset. Image/text pairs align at the top and retain
their aspect ratios. The Hero remains a separate opening composition.

Real Public browser edges at1440px are328.5–1096.5px for all seven body sections;
at768px66.3–686.7px, at390px40–335px. No horizontal overflow. Admin Preview
(482px article) also has seven matching section edges and no overflow.
Screenshots/measurements: Temp/kltn-editorial-alignment-20261016, outside repo.
This is CSS-only; no full unit suite rerun or paid provider call.
Body-alignment production build and diff check: PASS.
