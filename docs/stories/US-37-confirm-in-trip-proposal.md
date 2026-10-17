# US-37 — Xác nhận phương án in-trip

## Status

DRAFT

## Epic

Hỗ trợ trong chuyến đi — Sprint 4.

## Owner

Đào Duy Bình; phối hợp Thai Anh Nguyen (Trip/Validator) và Tô Xuân Hoài (Planner/schema).

## Goal / User Story

Là Du khách, tôi muốn xem kết quả kiểm tra và xác nhận phương án in-trip hợp lệ, để hành trình chỉ cập nhật sau khi kiểm tra lại ràng buộc hiện hành và database xác nhận ghi thành công.

## Outcome

Contract DRAFT task 293–297. Dùng [US-32 shared stateless preview/apply design](US-32-manual-itinerary-edit.md#shared-stateless-previewapply-design), bổ sung kiểm tra thời gian hiện hành, location và bảo vệ completed visits; không tạo draft store.

## Source References

- [Product contract](../product/product-spec.md#edit-save-and-in-trip-support): Edit, save, and in-trip support; Deterministic Constraint Validator; Write semantics and recovery; Roles and access.
- [User flows](../flow/user-flow.md#in-trip-assistant): In-trip assistant; Edit itinerary; Write recovery.
- [US-32](US-32-manual-itinerary-edit.md), [US-35](US-35-current-manual-location.md), [US-36](US-36-in-trip-replan.md), [ADR-08/09/10](../decisions.md), task list Bình ngày 2026-10-15.
- DOCX/Figma/requirement IDs cụ thể chưa đối chiếu; không tự thêm thời gian đệm, deadline hoặc completion policy.

## Dependencies

- **Trip của Thai Anh:** US-30 task 252/253 và US-31 task 257/258/260: owned persistence/read, stable visits, completion source và revision/CAS. Chưa có tại P0; không tự tạo schema/mock runtime.
- **Validator của Thai Anh:** US-29A/B/C task 236–251: bốn nhóm bắt buộc, route/data/time injection và eligibility. Code sơ bộ `planner-validator.ts`/`planner-routes.ts` chưa chứng minh đủ in-trip semantics.
- **Planner của Hoài:** US-28 schema/candidates/routes/UI checks cần adapter với visits của US-30. Không tin `eligibleForFinalConfirmation` từ client/Planner cũ như authority cho apply.
- US-32 shared candidate/apply/replay design; US-35 location; US-36 candidate và completed-preservation policy sau khi được duyệt.

## In Scope

- Kiểm tra Validator in-trip và ràng buộc thời gian/location/completion hiện hành.
- Hiển thị checks, xác nhận rõ ràng và apply idempotent sau server revalidation.

## Out of Scope

- Sinh AI proposal mới (US-36), tự thay phương án đã xác nhận, tự đánh dấu completed, background GPS, tạo/lưu Trip ban đầu.
- Tự ghi candidate chưa hợp lệ, tự merge revision conflict hoặc quyết định policy còn mở.

## Task Breakdown

| ID | Tên task |
| --- | --- |
| 293 | [BE] Validator in-trip |
| 294 | [BE] kiểm tra lại ràng buộc thời gian |
| 295 | [FE] kết quả Validator + xác nhận |
| 296 | [BE/API] chỉ cập nhật khi đạt + xác nhận + ghi thành công |
| 297 | [TEST] |

## Business Rules

- Proposal/preview không là hành trình đã lưu. Apply gửi lại đầy đủ candidate + baseRevision + location/time context cần thiết và xác nhận; server không lấy trạng thái PASS của client làm bằng chứng.
- Chạy lại bốn nhóm bắt buộc và ràng buộc in-trip, gồm khả năng đi từ vị trí hiện tại đến phần còn lại/đích trước hạn theo policy đã chốt. VIOLATION/INSUFFICIENT_DATA đều chặn; missing route/timeout tối đa 10s không được PASS.
- Dùng thời gian server hiện hành truyền vào core qua `now`, timezone Asia/Ho_Chi_Minh. Không dùng thời điểm preview hoặc clock AI/client làm authority; phương án từng PASS có thể không còn hợp lệ khi apply.
- Server đối chiếu completed visits với owned persisted context; không cho candidate sửa/xóa phần được bảo vệ. Completion policy còn OQ-A, không tự suy theo giờ.
- Apply Validator ngoài transaction; trong transaction kiểm lại actor/ownership/baseRevision rồi ghi + revision+1 nguyên tử, theo US-32. Phương án không đạt hoặc user không xác nhận thì không ghi itinerary.
- Nếu cần thay đổi candidate sau kiểm tra, trả lại để user review/xác nhận lại; không tự sửa rồi áp dụng một phương án user chưa thấy.

## Roles / Authorization

`requireTraveler` trước body; Guest 401/Admin 403, Admin không bypass. Route mỏng; service sở hữu nghiệp vụ/ownership, private `no-store` trên tất cả response. Sau login không tự replay apply.

## Ownership Rules

Owned Trip query `WHERE id AND userId` session; foreign/missing cùng 404. Đối chiếu visit/day thuộc đúng Trip, không nhận owner/completed state từ client. Transaction recheck quyền/ownership và CAS baseRevision; lifecycle hoàn thành phải được bảo vệ theo contract được duyệt, không chỉ khóa UI.

## UX / UI Contract

Hiển thị bốn nhóm và đối tượng/chặng/đích hạn liên quan, PASS/VIOLATION/INSUFFICIENT_DATA bằng text; chỉ cho xác nhận khi preview đủ điều kiện và user chọn rõ ràng. Khi gửi apply có pending lock; server vẫn tự kiểm lại. Có thất bại do thời gian đã trôi, revision conflict, FAILED/UNKNOWN/retry/SUCCESS; không cập nhật màn hành trình thành công trước commit. Hủy trước apply giữ nguyên Trip; đang UNKNOWN không báo đã hủy/rollback. Figma cần đối chiếu, keyboard/360px+, link typedRoutes theo hiện có.

## Data Contract

**Đề xuất:** `{ baseRevision, candidate, location, timeConstraints, confirmed: true }`; location theo US-35, candidate theo US-32/36 sau handoff. Không nhận Validator proof hoặc client `now` làm authority. Preview/check result có bốn nhóm/issues, ảnh hưởng visit/leg/deadline, thời điểm server kiểm tra và eligibility; dữ liệu thiếu thể hiện rõ. Apply SUCCESS trả Trip/result và revision đã commit. DTO/bounds/field mapping chưa chốt, không tự dựng thay Trip schema.

## API Contract

- Preview qua `POST /api/trips/[id]/in-trip/preview` của US-36; phần deterministic validation của US-37 dùng chung, không tạo proposal store.
- Đề xuất `POST /api/trips/[id]/in-trip/apply` nhận body trên + `Idempotency-Key`; response shared mutation envelope `operationStatus: SUCCESS | FAILED | UNKNOWN`.
- Service auth/owned context → resolve committed replay nếu có → normalize/reload current data → Validator/time/completion ngoài transaction cho apply mới → shared idempotent transaction/CAS. Không gọi AI lại trong apply để thay candidate.
- Đề xuất mapping: 400 malformed, 401/403 auth, 404 missing/foreign, 409 revision/key conflict, 422 không đủ điều kiện. Routing thiếu dữ liệu đi qua checks; tên error/DTO cụ thể chờ chốt. Technical uncertainty sau write phải UNKNOWN, không suy thành FAILED.

## Error / Recovery

Candidate không còn hợp lệ vì thời gian/location/data thay đổi: hiển thị kết quả mới, không ghi và để user xem lại. Conflict không tự merge. FAILED biết chắc rollback giữ dữ liệu cũ; UNKNOWN có thể đã commit, giữ nguyên body/key cho retry/đối soát. Không tự lấy GPS mới hoặc đổi deadline/candidate dưới cùng key. Replay đã commit trả kết quả cũ, không chạy lại Validator rồi từ chối vì thời gian/revision đã thay đổi.

## Write Semantics / Idempotency

Kế thừa đầy đủ [US-32 shared design](US-32-manual-itinerary-edit.md#shared-stateless-previewapply-design). Operation đề xuất `in-trip:apply`; input hash bao gồm tripId và toàn bộ confirmed request, actor/operation scope từ server. `executeIdempotentWrite` ghi itinerary + revision+1 + success record nguyên tử. CAS bảo vệ hai tab/request cạnh tranh; replay không tăng revision lần hai. OpenAI/Routes/Validator cần routing ở ngoài transaction callback. Revalidation mới không làm mất khả năng replay SUCCESS đã commit.

## External Services

Tái dùng Google Routes US-29B cho `DRIVE`/`TWO_WHEELER`, deadline tối đa 10s. GPS/manual context theo US-35; freshness policy chưa chốt. Không gọi AI để certify hoặc ghi. Không live provider call/dependency/env mới trong task docs.

## Acceptance Criteria

- [ ] Task 293 trả đủ bốn nhóm; thiếu dữ liệu không bao giờ được nâng thành PASS.
- [ ] Task 294 dùng authoritative `now` và context hiện hành khi apply mới, không tin preview cũ/client clock; deadline và completed preservation được kiểm lại theo policy đã duyệt.
- [ ] Task 295 hiển thị nhóm/đối tượng/chặng ảnh hưởng, explicit confirmation và trạng thái recovery; candidate thay đổi cần preview lại.
- [ ] Task 296 chỉ ghi khi tất cả mandatory checks PASS và user xác nhận; ownership/baseRevision/CAS/write/revision+1/success record nguyên tử; không external call trong transaction.
- [ ] Phương án không đạt/hủy trước apply không ghi; UNKNOWN không báo success/cancel; retry cùng key/payload replay một commit kể cả thời gian/revision đã đổi.
- [ ] Task 297 bao phủ concurrent tabs, auth/ownership, mất response, deadline/completion changes; acceptance không được ghi PASS từ docs.

## Test Plan

- `*.vitest.test.ts`, pure `.ts` logic; inject `now`, fake repository/Validator/Routes, không Neon/OpenAI/Google thật.
- PASS/VIOLATION/INSUFFICIENT_DATA từng nhóm; preview PASS rồi apply fail do thời gian; routing timeout/unavailable; boundary deadline sau khi chốt `<`/`<=`.
- Auth trước body, A/B/missing 404, tampered userId/clock/PASS/completed visits; preservation và data-change rejection.
- Transaction ordering/CAS, two tabs cùng revision, rollback không ghi một phần, idempotent same-key replay sau commit không revalidate/provider/tăng revision, khác payload conflict, UNKNOWN lost response.
- UI pending/FAILED/UNKNOWN/refresh-confirmation/keyboard/responsive manual khi dependency có; chưa có evidence runtime trong task docs.

## Expected Modules / Files

- `apps/web/src/modules/in-trip/`: validation/apply service/http/contract/logic và `*.vitest.test.ts`.
- `apps/web/src/components/in-trip/`, `app/trips/[id]/in-trip/`: checks/confirmation/recovery UI, state logic `.ts`.
- `app/api/trips/[id]/in-trip/apply/route.ts` đề xuất; reuse preview US-36 và shared design US-32.
- Chỉ đọc/tái dùng Trip/Validator/Planner sau handoff, không tự sửa model/shared idempotency/Trip detail của dev khác trong docs task.

## Migration Impact

Không migration ở task docs; phụ thuộc Trip revision/completion schema US-30 và OQ-A/E. Không lưu candidate. Mọi SQL tương lai phải được review trước apply; không `db:push`/reset/sửa migration cũ.

## Environment Impact

Không thêm env/dependency/client. Thiếu routing configuration/data không được coi là đủ điều kiện apply.

## Implementation Sequence

1. Chốt completion/location/deadline/revision và replay protocol với US-32/35/36 cùng Thai Anh/Hoài.
2. Deterministic validation/time → UI → idempotent apply/CAS → tests và evidence trước acceptance.

## Acceptance Evidence

2026-10-15: chỉ tạo DRAFT task 293–297; chưa có validation/apply in-trip implementation, DB/migration, API/UI hoặc live smoke. Missing Trip/visit/revision và policy không được thay bằng runtime mock.

## Open Questions

- **OQ-A/B/C/E/G/H** ở [US-32](US-32-manual-itinerary-edit.md#open-questions) áp dụng đầy đủ: completed source, hidden historical destination, location cụ thể/freshness, revision, data freshness và checks/replay.
- Khoảng thời gian giữa validation ngoài transaction và commit được xử lý thế nào khi completed/location/deadline/data đổi? Chốt snapshot/fencing/checks DB cần thiết; không gọi provider trong transaction hoặc tự đặt TTL/buffer.
- “Đến trước hạn” là `<` hay `<=`, nguồn deadline nào authoritative? Theo quyết định US-36, không tự thêm giờ cố định.
- Nếu US-29 cần API riêng cho in-trip origin/remaining visits thì adapter/hợp đồng nào do Thai Anh bàn giao? Không nhầm bốn nhóm bắt buộc với MOBILITY bổ sung của Planner sơ bộ.
- Chốt operation/error names, request bounds và replay authorization với shared helper; chưa thể READY khi revision protocol chưa có.

## Handoff Notes

US-36 sinh candidate, US-37 kiểm lại và ghi sau xác nhận; US-32 là thiết kế chung duy nhất. Thai Anh cung cấp Trip/Validator, Hoài cung cấp Planner contract, Bình triển khai in-trip sau handoff. Task hiện tại chỉ docs, không code/migration/commit/push/merge.
