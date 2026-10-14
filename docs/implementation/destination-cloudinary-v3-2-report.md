# Destination Cloudinary V3.2 — implementation and verification

2026-10-14. Code implemented; owner real Cloudinary/localhost Admin acceptance
pending. All provider tests use an offline adapter. No real Cloudinary upload,
delete, rename, folder creation, account/environment change or Vocab call was made.
No Neon data was written. Existing AddressKit and public-profile work was preserved.

```text
TASK=DESTINATION_CLOUDINARY_V3_2
BRANCH=TXH
REMOTE_BASELINE=origin/TXH ec3cb27641552f6d236060de7b50a7cd2a40087f (Phase 0 local ref; no fetch/push)
LOCAL_HEAD_BEFORE=ec3cb27641552f6d236060de7b50a7cd2a40087f
LOCAL_HEAD_AFTER=ec3cb27641552f6d236060de7b50a7cd2a40087f

CLOUDINARY_INTEGRATION=Official SDK 2.11.0; optional internal Varlock configuration; no real provider calls during implementation
UPLOAD_FLOW=Authenticated server-mediated raw bytes; durable Admin/Destination intent; real image decode; provider resource verification; idempotent DB attachment
CLOUDINARY_FOLDER=KLTN/destinations/{destinationId}; dynamic asset_folder or fixed folder selected from configured environment's Admin Config API
DATABASE_MEDIA=Existing ContentMedia; HTTPS URL plus versioned JSON storageReference; default UNKNOWN
CREATE_WITH_IMAGES=HIDDEN DB create first; then sequential uploads; partial failure retained in memory on Edit; success feedback distinguishes incomplete images
EDIT_IMAGES=Queue/drop/preview/progress/retry; metadata patches, explicit unlink, cover and order via Save
COVER_AND_GALLERY=One cover; twenty saved/pending slots; approved cover priority; thumbnails and public gallery fallback
RIGHTS_VERIFICATION=Explicit evidence-backed Admin review; backend reviewer/time; client-forged reviewer rejected
PUBLIC_DISPLAY=APPROVED-only persistence queries; HIDDEN excluded; Planner approved-image contract unchanged
LEGACY_MEDIA_PRESERVED=IDs/reviewers/timestamps preserved on unchanged media; V2 and V3 URL changes reset approval; legacy URLs retained

SCHEMA_MIGRATION=NONE; Prisma schema/migration files unchanged; only existing SQL installed in disposable Docker database
TYPECHECK=PASS; npm run check-types, four workspace tasks
UNIT_TESTS=PASS; full Vitest1166 passed/84 disposable-PG skips; legacy328 passed; new image suite37 passed
POSTGRES_TESTS=PASS13/13; four new image tests plus nine V3 tests; loopback disposable container; mocked Cloudinary; container cleaned
BROWSER_TESTS=PASS17/17 isolated Chromium groups; production form/services with synthetic persistence/provider; no live Admin/Neon acceptance claim
BUILD=PASS; npm run build (local Next.js production build)
DIFF_CHECK=PASS; CRLF notices only

BLOCKERS=Owner credentials and real Cloudinary/Admin3010 smoke remain untested; no code blocker
KNOWN_LIMITATIONS=Server upload is not browser signed upload; Vercel body limit below local10MB; pending File recovery is memory-only; intent expires30min; physical cleanup is deliberately not implemented
MANUAL_TEST_STEPS=See owner-only localhost instructions below
COMMIT_STATUS=NOT COMMITTED
PUSH_STATUS=NOT PUSHED
DEPLOY_STATUS=NOT DEPLOYED
```

## Phase 0 and implementation boundaries

Branch/HEAD/origin matched the supplied baseline. The initial worktree had ten
modified files and one untracked US28 report, including searchable AddressKit,
DestinationForm and public Detail/profile changes. No reset, stash, checkout,
commit, push or deployment was performed. The existing changes remain present.
Only the shared form/profile integration points were extended. No source RAG,
Google Routes or Planner logic was changed.

