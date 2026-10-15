# US-33 — Chỉnh sửa bằng AI

## Status

DRAFT

## Epic

Quản lý hành trình đã lưu và hỗ trợ trong chuyến đi — Sprint 4.

## Owner

Đào Duy Bình; phối hợp Thai Anh Nguyen (Trip/Validator) và Tô Xuân Hoài (Planner).

## Goal / User Story

Là Du khách, tôi muốn yêu cầu AI chỉnh sửa hành trình đã lưu và xem phương án trước khi xác nhận, để AI hỗ trợ thay đổi mà không tự áp dụng lên chuyến đi của tôi.

## Outcome

Contract DRAFT cho task 271–277; AI chỉ sinh candidate/nhu cầu làm rõ. Preview và apply dùng [thiết kế chung US-32](US-32-manual-itinerary-edit.md#shared-stateless-previewapply-design).

## Source References

- [Product contract](../product/product-spec.md#edit-save-and-in-trip-support): Edit, save, and in-trip support; Trip requirements and planning; Deterministic Constraint Validator.
- [User flows](../flow/user-flow.md#edit-itinerary): Edit itinerary; In-trip assistant; Write recovery.
- [US-32](US-32-manual-itinerary-edit.md), [US-28](US-28-trip-planner.md), [ADR-08/09/10](../decisions.md), backlog Bình cung cấp ngày 2026-10-15.
- DOCX/Figma frame/requirement IDs chưa đối chiếu; không tự suy diễn từ mockup.

## Dependencies

- US-30 task 252/253 và US-31 task 257/260 của Thai Anh: owned Trip/read/save, visit identity và baseRevision; chưa có trên nhánh tại P0.
- US-29A/B/C task 236–251 của Thai Anh: Validator deterministic và routing; hiện chỉ có code sơ bộ trong `modules/trip-planner`, chưa có handoff nghiệm thu.
- Planner US-28 của Hoài có candidate eligibility/schema sơ bộ, **không có OpenAI Planner client**. `modules/preference-extraction/openai-structured-client.ts` có client cho extraction, không mặc định phù hợp AI edit. Chốt khả năng tái dùng trước khi thêm client/env/dependency.
- US-32 cung cấp contract candidate/preview/apply/replay/CAS; chưa implement. Không tự dựng DB model/Validator/provider mock runtime.

## In Scope

- Structured output cho ý định, phạm vi ảnh hưởng, candidate hoặc yêu cầu làm rõ.
- Sinh phương án riêng từ owned itinerary và điểm đến đủ điều kiện, chạy Validator, hiển thị/xác nhận/hủy.

## Out of Scope

- AI tự ghi Trip, tự PASS Validator, tự suy diễn thời gian routing hoặc sửa completed visits không có policy.
- Provider/client/env mới chưa được hỏi, lưu hội thoại/candidate lâu dài, RAG Q&A, in-trip replan (US-36/37), tạo Trip ban đầu.

## Task Breakdown

| ID | Tên task |
| --- | --- |
| 271 | [AI] structured output |
| 272 | [AI] nhận diện ý định + phần bị ảnh hưởng |
| 273 | [BE/API] sinh phương án riêng |
| 274 | [AI/BE] yêu cầu làm rõ |
| 275 | [BE] Validator cho phương án AI |
| 276 | [FE] đề xuất chưa áp dụng + xác nhận/hủy |
| 277 | [TEST] |

## Business Rules

- AI chỉ đề xuất; structured output phải được server kiểm tra cấu trúc, IDs, ownership liên quan và eligibility trước khi preview. Output sai/thiếu không được chuyển thành phương án hợp lệ bằng cách đoán.
- Ý định/phạm vi ảnh hưởng AI trả về là gợi ý. Server tính lại diff và các chặng/visit liên quan, không dùng affected IDs của model làm bằng chứng đủ phạm vi Validator.
- Yêu cầu mơ hồ/thiếu thông tin cần làm rõ; không mặc định thay đổi hoặc tự chọn phương tiện ngoài MOTORCYCLE/CAR.
- Không truyền private Trip cho AI trước auth/ownership. Không tự ghi, certify hoặc bỏ qua VIOLATION/INSUFFICIENT_DATA.
- Candidate chỉ ở bộ nhớ client; request xử lý tạm trên server, không có proposal store. User sửa candidate/nhu cầu thì preview cũ hết hiệu lực.
- Theo US-32: `Asia/Ho_Chi_Minh`, core nhận `now`; apply phải revalidate ngoài transaction rồi kiểm ownership/baseRevision, ghi và revision+1 trong transaction.

## Roles / Authorization

Chỉ `requireTraveler`, auth trước body; Guest 401/Admin 403. Private `no-store` trên mọi response; Route Handler mỏng, orchestration/ownership ở service. Không tự replay write sau đăng nhập.

## Ownership Rules

Owned Trip query dùng `id AND userId` từ session, cùng 404 cho missing/foreign. Visit/day trong request hoặc AI output phải thuộc đúng Trip; dữ liệu gửi AI chỉ sau boundary này. Apply recheck trong transaction theo US-32.

## UX / UI Contract

Hiển thị yêu cầu, clarification, diff, nhóm Validator/visit/chặng ảnh hưởng và nhãn “đề xuất chưa áp dụng”. Có generating/previewing/error/cancel/applying/FAILED/UNKNOWN/conflict/SUCCESS; không dùng thông báo AI thành công như đã lưu Trip. Hủy trước apply giữ itinerary cũ; không hứa abort request đã gửi sẽ rollback. Figma chưa xác minh; hỗ trợ keyboard/360px+, link typedRoutes theo code hiện có.

## Data Contract

**Đề xuất:** request `{ baseRevision, instruction, candidate? }`, candidate tùy chọn là bản local hiện tại; schema/limits chờ handoff US-32. AI output tách clarification và proposal: ý định/phần ảnh hưởng, câu hỏi thiếu thông tin hoặc candidate có cấu trúc. Không cho model author `userId`, revision mới, PASS hay write status. Server response trả candidate đã kiểm cấu trúc, diff, clarification/checks tương ứng; chưa chốt field/discriminator/token limits.

## API Contract

- Đề xuất `POST /api/trips/[id]/edit/ai-preview`: auth/owned read → kiểm request → AI ngoài transaction → kiểm output → Validator ngoài transaction nếu có candidate → trả `{ success: true, data }`. Clarification không được biểu diễn như PASS hoặc saved. Không ghi DB/idempotency record cho candidate.
- Apply dùng `POST /api/trips/[id]/edit/apply` của US-32: đầy đủ `{ baseRevision, candidate, confirmed: true }` và `Idempotency-Key`; không cần giữ AI proposal ID ở server hoặc gọi AI lại để apply.
- Shared errors/cache/auth như US-32. Phân biệt cần làm rõ, output không hợp lệ và lỗi kỹ thuật provider; mã/status cụ thể cần chốt, không tạo envelope mới.

## Error / Recovery

Giữ instruction/candidate local khi generation/validation lỗi; không ghi nội dung riêng vào log/URL/storage. Candidate stale hoặc revision conflict cần xem lại; cancel/reject không ghi. UNKNOWN apply chỉ retry request/key cũ, không tái sinh candidate rồi gửi cùng key. Preview AI lặp có thể phát sinh chi phí, chưa có bảo đảm exactly-once provider.

## Write Semantics / Idempotency

AI-preview không ghi Trip hoặc draft. Apply kế thừa toàn bộ US-32: shared `executeIdempotentWrite`, SUCCESS/FAILED/UNKNOWN, hash tripId/baseRevision/candidate/xác nhận, CAS và revision+1 nguyên tử. Replay thành công trước revalidation/conflict mới; không gọi AI/Routes trong callback transaction. Cơ chế hạn chế chi phí preview chờ quyết định riêng, không giả dùng idempotency write để lưu candidate.

## External Services

OpenAI cho đề xuất/ngôn ngữ; Validator quyết định độc lập. Google Routes từ US-29B, dữ liệu thiếu/timeout tối đa 10s → INSUFFICIENT_DATA. Không thêm client/env/dependency hoặc thực hiện live call trong task docs.

## Acceptance Criteria

- [ ] Task 271/272: output được parse strict theo schema đã chốt; intent/affected scope không thay quyền quyết định của server.
- [ ] Task 273/274: candidate tách biệt; yêu cầu chưa rõ sinh clarification, không tự áp dụng hoặc tự thay bằng dữ liệu đoán.
- [ ] Task 275: đủ bốn nhóm bắt buộc, affected neighbors được revalidate; chỉ PASS toàn bộ mới đủ điều kiện xác nhận.
- [ ] Task 276: diff và trạng thái chưa áp dụng rõ ràng; hủy giữ itinerary cũ; xác nhận gọi apply US-32 và chỉ cập nhật sau SUCCESS.
- [ ] Guest/Admin/foreign Trip không dispatch AI hoặc nhận dữ liệu Trip; foreign/missing cùng 404.
- [ ] Task 277: replay/CAS/UNKNOWN và provider/output lỗi có tests; không tuyên bố implemented khi Trip/Validator chưa handoff.

## Test Plan

- `.ts` core/UI logic và `*.vitest.test.ts`: fake AI structured output đúng/sai/extra field, unknown ID, prompt injection-like instruction, clarification và server-calculated affected scope.
- Fake repository/Validator/routes, fixed `now`: cả ba trạng thái, không write trước xác nhận, không external call trong transaction.
- Auth/body ordering, 404 isolation trước AI; apply replay không gọi AI lại, revision race, cancel, lost response và same-key payload mismatch.
- Không OpenAI/Google thật hoặc Neon. Manual preview/clarify/keyboard/responsive khi đủ dependency; runtime tests chưa chạy ở task docs.

## Expected Modules / Files

- `apps/web/src/modules/trip-edit/ai-*.ts`, shared edit contract/service và `*.vitest.test.ts`.
- `apps/web/src/app/trips/[id]/edit/`: instruction/clarification/preview UI và logic `.ts`.
- `apps/web/src/app/api/trips/[id]/edit/ai-preview/route.ts` đề xuất; reuse apply US-32.
- Chỉ phối hợp/tái dùng US-28, extraction client và US-29; không sửa `/trips/new`, shared Planner hay schema của dev khác trong docs task.

## Migration Impact

Không có migration trong task docs; Trip/revision thuộc dependency US-30. Không thêm bảng candidate/AI draft.

## Environment Impact

Không đổi env/dependency. Model/client và chi phí AI edit cần duyệt, không mặc định dùng `OPENAI_PREFERENCE_MODEL` dành cho extraction.

## Implementation Sequence

1. Chốt Trip/Validator/US-32 contract, schema AI và chính sách provider.
2. AI output verification/clarification → preview integration → UI → reuse apply → tests/evidence.

## Acceptance Evidence

2026-10-15: chỉ tạo story DRAFT; chưa code task 271–277, live provider, API, DB hoặc UI acceptance. Dependency hiện trạng dựa trên đọc code P0.

## Open Questions

- OQ-A/B/E/F/G/H ở [US-32](US-32-manual-itinerary-edit.md#open-questions) tiếp tục áp dụng: completed visits, hidden historical destination, revision, DTO/bounds, freshness và mandatory checks/replay.
- Bình + Hoài chốt intent set, structured output/discriminator, phạm vi AI được sửa, schema visit mới và cách thể hiện yêu cầu làm rõ; không tự lập danh sách intent nghiệp vụ như đã duyệt.
- Có thể tái dùng client hiện có không; model, budget, timeout/retry và admission/rate limit nào được duyệt? Không tạo env/client mới trước khi hỏi.
- Giới hạn instruction/context, dữ liệu riêng nào được phép gửi provider và policy hủy request đang chạy cần chốt; abort không chứng minh provider chưa tính phí.

## Handoff Notes

Candidate/apply thuộc US-32, không dựng cơ chế persistence thứ hai. Thai Anh bàn giao Trip/US-29; Hoài bàn giao Planner/schema/provider seam; Bình phụ trách AI edit. Chưa mở rộng sang in-trip.
