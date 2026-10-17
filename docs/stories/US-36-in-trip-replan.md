# US-36 — Replan in-trip

## Status

DRAFT

## Epic

Hỗ trợ trong chuyến đi — Sprint 4.

## Owner

Đào Duy Bình; phối hợp Thai Anh Nguyen (Trip/Validator) và Tô Xuân Hoài (Planner).

## Goal / User Story

Là Du khách đang trong chuyến đi, tôi muốn Trợ lý đề xuất điều chỉnh phần hành trình còn lại theo vị trí, thời gian và nhu cầu mới, để xem phương án phù hợp mà giữ nguyên lượt đã hoàn thành.

## Outcome

Contract DRAFT task 286–292 cho candidate in-trip chưa áp dụng. Xác nhận/ghi nằm ở US-37; dùng [thiết kế chung US-32](US-32-manual-itinerary-edit.md#shared-stateless-previewapply-design), không lưu candidate phía server.

## Source References

- [Product contract](../product/product-spec.md#edit-save-and-in-trip-support): Edit, save, and in-trip support; Deterministic Constraint Validator; Roles and access.
- [User flows](../flow/user-flow.md#in-trip-assistant): In-trip assistant; Edit itinerary; Write recovery.
- [US-32](US-32-manual-itinerary-edit.md), [US-35](US-35-current-manual-location.md), [US-28](US-28-trip-planner.md), [ADR-08/09/10](../decisions.md), backlog Bình ngày 2026-10-15.
- Product/System DOCX, Figma frame và requirement ID chi tiết chưa đối chiếu; không tự gán policy hoàn thành/deadline.

## Dependencies

- **Trip của Thai Anh:** US-30 task 252 và US-31 task 257/258/260 cần owned itinerary, visit identity, dates/status/revision. Chưa có tại P0; trạng thái Trip không mặc định là trạng thái hoàn thành của từng visit.
- **Validator của Thai Anh:** US-29A/B/C task 236–251, routing origin → remaining stops, checks/deterministic time; code US-28 sơ bộ không chứng minh đủ in-trip contract.
- **Planner của Hoài:** US-28 schema/candidates/routes và presentation có thể tái dùng sau adapter; hiện thiếu visitId, completed state và origin/lodging trong requirement. Không tự ghi đè Planner/shared policy.
- US-35 location context; US-32 shared stateless design; US-37 validation/confirmation/apply. Không tự tạo model/mock Validator/provider để bỏ dependency.

## In Scope

- Phân phần đã/chưa hoàn thành theo policy được duyệt; giao diện Trợ lý và candidate AI cho phần còn lại.
- Giữ completed visits và kiểm tra khả năng đến điểm cần đến trước hạn với dữ liệu đủ; hiển thị đề xuất chưa áp dụng.

## Out of Scope

- Quyết định completion policy thay owner, tự sửa lịch sử, tự ghi/apply, background GPS hoặc lưu candidate lâu dài.
- Tạo Trip, booking, dự báo điều kiện đường/thời tiết hoặc tối ưu tuyến phức tạp.

## Task Breakdown

| ID | Tên task |
| --- | --- |
| 286 | [BE] phần đã/chưa hoàn thành |
| 287 | [FE] giao diện Trợ lý |
| 288 | [AI] đề xuất mới (2pt) |
| 289 | [BE] giữ nguyên lượt đã hoàn thành |
| 290 | [BE] đến địa điểm trước hạn |
| 291 | [FE] hiển thị đề xuất chưa áp dụng |
| 292 | [TEST] |

## Business Rules

- Server xác định phần đã/chưa hoàn thành từ nguồn authoritative sau khi OQ-A được duyệt; không tin `completedVisitIds` client hoặc mặc định `endTime < now` là hoàn thành.
- Completed visits được giữ nguyên, không cho AI tự đổi destination/day/time/duration/order hoặc xóa lịch sử. Kiểm diff phía server, không chỉ tin prompt/model.
- AI chỉ đề xuất cho phần còn lại từ điểm đến có thật/đủ điều kiện, vị trí cụ thể và thời gian còn lại; thiếu dữ liệu/yêu cầu mơ hồ cần làm rõ, không tự đoán giờ/route.
- “Đến trước hạn” cần đích và hạn rõ ràng từ dữ liệu/nhu cầu đã xác nhận; không phát minh deadline hoặc bỏ ràng buộc khi không tìm được phương án. Thiếu thời gian routing bắt buộc → INSUFFICIENT_DATA; không báo đáp ứng.
- Candidate tách biệt, client-memory-only; đổi nhu cầu/location/base itinerary làm preview hết hiệu lực. Kết quả generation không phải saved hoặc chứng nhận Validator.
- `Asia/Ho_Chi_Minh`; core nhận `now` từ server boundary. Không lấy clock từ AI/client và không gọi provider trong transaction.

## Roles / Authorization

Chỉ Traveler, `requireTraveler` trước body và trước đọc/gửi private Trip cho AI; Guest 401/Admin 403. Service giữ ownership/nghiệp vụ; route mỏng, response `private, no-store`.

## Ownership Rules

Trip query `id AND userId` session; foreign/missing cùng 404. Mọi visit/đích ràng buộc liên quan phải được đối chiếu với context hợp lệ; model không được thêm ID private của Trip khác. US-37 kiểm lại ownership/completion/revision trước ghi.

## UX / UI Contract

Giao diện đề xuất tại `/trips/[id]/in-trip`: tóm tắt context vị trí/nhu cầu, phần được bảo vệ, clarification, generating/error/empty/unavailable và diff “đề xuất chưa áp dụng”. Không gọi việc sinh candidate là cập nhật hành trình. Hiển thị nhóm kiểm tra/đích/hạn chưa đủ dữ liệu; xác nhận qua US-37. Hủy/reject trước apply giữ itinerary cũ. Keyboard/360px+, typedRoutes theo code hiện có; Figma chưa xác minh.

## Data Contract

**Đề xuất:** `{ baseRevision, location, request, timeConstraints }`, có thể kèm candidate local hiện tại nếu hỗ trợ tiếp tục sửa sau khi chốt contract. Location theo US-35; time constraints chứa đích/hạn user đã xác nhận, không giả định hạn mặc định. `now`, completion partition và quyền sửa do server xác định. Output tách clarification/no-proposal/proposal; proposal có candidate/diff, checks khi đủ input, các điểm còn thiếu và phần được bảo vệ. DTO/limits/discriminator chờ handoff, không tự đặt enum nghiệp vụ.

## API Contract

- Đề xuất `POST /api/trips/[id]/in-trip/preview`: auth/owned read → normalize context → authoritative completion partition → AI proposal ngoài transaction → verify IDs/diff/preserved visits → Validator/time feasibility → generic envelope `{ success, data }`.
- Không DB write, proposal store hay preview idempotency record. Candidate trả client; lần apply phải gửi lại candidate đầy đủ cho US-37, không dựa vào server đã giữ preview.
- Auth/cache/shared error như US-32. Phân biệt clarification/no-proposal/VIOLATION/INSUFFICIENT_DATA và technical provider error; mã/status cụ thể cần chốt. Apply endpoint thuộc US-37.

## Error / Recovery

Không tìm được phương án hoặc thiếu dữ liệu thì giải thích ràng buộc chưa đáp ứng, giữ chuyến cũ; không thay bằng itinerary giả. Provider lỗi giữ request/local context để user thử lại hoặc chỉnh. Stale response sau thay nhu cầu/location không được ghi đè preview mới. Cancel generation không chứng minh provider chưa tính phí. Nếu apply đã gửi, recovery theo US-37, không coi UI cancel là rollback.

## Write Semantics / Idempotency

Story này chỉ preview không ghi Trip/candidate/history; không dùng mutation SUCCESS cho generation. Việc apply dùng US-37 và [US-32 shared design](US-32-manual-itinerary-edit.md#shared-stateless-previewapply-design): Validator ngoài transaction, `executeIdempotentWrite`, ownership/baseRevision/CAS/write/revision+1 trong transaction và same-key replay. Không thêm cơ chế server draft riêng.

## External Services

AI qua provider/client đã được duyệt; không mặc định extraction client là replan client. Routes `DRIVE`/`TWO_WHEELER`, mandatory routing deadline tối đa 10s → thiếu dữ liệu nếu timeout/unavailable. GPS/manual theo US-35, không background tracking. Không live call hoặc thêm env/dependency ở task docs.

## Acceptance Criteria

- [ ] Task 286 tách completed/remaining bằng policy authoritative đã được duyệt, không suy từ clock/client nếu chưa chốt.
- [ ] Task 287/288 hiển thị context và candidate từ dữ liệu đủ điều kiện; AI không ghi/certify, thiếu thông tin có clarification.
- [ ] Task 289 server từ chối proposal làm đổi/xóa completed visits; itinerary chính thức chưa bị thay đổi.
- [ ] Task 290 kiểm đích/hạn được xác nhận với current location/now/routing; không đủ dữ liệu không được báo đáp ứng, không tự bỏ deadline.
- [ ] Task 291 hiển thị diff và nhãn chưa áp dụng; xác nhận chuyển US-37, hủy giữ itinerary cũ.
- [ ] Task 292 bao phủ auth/ownership/determinism/completion/time/AI errors; integration bị chặn khi dependency/OQ chưa chốt.

## Test Plan

- `.ts` partition/diff/feasibility/state logic và `*.vitest.test.ts`; completed source giả lập theo policy được duyệt, không tự định nghĩa policy trong test.
- Fixed `now`/Asia_Ho_Chi_Minh midnight, before/at/after deadline sau chốt semantics; missing location/routes/hours và timeout 10s.
- Fake AI/Validator/repository/routes: đổi/xóa/move completed visit bị chặn, forged IDs/clock/completion/affected scope, no-proposal/clarification/error không write.
- Auth trước body/provider, foreign/missing 404; stale response/cancel/retry. Không Neon/OpenAI/Google thật. Manual UI khi đủ dependencies; docs task chưa chạy runtime tests.

## Expected Modules / Files

- `apps/web/src/modules/in-trip/`: context/partition/replan contract/service/http/AI verification và tests.
- `apps/web/src/components/in-trip/`, `app/trips/[id]/in-trip/`: Trợ lý/location/context/diff, pure UI logic `.ts`.
- `app/api/trips/[id]/in-trip/preview/route.ts` đề xuất; reuse US-32/35 contracts sau handoff.
- Không sửa `/trips/new`, Favorite, Trip list/detail hoặc Planner của dev khác trong task docs.

## Migration Impact

Task docs không đổi DB; không tạo candidate/GPS history store. Completion/revision schema, nếu cần, chờ task 252 và quyết định OQ-A/E, review SQL trước apply riêng.

## Environment Impact

Không thêm env/dependency/client. Model/rate limit/cost budget replan cần duyệt, không tự chọn từ extraction configuration.

## Implementation Sequence

1. Chốt OQ-A/C/E và time constraint semantics, handoff Trip/Validator/Planner/US-35.
2. Authoritative partition/preservation → feasibility/AI preview → UI → US-37 integration → tests/evidence.

## Acceptance Evidence

2026-10-15: chỉ story DRAFT task 286–292; chưa có in-trip partition/replan/API/UI, completion policy hoặc live provider evidence. Không tuyên bố US-28 đã đáp ứng in-trip.

## Open Questions

- **OQ-A:** Completed suy theo giờ hay user đánh dấu, source authoritative nào và trạng thái chuyến có đủ cho từng visit không? Bình + Thai Anh chốt trước task 286/289.
- **OQ-B/C/E/G/H** ở [US-32](US-32-manual-itinerary-edit.md#open-questions): hidden historical destination, location outside Hà Giang/đủ cụ thể, revision, validation freshness và checks/replay.
- Task 290 nhận đích/hạn từ đâu; đến đúng thời điểm hạn có đạt không (`<` hay `<=`), có nhiều hạn/qua ngày không? Không tự đặt giờ kết thúc ngày hoặc buffer.
- AI intent/schema/model/client/context limits, clarification và no-proposal response nào được duyệt? Chốt với Hoài; không tự thêm client/env.
- Trip trạng thái nào mở Trợ lý, phần đang tham quan được xử lý ra sao và preview cũ bao lâu cần refresh? Không tự đặt lifecycle/TTL.

## Handoff Notes

US-36 tạo candidate; US-37 chịu trách nhiệm kiểm tra lại/xác nhận/apply. Cả hai tham chiếu US-32 thay vì persist draft. Thiếu dependency thì dừng phần tích hợp, không dựng model/Validator giả.
