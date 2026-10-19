# Destination Cloudinary V3.2

Status: IMPLEMENTED — OWNER CLOUDINARY / LOCAL ADMIN SMOKE PENDING (2026-10-14).

2026-10-15 Owner-approved simplification supersedes this story's original
per-image rights-review UI/public gate for new server-verified Destination uploads.
Legal status is not auto-approved. Existing untagged UNKNOWN and REJECTED/revoked
media remain blocked; legacy data is preserved. See
[current story](DESTINATION-IMAGE-UX-SIMPLIFICATION.md).

2026-10-15 automatic-upload/performance follow-up: owner requested immediate
upload on file selection/drop. Edit now starts fresh files immediately with two
workers; Create retains HIDDEN-create-first. Normal uploads verify authenticated
Upload API metadata directly, removing one Admin lookup; exact-identity preflight
and missing/uncertain-response read-back remain. Stale/replayed snapshots cannot
replace newer gallery state; unrelated form drafts stay untouched. See the
[follow-up report](../implementation/destination-images-auto-upload.md).

2026-10-15 upload400follow-up: matched the owner's request correlation to
VERIFY_ASSET / INVALID_IMAGE_INTENT. Read-only checks of four existing assets
confirmed Cloudinary reports JPEG as `jpg` while Sharp reports `jpeg`; byte counts,
identity, folder and contexts match. Normalized this alias only for comparison.
Real metadata now passes verification; mocked JPEG recovery/replay confirms no
duplicate upload or attachment. Live authenticated retry/finalization remains pending.

2026-10-15 upload503follow-up: reproduced and fixed Admin SDK nested404 being
misread as provider unavailability in find-before-upload. Read-only target audit:
6pending intents/9attempts/0completed uploads/0attachments, all6assets absent.
Added safe correlation/phase diagnostics;51focused tests, typecheck/build/security
scan PASS. Retry/idempotency/rights unchanged; no real upload or Neon data write.
See [503 report](../implementation/destination-cloudinary-v3-2-upload-503.md).

Authority: owner's pasted Destination Admin V3.2 request in this chat. Extends
[Destination Admin V3](DESTINATION-ADMIN-UX-V3.md) only with optional destination
images. Product/System Admin rules, HIDDEN default, authorization, idempotency,
rights evidence and public isolation remain locked.

Accepted scope: official Cloudinary SDK, optional server-only Varlock settings,
existing ContentMedia, unique assets confined to KLTN/destinations/{destinationId},
durable Admin-bound expiring intents, real-byte image validation, safe retries,
Create/Edit queue, metadata, cover/order/unlink, rights review and approved public
cover/gallery. No schema migration, physical deletion, Vocab operation, shared
Neon write, new account/product environment, commit, push or deployment.

Implementation decision: authenticated server-mediated byte upload, selected over
browser signed upload to validate decoded image bytes before provider storage.
No client folder/public ID/provider URL is accepted. Deployment body-size
limitations and memory-only pending-file recovery are explicitly documented.

Acceptance evidence:

| Contract | Evidence |
| --- | --- |
| ADMIN only; auth before body; no credentials in configuration response | New HTTP/service mock tests |
| JPEG/PNG/WebP/AVIF; size and decoded format checks | Real Sharp-generated image unit fixtures |
| Correct dynamic/fixed identity, byte/resource/folder/context verification | Mock provider tests; actual folder mode awaits owner config |
| Durable intent, reservations, same-key finalize, rollback | Real disposable PostgreSQL + mock Cloudinary, 13/13 including V3 regression |
| Stable media IDs/reviewer/time; omission/no-change; URL resets rights | Unit and PostgreSQL snapshots; V2 and V3 write paths |
| HIDDEN create before upload; partial failure retained; retry skips success | Isolated browser production form/service harness |
| Cover/order/metadata/unlink, rights evidence, UNKNOWN handling | Unit/service/PG/browser checks |
| APPROVED-only Explore and Detail; Planner boundary retained | Public persistence selectors + full regression tests |
| Responsive/light/dark/keyboard/drop feedback | Browser17 groups, synthetic fixture screenshots |
| Real Cloudinary upload / main Admin3010 session | NOT RUN; owner executes manual smoke |

See [implementation report and smoke instructions](../implementation/destination-cloudinary-v3-2-report.md).
