# Cloudinary V3.2 upload 503

2026-10-15, main `D:/KLTN/KLTN`, branch TXH, baseline HEAD `7ecdaec74e0944129d722abeb2dd3c27d4f34c3e`. Starting worktree was clean. No commit/push/deploy, environment edit, schema change, Neon data write or actual asset upload/delete occurred.

```ini
ROOT_CAUSE=NESTED_CLOUDINARY_ADMIN_SDK_404_MISCLASSIFIED_AS_503
FAILED_PHASE=provider.find() BEFORE_UPLOAD
CLOUDINARY_ERROR_CATEGORY=NOT_FOUND; Cloudinary HTTP404; no separate SDK error code supplied
ASSET_EXISTS=NO; all 6 intent public IDs checked read-only
DB_ATTACHMENT_STATUS=NONE; 6 intents, 9 attempts, 0 completed upload records, 0 ContentMedia
FIX_APPLIED=YES; normalize wrapped/flat SDK errors, preserve retry identity, add safe phase diagnostics
TEST_RESULTS=PASS; 51 focused tests, four-workspace typecheck, production build, diff check, security/read-only smoke
READY_FOR_MANUAL_RETRY=YES
```

## Evidence and root cause

Inspected the actual Cloudinary provider, intent/upload service, raw-byte upload handler, idempotency contract and installed SDK2.11.0. Varlock runtime contains Cloudinary cloud/key/secret with the expected destination folder. Configuration was not changed.

Read-only SQL against the verified existing Development endpoint/database inspected only image-intent/attempt/upload operations and ContentMedia for Destination `cmv7kc5eu0003209w9ggzpolq`. There are 6 intent journal entries, 9 admitted attempt entries, no successful upload journal and no media attachment. Counts remained identical at final verification. Raw actor IDs, keys, file names, file bytes, hashes and response payloads were not logged; evidence uses hashed intent references.

Cloudinary Admin resource GETs for exactly those six server-owned intent public IDs returned HTTP404. The actual SDK rejection has this shape:

```ts
{ error: { http_code: 404, /* message omitted */ }, /* SDK request metadata omitted */ }
```

The installed SDK's `lib/api_client/execute_request.js` rejects an HTTP error with `Object.assign({request_options, query_params}, result)`, leaving `http_code` inside `result.error`. The original provider tested only top-level `error.http_code`. It therefore converted normal asset absence into `IMAGE_PROVIDER_UNAVAILABLE`/503. Because the initial `provider.find()` precedes `provider.upload()`, this prevents a new asset from reaching upload at all. No Editorial migration dependency is involved in that reproduced failure.

Reproduced the defect with a failing unit test against the original implementation: nested SDK404 rejected with503, while the existing flat404 path already passed. After the fix, an additional read-only call through the actual application provider returned `null` for an existing pending intent, with no exception, upload or DB write. The new log recorded phase `FIND_BEFORE_UPLOAD`, category `NOT_FOUND`, Cloudinary HTTP404 and outcome `ASSET_ABSENT`.

The historical evicted browser responses cannot be recovered individually; the documented failure is independently reproduced from the installed SDK behavior, the current intent-bound provider lookup and the original code path. No claim is made that a real upload/finalize has now succeeded.

## Changes

- Normalize the Admin SDK's wrapped HTTP status and the existing flat form. Only404 means absent. Authentication/authorization,429, provider5xx and network errors remain failures.
- Preserve safe HTTP/error-code/network classification in a fixed-message `CloudinaryProviderError`. Do not retain the raw SDK object, error message, options, authorization, URL/query, cause or stack from the provider.
- Add correlated upload diagnostics for auth/config/body, intent/replay/admission, inspect, find-before, upload/recovery, find-after, verification and finalization. Each upload HTTP response gets a generated `X-Image-Upload-Request-Id`; it is not copied from client input. Logs use allowlisted metadata and hashed Destination/intent references, never raw idempotency keys or session/provider credentials.
- Log caught upload errors before reconciliation, so a later missing resource cannot hide the original upload phase/status. Finalization's FAILED/UNKNOWN outcome is logged even when the shared idempotency helper returns an outcome rather than throwing. Unhandled upload-route errors pass only a fixed safe error to the shared UNKNOWN response mapper.
- Keep existing exact key/body identity, replay, intent expiration, byte/ownership checks, overwrite:false, unique_filename:false, same-public-ID reconciliation, transactional attachment and UNKNOWN rights unchanged. No change to APPROVED review, public selectors, RAG, Editorial or Planner logic.

## Validation

- Focused Vitest:51/51 (38 image-service/HTTP tests,11 SDK-error/diagnostic tests,2 Varlock tests). Includes actual wrapped404 shape, flat404 compatibility,401/403/429/500 fail-closed behavior, upload callback/stream failures, secret-bearing SDK metadata exclusion, correlation headers, one upload followed by same-key replay, existing timeout-after-success reconciliation and provider retry behavior. All providers/writes in these tests are mocks.
- Root `npm run check-types`:4workspaces PASS. Production `npm run build --workspace web`:PASS. Initial mock callback type errors were fixed before final verification.
- Scanned136public static build files against actual configured credential values in memory:0matches. GET-only health200, protected config/images APIs401. No authenticated live upload was attempted. Next remains running at3010 with the source fix available through development recompilation.
- `git diff --check` and new-file whitespace check PASS. No full Vitest, browser suite or PostgreSQL write suite was needed for this focused provider fix.

Ignored local evidence under `D:/KLTN/KLTN/apps/web/.cache/`: `cloudinary-upload-503-evidence.json`, `cloudinary-503-live-find.json`, `cloudinary-503-final-counts.json`, `cloudinary-503-red.log`, `cloudinary-503-tests.log`, `cloudinary-503-typecheck.log`, `cloudinary-503-build.log`, `cloudinary-503-security-smoke.json`.

## Manual retry and diagnostics

Retry the pending image using the same file and idempotency key while its intent remains valid. Do not generate a replacement key merely because an upload result is uncertain. Existing30-minute intent expiration still applies; no intent was extended or edited by this task.

If another failure occurs, use the upload response's `X-Image-Upload-Request-Id` and search server logs for `destination_image_upload` with that correlation. Relevant fields: `phase`, `outcome`, `httpStatus` (application response), `cloudinaryHttpStatus`, `cloudinaryErrorCode` (null if absent), `networkCode`, `category`, `errorType`, `appCode`. A404 `ASSET_ABSENT` before upload is expected; subsequent events show whether upload, read-back, asset verification or finalization failed. Real upload permission, delivery and attachment remain for the owner's manual retry.
