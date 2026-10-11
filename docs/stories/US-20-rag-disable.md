# US-20 — Vô hiệu hóa tài liệu RAG

## Status

IMPLEMENTED IN CODE — live retrieval integration blocked by US-19

## Epic

Quản trị kho tri thức RAG

## Owner

Admin

## Goal / User Story

Là Quản trị viên, tôi muốn vô hiệu hóa tài liệu RAG để tài liệu không còn được sử dụng trong các lượt truy xuất mới.

## Outcome

Admin có thể chuyển tài liệu từ UPLOADED, REVIEWING, APPROVED hoặc INDEXED sang DISABLED. Bản ghi và file gốc vẫn tồn tại trong khu vực quản trị. DISABLED là trạng thái cuối và không đủ điều kiện retrieval.

## Source References

- Product Document: QTN-102–QTN-107, NT-177–NT-179, NT-252; MH-16/MH-18 cho màn quản trị.
- System Specification: mục 5.4 (điều kiện nguồn RAG), mục 12.3 (vòng đời tài liệu).
- Figma: frame MH-16/MH-18 chưa truy cập được theo US-18; tiếp tục dùng hệ thống giao diện Admin hiện tại. **BLOCKED: FIGMA** đối với đối chiếu thiết kế chính xác.

## Dependencies

US-17/US-18 hiện diện trong commit `4c6df61` trên nhánh `ThaiAnh`; working tree sạch trước US-20. Nhánh `master` chỉ chứa foundation cũ. Audit source hiện tại không thấy story/module US-19, indexing hay retrieval query thực tế.

## In Scope

- Thêm action DISABLE vào state machine và mutation endpoint của US-18.
- Hiển thị hành động vô hiệu hóa tại MH-18 khi được phép; trạng thái DISABLED rõ ràng ở chi tiết và danh sách.
- Kiểm thử quyền, transition, write semantics và canonical retrieval eligibility.

## Out of Scope

Re-enable, trạng thái ENABLED, xóa bản ghi/file/metadata, indexing/chunking/embeddings, vector search hoặc retrieval giả, US-19.

## Business Rules

- `UPLOADED | REVIEWING | APPROVED | INDEXED → DISABLED`; DISABLED không có transition nào trong MVP.
- Server quyết định status đích từ action DISABLE; frontend không gửi status.
- Canonical eligibility là `status === INDEXED`, không phải `status !== DISABLED`.
- Bản ghi DISABLED vẫn xuất hiện trong Admin list/detail; mọi lượt retrieval thực tế trong tương lai phải lọc theo status INDEXED tại nguồn truy vấn.
- Nội dung DISABLED trong hội thoại cũ không phải bằng chứng hợp lệ cho câu trả lời mới (QTN-107); thực thi truy vấn mới chờ US-19.

## Roles / Authorization

Guest 401, Traveler 403, Admin được phép. Role được kiểm tra trên server trước và trong transaction như US-18.

## Ownership Rules

Admin quản lý toàn bộ kho tài liệu, không giới hạn theo uploader.

## UX / UI Contract

- Chi tiết: action “Vô hiệu hóa” ở bốn trạng thái đang hoạt động; xác nhận trước thao tác vì terminal. DISABLED hiển thị “Đã vô hiệu hóa”, không có action lifecycle tiếp theo.
- Danh sách vẫn hiển thị tài liệu DISABLED và badge hiện trạng.
- Chỉ đổi UI status sau SUCCESS; FAILED/UNKNOWN giữ status đã xác nhận, UNKNOWN retry cùng request/key. Reuse light/dark/responsive styles và states của US-18.

## Data Contract

Tái dùng enum/status `RagDocument` hiện có; không thêm schema/migration. File gốc, metadata và row không bị xóa.

## API Contract

Tái dùng `POST /api/admin/rag-documents/:id/actions` với JSON `{ "action": "DISABLE" }`, header `Idempotency-Key`, same-origin; shared mutation envelope `SUCCESS | FAILED | UNKNOWN`. `GET` list/detail vẫn là Admin-only và trả `retrievalEligible` từ predicate canonical.

