# Destination image UX simplification

2026-10-15, main D:/KLTN/KLTN, TXH. Existing uncommitted Cloudinary503/JPEG fixes,
diagnostics and automatic upload work were preserved. No commit/push/deploy.

## Application-use policy

`websiteRights` continues to represent the historical legal-review status.
No approval or fictional evidence is generated. A new upload stays UNKNOWN with
null rightsEvidence, reviewedBy and reviewedAt. After authenticated byte/asset
verification and successful transactional attachment, its storageReference JSON
contains `websiteUse: ADMIN_UPLOAD_V1` and the owning destinationId alongside
the existing Cloudinary asset metadata. This is an application-use capability,
not legal evidence, and requires no schema change.

The shared predicate admits prior APPROVED media, or an UNKNOWN server-tagged
upload bound to the current Destination, provider asset/version and exact HTTPS
delivery URL. REJECTED always fails. Database selectors narrow UNKNOWN candidates
by the marker and Destination ownership; after materialization the exact predicate
rechecks ownership/asset binding. Metadata needed for this check is stripped from
public DTOs and Planner thumbnails. Thumbnail candidates remain bounded to20.

Only the verified upload service may mint the marker. Generic legacy create/update
and ContentMedia profile writes remove client-supplied application-use markers;
unchanged retained metadata is preserved. URL changes invalidate storage identity.
Any explicit rights/evidence change and the existing review/revocation endpoint
remove the capability. Same-key upload replay cannot recreate the media row or
change its current eligibility. Existing review endpoints are retained for backward
compatibility and revocation; Destination UI has no review workflow or evidence
request.

## Legacy and Đồng Văn preservation

No migration, backfill, batch approval, data rewrite or new conversion endpoint
was performed. Existing IDs, URLs, captions, alt, provenance and review metadata
are retained on normal no-change/prose/cover/order writes. In particular, current
Cao nguyên đá Đồng Văn media were not edited or deleted by this task.

Existing APPROVED images remain usable. Untagged legacy UNKNOWN images, including
older Cloudinary uploads, remain visible to Admin but are not automatically
published or enabled for Editorial. This is the deliberate prospective transition:
provider metadata alone is not sufficient proof that an old UNKNOWN image has
never been revoked. Any future legacy activation requires a separately scoped,
audited provenance/revocation check; no new legal-review loop was added here.

## UI and consumer integration

- Destination images show gallery/thumbnail, optional caption, cover, reorder and
  unlink. Manual alt/evidence/review/status controls were removed. Server alt uses
  `Hình ảnh {Destination name}`, never the upload filename. Null/empty caption is
  accepted; existing alt/author/source and legal metadata are not rewritten.
- File picker/drop still auto-start on Edit; Create persists a valid HIDDEN
  Destination first. Two-worker batching and same-file/key retry remain. Image
  metadata changes use Save as before. Explicit unlink journals cleanup intent
  without deleting Cloudinary assets.
- Detail/public profile, Explore cards and Planner thumbnails use the same
  eligibility policy, within canonical persisted VISIBLE filters. Culture/source
  rights and RAG publication/indexing remain unchanged.
- Editorial picker, deterministic engine, AI's ID allowlist/validation and public
  resolution use the same policy. Draft IDs remain owner-bound; publishing checks
  eligibility again. Only published JSON renders publicly, with current media
  eligibility rechecked; revoked/unlinked photos disappear without publishing a
  draft. Editorial factual-source approval remains separate and unchanged.

## Verification

Final root `npm run test`:1221Vitest PASS,91gated PostgreSQL skips;328legacy
PASS. Focused image/provider/profile/Editorial/Planner/V3 selection:157tests
(including the final additional cross-consumer case). Root typecheck (four
workspace tasks), production web build and `git diff --check` PASS.
Isolated Chromium:20Destination groups plus16Editorial groups PASS; responsive
image cards and the new eligibility picker were visually inspected.
Coverage includes actual Sharp images with synthetic providers/persistence;
Cloudinary nested404/JPEG compatibility, replay and uncertain outcomes;
caption/alt/evidence-free upload; capability forgery/foreign ownership/revocation;
Detail/Explore/Planner/published-only Editorial and AI ID filtering. Browser tests
use production form/editor/renderer with isolated synthetic transports only,
including optional caption, no review UI, automatic upload, cover/order/unlink,
new UNKNOWN tagged photo selection, legacy/rejected blocking and responsive themes.

The added real PostgreSQL scenario covers the same policy through actual nested
Prisma selects and persistence; it is gated on the existing disposable-loopback
test environment. Docker initially had no Linux-engine pipe; starting Desktop did
not yield a responsive engine, so PostgreSQL integration remains NOT RUN. No
Neon substitution, migration or data write was used. No real Cloudinary upload or
paid AI call was made. Live authenticated acceptance remains an Owner manual step.

## Manual test on localhost3010

1. At Destination Edit, select one image, then several. Each auto-uploads without
   saving prose and becomes available in the library with default Destination alt.
2. Save with caption empty; add/remove caption, choose cover, reorder and unlink.
   Retained media keep IDs/URLs; there is no evidence or per-image approval step.
3. Open the same Destination Editorial Editor, reload its context, auto-arrange
   and select the newly uploaded photo. Save draft; verify public still uses the
   previous publication until explicit publish. Publish and inspect public detail.
4. Confirm HIDDEN Destinations remain unavailable publicly. Previously rejected,
   revoked and untagged UNKNOWN media remain blocked, with existing data preserved.
5. On a lost/uncertain upload response, retry the original File/key; confirm no
   duplicate attachment. No provider cleanup is part of unlink.
