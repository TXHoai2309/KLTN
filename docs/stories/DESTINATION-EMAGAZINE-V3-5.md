# Destination E-Magazine V3.5 — design quality

Authority: Owner's pasted “E-MAGAZINE V3.5: EDITORIAL DESIGN QUALITY OVERHAUL”
request in this chat. Scope extends the V3.3 presentation/refinement and preserves
V3.2 Cloudinary, V3.4 application-use eligibility and Luna adapter behavior.
Business invariants remain in product-spec Admin/visibility/write semantics and
the V3.3/V3.4 stories: Admin auth, ownership, no false legal approval, rejected
media exclusion, explicit draft/review/publication, source provenance and UNKNOWN.

Accepted work: immutable canonical-source/presentation separation; concise
source-bound headings and distinct hero/deck/lead/body/caption roles; exact and
near-duplicate detection without database text deletion; reusable editorial
components; prioritized Nature image hierarchy and responsive typography;
bounded AI composition/emphasis/deck/empty visibility; image source-size warnings;
real browser before/after evidence using isolated synthetic named fixtures.

Acceptance: 390/768/1440 light/dark for Đồng Văn (3 images), Nho Quế, Căng Bắc Mê,
Lô Lô Chải and no-photo Destination; 0/1/2/3/5/8 image cases; no duplicate heading/
body, unusual headings, overflow, distorted pictures, overlaps or single-word
desktop hero lines when space permits. Preview/public share the same projection
and renderer. Maps and practical data follow the story in deterministic/AI output.

No OpenAI calls, real uploads, shared Neon writes, schema migration, commit, push
or deploy. Only backwards-compatible optional v1 JSON fields are permitted.
Readiness and actual verification evidence are recorded in
[implementation report](../implementation/destination-emagazine-v3-5-design-quality.md).

## Implementation and verification

Implemented as a read-only editorial projection, shared article components,
dimension-aware photo composition and bounded AI art direction. Legacy text and
media IDs remain intact; V1 JSON additions are optional; there is no V3.5 database
migration. Admin Preview, standalone renderer and published public renderer produce
identical article markup when given the same resolved layout.

Verification: four-workspace typecheck PASS; web build PASS; full Vitest PASS
(80 files/1,278 tests, 10 DB integration files/91 tests skipped); legacy suite PASS;
21 isolated browser groups PASS; before/after visual fixture matrix 30/30 PASS, with
additional zero/one/two/three/five/eight-photo responsive coverage. One first full
Vitest run hit the existing 5s limit on an unrelated Blob SDK test; rerunning with a
15s test timeout passed. No OpenAI request, Cloudinary upload, shared Neon write,
migration, commit, push or deploy. Live GPT aesthetic quality remains for owner
manual verification.

## Final UI polish follow-on

The owner requested a final visual pass without a renderer rewrite. Refined the
shared CSS for hero crop/height and title scale, introduction hierarchy and
measure, image/split/gallery sizing, editorial facts, practical details, and map
framing. The same styles apply to Preview and public rendering and preserve the
four template families, three variants, AI art direction, and Admin settings.
Added a matched working-tree before/after fixture mode and a layout-stability
assertion. Detailed evidence is in the [final UI polish report](../implementation/destination-emagazine-final-ui-polish.md).

Verification for this follow-on: focused Editorial Vitest 85/85 PASS; editorial
browser suite 21 groups PASS; visual matrix 30/30 PASS at 390/768/1440 in
light/dark with zero horizontal/text overflow, zero overlap, 0px image geometry
shift after decode, and CLS 0; root typecheck and web production build PASS;
`git diff --check` PASS. Evidence uses synthetic photos/maps. No provider call,
upload, database write, migration, commit, push, or deploy. READY_FOR_MANUAL_TEST=YES.
