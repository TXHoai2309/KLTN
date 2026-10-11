# US-17 — Tải tài liệu RAG (Task 1)

## Status

IMPLEMENTED — local automated checks pass; live private Blob and Admin browser acceptance NOT PROVEN.

## 2026-10-11 — Preview upload 404 investigation (unpublished fix)

Owner reports a TXT object exists in the connected private kltn-blob store but
finalization returns RAG_FILE_NOT_FOUND before creating an UPLOADED record.
The supplied object pathname matches the actor/UUID/TXT structure; no captured
finalize payload is available to prove equality with the ticket for that request.
Read-only Vercel metadata verifies the store is private and linked to kltn.
Preview Sensitive credentials cannot be retrieved by the local CLI; its local
OIDC credential is rejected for the store environment. Live head/get on the
supplied object therefore remain unverified. No private contents were logged,
no object uploaded and no Neon data modified.

Confirmed offline defect: installed @vercel/blob 2.8.1 reports blob.size=0 when
HTTP 200 lacks Content-Length, even with a nonempty stream. A real SDK test using
an undici MockAgent with networking disabled proves this behavior. The old
adapter's !blob.size check then produces a false 404; the synthetic ticket/PUT/
finalize regression fails on the old code and passes on the corrected adapter.
This establishes an adapter defect, not yet a complete live incident attribution.

The fix treats only a missing object as NOT_FOUND; unexpected 304/missing-body
responses use RAG_STORAGE_RESPONSE, and access/network failures use sanitized
RAG_STORAGE_UNAVAILABLE. Verification counts actual streamed bytes, enforces the
20 MiB bound, rejects genuinely empty files and cancels failed/oversized reads.
Private access, scoped upload ticket, auth, MIME/content validation, exact declared
size comparison, committed replay and DB-confirmed UPLOADED remain unchanged.
Review file streaming shares the same response classification; indexing continues
to use the registered private pathname and bounded reader.

Validation: eight new offline regressions; 47 focused tests pass with process
exit 0, full root/legacy tests pass, typecheck and fresh production build pass,
git diff --check passes. The cancellation fixture now includes the SDK's 200
discriminant. No commit/push/deploy. Owner review and Preview retest are required
before asserting that this fix resolves the reported live failure.

## Epic

Quản trị tri thức RAG.

## Owner

US-17 Task 1 implementation session; no commit/push.

## Goal / User Story

Là Quản trị viên, tôi muốn tải tài liệu tham chiếu lên hệ thống để bổ sung nguồn tri thức phục vụ RAG.

## Outcome

Admin tải PDF/DOCX/TXT hợp lệ tối đa 20 MiB vào kho riêng tư; sau khi server xác thực nội dung và DB xác nhận, một RagDocument ở UPLOADED được tạo. Tài liệu chưa đủ điều kiện retrieval.

## Source References

