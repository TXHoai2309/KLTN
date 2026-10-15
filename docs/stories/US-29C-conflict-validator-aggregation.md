# US-29C — Xung đột thời gian và kết quả Validator

## Status

IMPLEMENTED — pure Validator and reusable result component; proposal-screen integration is NOT PROVEN.

## Goal / User Story

Traveler xem kết quả bốn nhóm kiểm tra cho một phương án hành trình, biết lượt/chặng nào vi phạm hoặc thiếu dữ liệu trước khi xác nhận.

## Source References

- `docs/product/product-spec.md`: Trip requirements, deterministic Constraint Validator.
- `docs/flow/user-flow.md`: structural validation trước bốn nhóm kiểm tra.
- `docs/stories/US-29A-opening-hours-minimum-duration-validator.md` và `US-29B-stadia-routing-travel-time.md`.
- Task 3 của người dùng quy định interval `[start,end)`, thứ tự tổng hợp và chi tiết kết quả.

## Dependencies

US-29A/B đã được khôi phục từ `origin/ThaiAnh` và bộ 31 test liên quan đã pass. Repo chưa có itinerary proposal, structural visit contract hay màn hình phương án.

## In Scope

- Một contract visit có day/order, destination, start và planned duration để loại input sai cấu trúc trước Validator.
- Một hàm aggregate thuần dùng US-29A/B, check conflict, trả đúng bốn group và `canConfirm`.
- Component kết quả dùng lại được, sử dụng design tokens hiện có; chưa gắn vào màn hình yêu cầu chuyến đi vì màn hình đó chưa chứa phương án.

## Out of Scope

Planner, AI quyết định kết quả, Map, Trip persistence, nhóm Validator thứ năm, redesign trip flow.

## Business Rules

- Hai interval `[start,end)` overlap khi `A.start < B.end && B.start < A.end`; chạm ranh giới không conflict. Travel-time vẫn được tính riêng.
- Trong từng group: `VIOLATION` ưu tiên, rồi `INSUFFICIENT_DATA`, còn lại `SATISFIED`. Group rỗng là `SATISFIED`.
- `canConfirm` chỉ true nếu cả bốn group `SATISFIED`. US-29A/B per-check `PASS` ánh xạ sang group `SATISFIED`.
- Sort theo dayIndex/order/visitId. Caller truyền một `timeReference`; không đọc đồng hồ bên trong Validator.
- Giới hạn kỹ thuật 50 lượt mỗi request để chặn quá nhiều yêu cầu route song song; không phải giới hạn số Destination của sản phẩm.
- Kết quả chỉ chứa reason code/message và visit/leg bị ảnh hưởng; không lộ lỗi thô của provider.

## UX / UI Contract

Hiển thị đúng bốn tiêu đề: Giờ hoạt động, Thời lượng tham quan tối thiểu, Thời gian di chuyển, Xung đột thời gian. Hiển thị trạng thái và chi tiết lỗi/thiếu dữ liệu. Nút xác nhận bị disable khi `canConfirm=false`. Component chưa có proposal screen để mount; end-to-end UI sẽ được ghi NOT PROVEN.

## Data / API Contract

Pure function nhận validated visits, accepted business data, route snapshots và `timeReference`; không thêm API trong US-29C. Schema input là chỗ tái sử dụng cho US-30.

## Acceptance Criteria

- [x] Overlap vi phạm; touching boundary không conflict.
- [x] Đúng precedence của group, group rỗng SATISFIED và overall gate.
- [x] Kết quả xác định và chứa visit/leg bị ảnh hưởng.
- [x] Component bốn nhóm và disabled state được kiểm thử; mount trên proposal screen chưa có là NOT PROVEN.

## Test Plan

Vitest 11 trường hợp của task, dùng fake route snapshot; chạy thêm US-29A/B, full tests, typecheck, build, `git diff --check`.

## Implementation Sequence

1. Contract cấu trúc dùng chung với US-30.
2. TDD pure conflict/aggregate.
3. Component kết quả dùng lại được và test trạng thái render.
4. Ghi bằng chứng và giới hạn màn hình tích hợp.

## Acceptance Evidence

US-29A/B/C focused Vitest: 49/49 PASS (18 + 13 + 15 + 3). Cùng input/data/route/timeReference cho deep-equal result. `TripValidationPanel` dùng `@KLTN/ui` và semantic heading/button; render test kiểm tra bốn group, disabled và affected visit. Chưa có proposal screen nên chưa thể kiểm tra browser/keyboard/viewport thực của flow.