## Error / Recovery

DISABLED → mọi action và chuyển trạng thái sai trả FAILED/409. Guest/Traveler bị từ chối. Technical uncertainty trả UNKNOWN; không dự đoán kết quả trên UI.

## Write Semantics / Idempotency

Reuse `executeIdempotentWrite` với scope document/action, conditional update trong transaction và cùng-key replay. UNKNOWN retry dùng đúng key/body. Không xóa dữ liệu khi disable.

## External Services

Không có call Blob mới cho DISABLE; file gốc vẫn trong private Blob. Không thêm dịch vụ.

## Acceptance Criteria

- [x] Admin disable được từ UPLOADED, REVIEWING, APPROVED, INDEXED trong service tests.
- [x] DISABLED terminal, không có action re-enable; Guest/Traveler bị chặn trong service tests.
- [x] Danh sách và chi tiết vẫn hiển thị DISABLED, giữ metadata/file trong service tests.
- [x] INDEXED eligibility true; bốn trạng thái còn lại false theo predicate canonical được test.
- [x] UI helper chỉ hiển thị DISABLED sau SUCCESS; FAILED/UNKNOWN giữ status trước trong tests.
- [ ] Khi retrieval thật tồn tại, INDEXED được chọn và DISABLED bị loại ở truy vấn nguồn. **BLOCKED BY US-19** trong snapshot này.

## Test Plan

Node test/tsx theo style hiện có: bốn transition, terminal, quyền, list/detail, UI disabled label/action, idempotency, UNKNOWN/FAILED, predicate đủ năm trạng thái. Nếu US-19 xuất hiện trong quá trình làm, tích hợp và kiểm thử real retrieval query; nếu không, ghi blocked.

## Expected Modules / Files

`rag-service.ts`, `rag-review-ui.tsx`, `rag-review.test.ts`, có thể `rag-file.test` hiện có; story và ai-progress. API route giữ nguyên.

## Migration Impact

Không có.

## Environment Impact

Không có biến mới.

## Implementation Sequence

1. Audit branch, US-17/18, US-19 và source documents.
2. Viết test đỏ cho DISABLE và eligibility.
3. Mở rộng state machine/service, rồi action UI.
4. Chạy targeted và full checks; ghi evidence và giới hạn.

## Acceptance Evidence

- TDD: `npm run test:rag --workspace=web` ban đầu có 5 ca đỏ về action DISABLE/allowedActions; sau implementation 34/34 PASS, gồm 8 ca US-20 mới. Test kiểm tra bốn transition, same-key replay, terminal, quyền, danh sách/chi tiết còn bản ghi, badge “Đã vô hiệu hóa”, eligibility đủ năm trạng thái và UI state khi FAILED/UNKNOWN.
- `npm run test`, `npm run check-types`, `npm run build` PASS. Route/action US-18 được tái dùng; không thêm API, schema, migration, dependency hay env. `git diff --check` PASS.
- `retrievalEligible(status)` sẵn có dùng đúng `status === "INDEXED"`; list/detail và transition trả eligibility từ cùng hàm. Trước khi disable, INDEXED true; sau DISABLED false trong service tests.
- **BLOCKED BY US-19:** không có indexing/retrieval module hoặc query thực tế trong nhánh `ThaiAnh`; không có chỗ để tích hợp DB predicate hoặc chạy NT-252 end-to-end. Chưa chứng minh lượt RAG mới loại DISABLED và không tái dùng nguồn từ hội thoại cũ.
- Admin browser session/live DB/Blob và frame Figma MH-16/MH-18 không có trong session; light/dark và 360px chưa được kiểm tra trực quan. Unit render xác nhận nhãn DISABLED, build xác nhận bundle.

## Open Questions

- Exact MH-16/MH-18 Figma frame chưa truy cập được.
- End-to-end retrieval chỉ có thể chứng minh sau khi US-19 tạo indexing/retrieval thật.

## Handoff Notes

Dừng ở lifecycle disable và eligibility; không tự tạo US-19 hoặc chức năng kích hoạt lại.
