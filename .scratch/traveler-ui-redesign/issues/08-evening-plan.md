# 08: Khối "Tối nay" cho mỗi đêm của chuyến

**What to build:** Mỗi đêm từ Ngày 1 đến Ngày N−1 có khối "Tối nay": khu vực nghỉ đêm, chỗ nghỉ đã chọn hoặc gợi ý chỗ nghỉ, tối đa 3 nơi ăn/chơi trong 3 km (slot EVENING, bán kính đổi từ 5 xuống 3 km). Hiển thị trong `DayTimeline`, lưu cùng chuyến đi, tìm lại khi chỉnh lịch làm đổi điểm dừng cuối ngày. Trợ lý trả lời câu "tối nay đi đâu" từ dữ liệu này.

**Blocked by:** 04, 06

**Status:** verified-offline

**Nguồn:** [PARITY BR-7–BR-9, US 13–20](../../../docs/stories/ASSISTANT-TRIP-TIMELINE-PARITY.md), [design §3.3](../../../docs/design/traveler-ui-system.md)

- [x] Chuyến 5 ngày có đúng 4 khối Tối nay, mỗi khối ≤3 nơi trong 3 km, không có chỗ lưu trú (PARITY AC-6).
- [x] Places lỗi hoặc không có kết quả: khối vẫn hiện khu vực và chỗ nghỉ, kèm dòng "Chưa tìm được gợi ý buổi tối".
- [x] Chỉnh lịch đổi điểm cuối ngày thì Tối nay của ngày đó được tìm lại (PARITY AC-8); kiểm cả luồng trip-edit.
- [x] Hỏi "tối ngày 1 đi đâu" → trợ lý nêu khu vực và các nơi lấy từ Tối nay (PARITY AC-9).
- [x] Constraint Validator, giờ trong timeline và chi phí không đổi khi Tối nay thay đổi (PARITY AC-10).

## Bằng chứng

- Đổi `ACTIVITY_RADIUS_KM.EVENING` từ `5` xuống `3`, thêm `EVENING_PER_SLOT = 3`, giữ chỗ anchor cho toàn bộ đêm `1..N-1` trong `ACTIVITY_MAX_ANCHORS = 16` (`tripsage-activities.ts`).
- Tạo `apps/web/src/components/trip-timeline/evening-plan.ts` (`buildDayEveningPlan`) và nối vào `TripDetailView`, `CompanionGroupView`, `TripsageTimelineView` (mỗi đêm `1..N-1` luôn hiện khối "Tối nay" kèm fallback `"Chưa tìm được gợi ý buổi tối"`).
- Tạo `apps/web/src/modules/trip-edit/refresh-evening-suggestions.ts` và nối best-effort sau khi commit thành công trong `applyEdit` + route `api/trips/[id]/edits/apply/route.ts` để tự tìm lại gợi ý `EVENING` khi đổi điểm dừng cuối ngày mà không làm ảnh hưởng Validator hay giao dịch lưu.
- Bổ sung `suggestions` vào `buildTripsageChatBody` → `parseTripsageChatSuggestions` → `buildTripsageContext` (khối `"Tối nay"`) và hướng dẫn persona trả lời câu `"tối ngày X đi đâu"` từ dữ liệu đó.
- Lệnh kiểm tra:
  - `npx tsc --noEmit` (trong `apps/web`): PASS.
  - `npx vitest run src/modules/tripsage-chat/tripsage-activities.vitest.test.ts src/modules/tripsage-chat/tripsage-evening-plan.vitest.test.ts src/modules/trip-edit/apply-edit.vitest.test.ts src/app/trips src/components/trip-companions/companion-group-parity.vitest.test.ts src/components/tripsage-chat`: PASS (28 files, 139/139 tests).
  - `git diff --check`: PASS.
- Chưa kiểm trên trình duyệt thật.