- Product document.docx đã đọc: MH-17 (chọn file, nguồn, tác giả/chủ đề/địa phương, sáu trạng thái UX), YCCN-89/90, QTN-96/99/104/105, YCP-21, NT-162–169.
- System Specification.docx mục 12: Admin RAG upload và lifecycle; tài liệu mới chưa được dùng trả lời.
- Repo architecture/source-baselines/product-spec/decisions; current Next.js full-stack, Prisma/Neon, Better Auth, shared authorization/idempotency.
- Figma file `oomNsNYfrcjnq2FQnYLOKN`: metadata chỉ trả page `01 – Components`, không có MH-17. **BLOCKED: FIGMA exact MH-17 frame**. Dùng visual language Admin hiện có, không tự nhận pixel match.
- [Vercel Function limit](https://vercel.com/docs/functions/limitations): request body tối đa 4.5 MB; [Vercel private Blob](https://vercel.com/docs/vercel-blob/private-storage) và [Signed URLs](https://vercel.com/docs/vercel-blob/vercel-signed-urls) hỗ trợ private client upload, scope path/type/size.

## Dependencies

Current branch `ThaiAnh` has unrelated uncommitted US-16 changes, preserved. No RagDocument/storage module exists. Vercel private Blob store/token must be configured separately for live upload.

## In Scope

- Minimal RagDocument metadata/status schema and additive Prisma migration.
- Admin-only signed private upload URL, server validation/finalization, Admin-only original file read.
- Admin upload page and upload state feedback.
- Focused tests for valid/invalid files, auth, failure semantics, status eligibility.

## Out of Scope

Review/approve/index/disable actions, chunking, embeddings, retrieval, OpenAI, pgvector query, US-18–20, generic media system, local production file storage.

## Business Rules

- PDF/DOCX/TXT only; >20×1024×1024 bytes rejected by storage token and finalization.
- Server compares filename extension, declared MIME, stored MIME, and actual content. DOCX must have Office ZIP structure, PDF signature/content markers, TXT valid UTF-8 plain text.
- File lives in private Blob before DB insert; no success is shown until both have succeeded.
- UPLOADED is retrieval-ineligible; only INDEXED can become eligible in later work.

## Roles / Authorization

Admin only via persisted-role `requireActor`. Guest 401, Traveler 403 on token, finalize and read API. Page redirects guest to login and denies Traveler using established Admin pattern.

## Ownership Rules

Blob path contains Admin actor ID and random UUID. Token can PUT only one scoped path; finalization accepts only paths under the current actor's prefix. All reads require Admin role and an existing DB row.

## UX / UI Contract

`/admin/rag/upload`: file chooser, source title required, source URL/author/topic/locality optional; filename, size, type; states idle, validation error, uploading, success, failed, unknown. Unknown retry uses same key/path/metadata. Light/dark and responsive styles inherit existing Admin theme. No fake MH-18 navigation.

## Data Contract

`RagDocument`: id, originalFileName, fileType enum PDF/DOCX/TXT, mimeType, sizeBytes, unique storagePath, sourceTitle, optional sourceUrl/author/topic/locality, status enum UPLOADED/REVIEWING/APPROVED/INDEXED/DISABLED default UPLOADED, uploadedById, timestamps. No file binary in Prisma.

## API Contract

- `POST /api/admin/rag-documents/upload-url` JSON `{fileName, mimeType, sizeBytes}`: validates Admin/metadata, returns shared `apiSuccess({pathname, uploadUrl, contentType})`. Browser `PUT`s file bytes to private Blob URL; max size/content type/path enforced by signed token.
- `POST /api/admin/rag-documents` JSON `{pathname, originalFileName, mimeType, sizeBytes, sourceTitle, sourceUrl?, author?, topic?, locality?}` + `Idempotency-Key`: server reads private Blob and validates bytes, creates row via `executeIdempotentWrite`, returns shared mutation envelope.
- `GET /api/admin/rag-documents/[id]/file`: Admin-only stream of recorded private original, no public URL in API DTO.
- POST JSON requests require same origin; private responses use `Cache-Control: private, no-store`.

## Error / Recovery

Known input/format/size/auth failures return FAILED; unavailable Blob/DB or uncertain commit return UNKNOWN. UI distinguishes failed vs unknown. Invalid upload can leave an unreferenced private blob if cleanup is unavailable; it is never exposed as a successful document.

## Write Semantics / Idempotency

Finalization uses existing `executeIdempotentWrite` scoped by actor and operation; unique storagePath also prevents duplicate rows across keys. Blob read/validation is before DB transaction. Unknown retries reuse identical key/payload and existing Blob, never upload another file or delete the Blob after an uncertain DB write. Successful DB response and idempotency record commit atomically.

## External Services

Vercel private Blob store; `BLOB_READ_WRITE_TOKEN` server-side only. No local production FS.

## Acceptance Criteria

- [x] Service fixtures for PDF/DOCX/TXT ≤20 MiB create UPLOADED rows; live Blob/Neon path NOT PROVEN.
- [x] Unsupported, oversized, spoofed, or MIME-mismatched file is rejected by server validation.
- [x] Guest/Traveler are denied at token, finalize and original-read service boundaries; live HTTP/session smoke NOT PROVEN.
- [x] Storage/DB failures never appear as SUCCESS; same-key retry and unique-path duplicate protection are tested.
- [x] UPLOADED is not retrieval eligible.
- [ ] Admin browser UI in light/dark/mobile, live Blob upload and 20 MiB boundary are NOT PROVEN without credentials/session.

## Test Plan

Red → Green → Refactor: focused service/validation/API tests with fixture PDF/DOCX/TXT, authorization, storage/DB failures and idempotent retry; then full repo checks and build. Live private Blob and development DB integration are separately reported if credentials unavailable.

## Expected Modules / Files

Prisma schema/migration; `apps/web/src/modules/rag-document/*`; thin admin API routes; `apps/web/src/app/admin/rag/upload/*`; env schema/example; package dependency only for Blob SDK and small ZIP validator.

## Migration Impact

Additive RagDocument table/enums. SQL reviewed; no DB apply without confirmed development DB.

## Environment Impact

Private Vercel Blob store and server-only `BLOB_READ_WRITE_TOKEN` required for runtime. Deployment configuration outside repo remains an acceptance blocker until configured.

## Implementation Sequence

1. Red tests for validation/service/auth/write semantics.
2. Minimal schema/migration, storage adapter, validation, service, thin routes.
3. Admin upload UI and state tests.
4. Generate, relevant/full tests, typecheck, build, diff check; update evidence.

## Acceptance Evidence

- Initial red test failed on missing RAG modules; implementation and refactor followed. `npm run test:rag --workspace web`: 15/15 PASS for all three formats, spoof/size/mismatch, auth, storage/DB failures, retry, duplicate path, private original read and UPLOADED eligibility.
- `npm run env:generate`, `npm run db:generate`, `npx varlock run -- npx prisma validate` (from `packages/db`), root `npm run test`, `npm run check-types`, `npm run build`, `git diff --check`: PASS as observed locally. Root test includes US-17 through `test:legacy`.
- Migration SQL reviewed: two enums, additive `rag_document` table, unique storage path. **Not applied** to development or production DB in this session; target development DB was not established.
- No `BLOB_READ_WRITE_TOKEN` is set in checked local env sources or current process. Live private Blob upload/read, Admin browser states, mobile/light/dark visual checks and real DB persistence remain NOT PROVEN.
- Figma remote metadata exposes only `01 – Components`; local `.fig` metadata/thumbnail match this export. Exact MH-17 frame remains BLOCKED: FIGMA.

## Open Questions

- Exact MH-17 Figma frame unavailable in connected file; Admin baseline is used.
- Live private Blob store/token and production upload acceptance remain unproven until provisioned.

## Handoff Notes

Stop after Task 1. Do not start US-18.


## 2026-10-09 — TXH selective US17/US18 integration (owner-authorized)

- Source ownership: selectively imported US17/18 from ThaiAnh commit `4c6df6128c1923369e652eb332eb1b475b50c3fa` onto TXH baseline `256584d831c72858f07e3231ce88dfb5b568f871`. No branch merge/cherry-pick; Favorites, Assistant, Task191/181/182 and Next config preserved. Historical evidence above belongs to the original ThaiAnh sessions; it is not evidence of current live acceptance.
- DOCX mandatory correction: upload-only validator independently validates central/local ZIP metadata, entry bounds/paths/duplicates, supported stored/deflate archives (including checked data descriptors), actual decompression counts and CRC32 for the three required XML parts. OOXML root namespaces, content type and internal officeDocument relationship/body are verified. DTD/custom entities, invalid numeric entities, deep XML and corrupt XML fail closed. No external fetch or embedded execution; no extractDocument call.
- Limits: original upload remains 20 MiB inclusive. Required XML parts retain 1 MiB each; aggregate ceiling is 3 MiB for those three parts. Explicit structural bounds: 2048 ZIP entries, XML depth128; ZIP64, encrypted/multi-disk/unsupported forms rejected. Not a full OOXML conformance, malware scan or hard heap/time guarantee. PDF remains marker validation; accepted upload does not prove extractability.
- Replay mandatory correction: current actor and syntax/owned path validated first, then shared preflight uses the exact existing identity/hash/resolution functions. Confirmed replay/conflict requires no Blob read; lookup failure is UNKNOWN, never ABSENT. New writes still validate Blob outside executeIdempotentWrite's atomic transaction. No global change to write semantics.
- UI: synchronous single-flight refs, aborted/stale-read guard and unmount generation checks preserve confirmed state; keyed detail identity isolates old mutations. UNKNOWN retries retain identical payload/key; known failed retry releases uncertainty. No indexing or disable action.
- Validation in this integration: US17 15/15 + US18 11/11, DOCX security8/8, finalize replay9/9 and shared helper4/4 PASS. Independent python-docx-produced document outside repository also accepted. Task181/18263/63 PASS; root Vitest248/248 and all legacy suites317/317 PASS on the successful root run. First root run reported248 passed then native Windows process exit3221225477 during shutdown; unchanged retry completed normally. No assertions/config weakened.
- Prisma7.10.0 schema validate/client generation and env codegen PASS; additive canonical rag_document SQL preserved exactly. Typecheck and fresh production build PASS. Blob SDK pinned2.8.1; all pre-existing lockfile package versions preserved. Before/after npm audit advisory objects identical:10HIGH/0CRITICAL, no new advisories, audit is not clean. No audit fix.
- Browser evidence: actual React components in an isolated synthetic harness outside repo, mocked fetch only and Link shim (not the authenticated Next app).13 controlled checks cover upload/review SUCCESS/FAILED/UNKNOWN, identical retry, double-submit, old mutation isolation, empty/error. Desktop1440 and mobile360 light/dark component checks; no horizontal overflow observed. This does not prove auth routing, DB persistence, real Blob/CORS or full-app visual acceptance. Evidence at D:/KLTN/us19-smoke-20261009/ui/. No harness/mock imports in product.
- Gate A: code checks pass with noted native runner instability. Gate B Development migration NOT RUN/not authorized. Gate C real private Blob NOT RUN/not authorized. Gate D controlled component checks only; live Admin end-to-end NOT RUN. Figma frame matching remains unproven.
- Handoff: canonical RagDocument source now available for future Task184 FK design, but no vectors/schema184 or processing orchestration added. Task183/184/185 not started. Approval still checks original accessibility, not immutable approved bytes; that future boundary remains to be reviewed. No DB writes, real Blob records, Production access, OpenAI calls, commit/push/merge. Owner review required.
