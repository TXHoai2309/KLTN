# US-18 — Kiểm duyệt và phê duyệt tài liệu RAG

## Status

IMPLEMENTED IN CODE — live integration and visual acceptance not proven

## Epic

Quản trị kho tri thức RAG

## Owner

Admin

## Goal / User Story

Là Quản trị viên, tôi muốn xem tài liệu gốc, bắt đầu kiểm duyệt và phê duyệt tài liệu để kiểm soát tài liệu nào được phép chuyển tiếp sang lập chỉ mục.

## Outcome

Admin theo dõi được danh sách và chi tiết, truy cập file gốc riêng tư, thực hiện hai chuyển trạng thái hợp lệ. APPROVED chưa được dùng cho retrieval.

## Source References

- Product Document: MH-16, MH-18, YCCN-88, YCCN-91, YCCN-92, QTN-97, QTN-98, QTN-99, NT-170–NT-173.
- UI: chưa xác định được frame MH-16/MH-18 trong Figma đã cung cấp; dùng hệ thống Admin hiện tại. **BLOCKED: FIGMA** đối với đối chiếu chi tiết frame.
- `docs/stories/US-17-rag-upload.md` là prerequisite.

## Dependencies

US-17 model `RagDocument`, upload, private Blob, endpoint file gốc và shared idempotent write. Code hiện có; migration US-17 và Blob live chưa được xác nhận trên development.

## In Scope

- Danh sách, chi tiết, mở/tải file gốc cho Admin.
- `START_REVIEW`: UPLOADED → REVIEWING; `APPROVE`: REVIEWING → APPROVED.
- Kiểm tra file gốc trước APPROVE; từ chối nếu không thể truy cập.
- UI loading/empty/error, hành động theo server, responsive, light/dark, test.

## Out of Scope

Indexing, embeddings, chunking, retrieval, APPROVED → INDEXED, chuyển sang DISABLED (US-20), viewer PDF/DOCX riêng, public Blob URL, pagination.

## Business Rules

- Chỉ Admin được đọc, tải file và chuyển trạng thái; server kiểm tra quyền ở mọi endpoint.
- Transition do một hàm server quyết định từ trạng thái hiện tại và action, không nhận status đích từ client. Transition không hợp lệ trả FAILED/409.
- APPROVE yêu cầu file gốc còn truy cập được; nếu không, status giữ REVIEWING.
- UPLOADED, REVIEWING, APPROVED đều có `retrievalEligible: false`; chỉ INDEXED đủ điều kiện theo quy tắc hiện có.
- Race giữa hai request được chặn bằng cập nhật có điều kiện trạng thái trong transaction.

## Roles / Authorization

Guest: 401; Traveler: 403; Admin: được phép. Page Admin dùng access guard hiện có.

## Ownership Rules

Admin quản lý các tài liệu trong kho, không giới hạn theo uploader.

## UX / UI Contract

- `/admin/rag`: danh sách nhận diện file, nguồn, loại, trạng thái, retrieval; action tải mới và mở chi tiết; loading/empty/error có retry.
- `/admin/rag/[id]`: metadata, thông tin file, status, retrieval, file gốc; action chỉ lấy từ `allowedActions` server. SUCCESS mới đổi status; FAILED giữ trạng thái; UNKNOWN giữ trạng thái và cho retry cùng key.
- Reuse CSS/tokens và component Admin đang có; không suy diễn layout pixel từ Figma chưa kiểm chứng.

## Data Contract

Tái sử dụng `RagDocument` của US-17, không đổi schema. API loại `storagePath`, binary và private URL khỏi JSON. Thời gian theo `createdAt/updatedAt` hiện có.

## API Contract

- `GET /api/admin/rag-documents` → `apiSuccess({ items: [...] })`, không phân trang.
- `GET /api/admin/rag-documents/:id` → `apiSuccess({ document: {..., allowedActions: [...] } })`.
- `GET /api/admin/rag-documents/:id/file` → private stream sẵn có.
- `POST /api/admin/rag-documents/:id/actions` với JSON `{ "action": "START_REVIEW" | "APPROVE" }`, `Idempotency-Key`, same-origin → shared mutation envelope `SUCCESS/FAILED/UNKNOWN`.