Cloudinary's official [Node upload guide](https://cloudinary.com/documentation/node_image_and_video_upload)
and [folder modes guide](https://cloudinary.com/documentation/folder_modes) were
checked. Runtime asks the configured product environment for its mode, never
assumes a public ID is a dynamic folder, and never calls folders, rename or destroy.
Cloud name/key/secret remain internal/server-only; the UI receives only configured:
true/false. Errors expose safe application messages, not SDK responses/credentials.

## Persistence and recovery

`destination:media-intent:{id}` uses the existing idempotency journal, bound to
Admin, Destination, immutable SHA-256, declared size/MIME and a thirty-minute
expiration. Server-generated unique public IDs use overwrite:false. Sharp decodes
JPEG, PNG, WebP and AVIF, rejects other/corrupt formats and animated images, bounds
input to10MiB and25million pixels, and checks actual format against declared MIME.
No arbitrary URL can be uploaded by the server.

Intent admission uses PostgreSQL advisory locks, counts live pending reservations
across all Admins and enforces20slots. Durable limits are30intents/minute and100/hour
per Admin, plus30provider attempts/minute and100/hour. Provider calls remain outside
business-write transactions. Upload attempts reconcile an exact existing asset
before uploading again. Resource type, upload type, format, bytes, dimensions,
folder, intent/hash context, public ID and canonical HTTPS delivery environment
are verified through the configured authenticated Admin resource API.

Finalize and rights review use the shared SUCCESS/FAILED/UNKNOWN contract. Same
upload key/hash replays confirmed media attachment even after intent expiration;
an uncommitted expired intent is rejected. Database writes recheck persisted ADMIN,
serialize media additions, update contentRevision and use optimistic updatedAt.
Form metadata/order/cover/unlink patches retain IDs and unrelated review fields.
URL changes invalidate approval and previous storage identity in both V2/V3.

Physical assets are never deleted. Explicit unlink/URL replacement records an
`UNLINKED_CLEANUP_CANDIDATE` audit manifest with storage identity, actor/time and
NOT_AUTHORIZED physical-deletion status in `destination:media-unlinked:{id}` journal
rows, atomically with the media change. Unfinalized intent records identify possible
orphan uploads for future controlled reconciliation. There is no cleanup endpoint,
scheduled delete job or attempt to delete pre-existing Cloudinary assets.

## Test evidence and limits

Commands: `npm run env:generate --workspace web`, `npm run check-types`,
`npm run test`, `npm run build`; from apps/web,
`node --import tsx scripts/test-destination-v3-ui.mjs`; from repository root,
`node apps/web/scripts/test-destination-images-postgres.mjs`; `git diff --check`.
The new unit tests also exercise401/403 before body reads, safe config response,
foreign Admin/asset/hash/folder rejection, provider timeout/recovery, rollback,
rights evidence, URL invalidation, no-change snapshots and public isolation.

The disposable PostgreSQL runner installs all existing domain migration SQL into
a unique labeled loopback-only pgvector container; the unused PostGIS extension
is omitted because that image does not include it. It never loads a real .env or
connects to Neon. Concurrency tests prove exactly one media for same-key finalize
and exactly one winner for slot20 across two Admins. The container is removed after
verified ownership. These thirteen tests supersede the old V3 Docker-blocked PG
gate, not the owner live-provider gate.

Browser17groups include the current searchable AddressKit, main Create/Edit,
UNKNOWN form retry, partial image failure/route handoff, metadata/cover/no-change,
rights review, an uncertain committed upload response followed by exact-key replay,
drag/drop/invalid file feedback and360px/desktop light/dark screenshots. External
browser traffic is blocked. Screenshots and logs are in ignored
`apps/web/.cache/destination-v3/` and `apps/web/.cache/destination-images-*.log`.
No screen-reader audit or live Admin/provider smoke is claimed.

The initial full test attempt hit the existing Blob SDK timeout; the final complete
`npm run test` passed after rerun without changing that test. The existing premium
Admin manifest resolves canonical ownership. Scoped strict audit retains one
pre-existing untouched textarea finding in ContentProfileEditor; no new-image
finding. Unscoped repository audit has27existing global ownership/form findings.
These audit results are recorded, not represented as a global strict PASS.

## Owner-only localhost smoke

1. In the ignored local environment file, configure your existing product
   environment's `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
   `CLOUDINARY_API_SECRET`; keep `CLOUDINARY_DESTINATION_FOLDER=KLTN/destinations`.
   Select a non-production database for localhost. Restart with
   `npm run dev --workspace web`, then open `http://localhost:3010` as ADMIN.
   Missing config should disable upload while other Destination fields still save.
2. Create a TEST Destination without images; verify HIDDEN. Then create another
   TEST Destination with JPEG/PNG/WebP photos you own. Before Create there should
   be no Cloudinary asset; after Create confirm the correct destination folder,
   unique asset IDs and UNKNOWN rights. Confirm the configured environment's
   actual dynamic/fixed mode. Do not modify Vocab or existing unrelated assets.
3. Edit: add images; change alt/caption/author/source URL; save; change cover/order;
   save again without changes. Verify media IDs, unchanged reviewer/time and old
   legacy URLs remain stable. Reject a non-image and a file over10MiB.
4. Interrupt networking during upload, restore it and retry the same queued file.
   Confirm no duplicate asset/media and no reupload of successful files. Pending
   File objects survive the Create-to-Edit handoff within the running page; a full
   refresh loses local files. Keep the page open for uncertain operation recovery.
5. Provide genuine image-rights evidence and explicitly approve; verify only
   APPROVED images appear after separate publication. UNKNOWN/REJECTED stay absent
   on Explore/Detail/Planner; prefer the approved cover. Revoke/reject to confirm
   public removal. Gỡ ảnh removes only the link; inspect the cleanup candidate and
   confirm the Cloudinary asset remains. Do not physically delete unrelated assets.

## Known deployment/recovery limits

The selected backend upload flow enforces byte validation before Cloudinary. It
supports10MiB locally, but Vercel's documented request payload ceiling is4.5MB.
Files above that ceiling need a separately approved deployment transport change;
do not claim Vercel10MB support. See [Vercel function limits](https://vercel.com/docs/functions/limitations#request-body-size).
No hosting setting, billing feature or deployment was changed.

Provider mode/config read, real upload and real public delivery are not verified
until the owner smoke. The provider account's authenticated Config/Resource API
permissions are required. SDK network timeout is20seconds, request-body timeout
30seconds, browser upload timeout60seconds. Local pending files are not persisted;
there is no resumable-across-refresh or physical cleanup feature. Known failure
from an expired intent can be removed and reselected with a new key; UNKNOWN must
first be reconciled with the original file/key.
