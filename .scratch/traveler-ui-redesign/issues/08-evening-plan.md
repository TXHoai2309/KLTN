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