## Cập nhật hậu triển khai (2026-11-23 — Lỗi D, commit `10d3194`, `c47ba1a`)

- Bổ sung `resolveOvernightAreaLabel` (`traveler-display-clean.ts`) suy tên thị trấn/xã/khu vực cụ thể từ điểm dừng cuối ngày (bỏ qua `PLACEHOLDER_AREAS` như `"khu vực hà giang"`), nối vào `evening-plan.ts` và `tripsage-timeline.ts`.
- Sửa `tripsage-activities.ts`: đổi `QUERIES.EVENING` thành `"quán ăn nhà hàng quán cà phê chợ đêm"` kèm fallback `"quán ăn"` (vẫn trong bán kính `3 km`, giữ `ACTIVITY_MAX_ANCHORS = 16`, ưu tiên anchor `EVENING` trước), sửa `isStop` để không loại nhầm địa điểm buổi tối trùng tên thị trấn (ví dụ `"Chợ đêm Phố cổ Đồng Văn"`), và thêm `nearbySummary` vào tool trace `proposeItinerary`.
- Kiểm tra trình duyệt thật trên hội thoại dev dựng từ `2c85423a` (`1440x900`): Ngày 1 hiển thị `"Tối nay nghỉ ở Yên Minh · gợi ý, chưa kiểm tra"`, Ngày 2 `"Tối nay nghỉ ở Mã Pí Lèng"`, Ngày 3 `"Tối nay · nghỉ ở Mèo Vạc"` — không còn rơi về `"Hà Giang"`.
- Lưu ý: môi trường dev cục bộ thiếu `GOOGLE_MAPS_API_KEY` trong `apps/web/.env` nên truy vấn Google Places `EVENING` mới chỉ được kiểm bằng unit test (`tripsage-evening-plan.vitest.test.ts` 6/6 PASS) và phân tích trace DB prod (chỉ đọc), chưa gọi trực tiếp Google Places trên máy cục bộ.

## Cập nhật hậu triển khai đợt 2 (2026-11-23 — Lỗi 2, commit `d854c35`, từ trace `6fe7696a`)

- Đọc trace `6fe7696a` cho thấy 2 nguyên nhân gốc khiến đêm Yên Minh trống: (1) anchor `EVENING` dùng tọa độ điểm dừng cuối ngoài thị trấn (`[Tam] Rừng thông Yên Minh`) thay vì tọa độ chỗ nghỉ / tâm thị trấn Yên Minh (`23.1175, 105.1425`); (2) khi kế hoạch 4 ngày có đủ `16` anchor, `callsUsed = input.anchors.length` khiến câu truy vấn fallback `"quán ăn"` không bao giờ chạy; đồng thời `"Dn xê dịch camping"` lọt qua `LODGING_NAME_PATTERN` vì thiếu từ khóa `camping`.
- Bổ sung `OVERNIGHT_TOWN_CENTERS` và `resolveEveningAnchorPoint` trong `tripsage-activities.ts` (và nối vào `refresh-evening-suggestions.ts`): ưu tiên anchor theo thứ tự chỗ nghỉ đã chọn → gợi ý chỗ nghỉ gần nhất → tâm thị trấn khu vực nghỉ → điểm dừng cuối. Đếm số lượt gọi Places thực tế từ `0` trong trần cứng `ACTIVITY_MAX_ANCHORS = 16` (chạy `EVENING` trước), lọc thêm `camping`, và xuất `eveningDetails` (`slotId`, `area`, `anchorSource`, `count`, `reason`) trong `nearbySummary` của `proposeItinerary`.
- Kiểm thử: `tripsage-evening-plan.vitest.test.ts` (8/8 PASS), `tripsage-activities.vitest.test.ts` (6/6 PASS), `apply-edit.vitest.test.ts` (20/20 PASS). Chưa gọi trực tiếp Google Places trên máy cục bộ vì thiếu `GOOGLE_MAPS_API_KEY`.
