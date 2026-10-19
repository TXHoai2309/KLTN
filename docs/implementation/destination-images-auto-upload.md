# Destination image automatic upload and latency follow-up

2026-10-15. Owner requested that selecting/dropping photos start upload without
Save, and that the existing slow batch flow be improved. This work preserves the
uncommitted SDK404 and JPEG alias fixes from the previous sessions.

## Behavior and implementation

- Existing Destination Edit: selecting or dropping valid files starts upload
  immediately. Only new QUEUED files auto-start; FAILED/UNKNOWN files keep their
  original key/file and require explicit retry, avoiding retry loops.
- A shared in-flight promise and busy ref prevent overlapping batches or a Save
  racing the start of an automatic batch. Up to two intent/upload chains run
  concurrently, instead of waiting for every photo in sequence. Progress and
  per-file outcomes still require confirmed database attachment for SUCCESS.
- Responses can arrive out of order. Confirmed updatedAt, with media count as an
  equal-timestamp tie breaker, prevents a delayed response or an older same-key
  replay from replacing a newer gallery snapshot. Upload confirmation updates
  the saved DTO without overwriting the user's unsaved prose draft.
- Create still requires explicit valid HIDDEN Destination creation before any
  image upload. Files remain in memory until that succeeds; partial-failure
  handoff and exact retry remain. Unsaved media metadata/order/cover edits must
  be saved before adding photos; the picker and drop path enforce this and show
  guidance. Image rights remain UNKNOWN until explicit evidence-backed review.

The previous normal path did find → upload → find → verify → finalize for every
photo. The official SDK now returns the authenticated Upload API result to the
service. All identity, size, format, context, folder and URL checks run on that
result before finalization. Normal success therefore needs one resource lookup
instead of two. A missing response or upload exception still uses exact-identity
Admin read-back; retries still find an existing asset before uploading. No client
URL, provider ID or metadata is trusted as upload confirmation.

The response handling follows the official [Node upload guide](https://cloudinary.com/documentation/node_image_and_video_upload)
and [Upload API response contract](https://cloudinary.com/documentation/image_upload_api_reference).
This refines the implementation report's original Admin-read-back description;
server-mediated bytes, decoded-image validation and ownership rules remain.

## Verification and limits

- Focused image/provider/V3 Vitest:64/64 PASS. Includes SDK callback metadata,
  one-lookup success, rejection of mismatched upload metadata, missing-response
  read-back, timeout reconciliation, JPEG recovery, auth and rights rules.
- Isolated Chromium production form/services:19 groups PASS with synthetic
  persistence/provider. Picker and drop upload without Save; maximum two active
  provider calls; delayed and lost concurrent response plus same-key replay;
  unchanged unsaved prose; Create-first/partial-failure handoff, review and
  existing form regressions. No overflow at360/390/768/1440; light/dark screenshots
  in ignored apps/web/.cache/destination-v3/. This is not live Admin acceptance.
- Root typecheck (four workspace tasks), production web build and diff check
  pass. No schema migration or database/provider write was performed by this
  session; providers/persistence used by browser tests are isolated mocks.

The improvement is structural: two concurrent chains and one fewer Cloudinary
read per normal new image. Real end-to-end latency depends on Development DB and
Cloudinary/network response time; no real upload timing or fixed speedup is
claimed. Full repository and PostgreSQL suites were not rerun for this change.
No env/credential, auth, public rights, RAG, Editorial or Planner change, commit,
push or deployment.