## Error / Recovery

Unauthorized/forbidden theo shared error; missing document 404; invalid transition 409; missing original 409 business failure; lỗi không xác định theo shared UNKNOWN. Read error có retry.

## Write Semantics / Idempotency

Mỗi attempt dùng `Idempotency-Key`; retry UNKNOWN giữ nguyên key và body. Successful write cùng response được lưu atomically. External Blob check ở ngoài transaction. UI chỉ áp dụng response SUCCESS.

## External Services

Vercel Blob private của US-17; kiểm tra metadata/existence trước approval. Không thêm dịch vụ.

## Acceptance Criteria

- [x] Admin list/detail service và private file endpoint hiện có; Guest/Traveler bị chặn trong test service. Browser live chưa chứng minh.
- [x] UPLOADED → REVIEWING, REVIEWING → APPROVED thành công trong test.
- [x] Transition sai action/status bị từ chối; file không truy cập được giữ REVIEWING trong test.
- [x] APPROVED vẫn `retrievalEligible: false`.
- [x] UI áp dụng response SUCCESS, giữ status cũ khi FAILED/UNKNOWN qua helper được test.
- [ ] Loading/empty/error được implement; mobile 360px và light/dark chưa kiểm tra trực quan trong Admin session.

## Test Plan

Node test qua tsx: transition hợp lệ và không hợp lệ, file mất, quyền, list/detail, retrieval, UNKNOWN UI. Chạy targeted, root tests, types, build, diff check.

## Expected Modules / Files

`rag-service.ts`, `rag-storage.ts`, API Admin RAG, `/admin/rag` UI, tests, story và ai-progress.

## Migration Impact

Không có schema change US-18.

## Environment Impact

Tái dùng `BLOB_READ_WRITE_TOKEN`, `DATABASE_URL` US-17; không thêm biến.

## Implementation Sequence

1. Audit US-17 và nguồn; xác định contract.
2. Test service/state/action/authorization và client success-only state.
3. Implement service, storage check, thin routes.
4. Implement Admin list/detail và navigation.
5. Verify và ghi bằng chứng.

## Acceptance Evidence

- TDD: test đỏ khi thiếu `rag-review-state`; sau implementation `npm run test:rag --workspace=web` PASS 26/26 (15 US-17, 11 US-18). US-18 test bao gồm list/detail projection, hai transition hợp lệ, replay cùng key, các transition sai, file mất, quyền Guest/Traveler, payload status tự chọn bị từ chối và UNKNOWN không đổi UI state.
- Root `npm run test`, `npm run check-types`, `npm run build`, `git diff --check` PASS. Build ghi nhận route `/admin/rag`, `/admin/rag/[id]`, ba read/action routes Admin RAG. `git diff --check` chỉ có cảnh báo chuyển dòng LF/CRLF của file Favorites có sẵn.
- UI dùng tokens/CSS Admin hiện có và có breakpoint <=700px. Chưa có Admin browser session để xác nhận layout 360px, tương phản light/dark và tải file gốc thực tế.
- US-18 không đổi Prisma schema/migration/dependency/env. Migration US-17 có trên nhánh nhưng **chưa apply** tại development DB trong session này; Blob private live chưa kiểm tra. Vì vậy runtime persistence, HEAD approval guard với Blob thật và end-to-end approval đều NOT PROVEN.
- Figma: chưa định vị/inspect được frame MH-16/MH-18 từ file được cung cấp; đối chiếu thiết kế chi tiết **BLOCKED: FIGMA**.

## Open Questions

- Frame MH-16/MH-18 trong Figma chưa truy cập/định vị được.
- Chưa có bằng chứng migration US-17 được apply và private Blob hoạt động trên development; cần Admin session, token Blob và development DB để chứng minh live.

## Handoff Notes

Dừng ở APPROVED; lập chỉ mục thuộc US-19, vô hiệu hóa thuộc US-20.


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
