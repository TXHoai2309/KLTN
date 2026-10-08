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
