# 09: Trang chia sẻ dùng `DayTimeline` và dải cung đường

**What to build:** `companion-group-view.tsx` render các ngày bằng `DayTimeline full` cùng token mới; chỉ có Ngày 1…N tính từ điểm tập kết, không có tab ngày đi/về, không lộ thành phố nhà. Gợi ý quanh đây và Tối nay hiện nếu chuyến đã lưu kèm dữ liệu đó.

**Blocked by:** 06

**Status:** verified-offline

**Nguồn:** [PARITY US 12, BR-6](../../../docs/stories/ASSISTANT-TRIP-TIMELINE-PARITY.md), [design §4.4](../../../docs/design/traveler-ui-system.md)

- [x] Một lượt tham quan có cùng ảnh, thứ tự, giờ, thời lượng ở chat, trang chuyến và trang chia sẻ (PARITY AC-3).
- [x] Không có tab Ngày đi/Ngày về, không có thành phố nhà trong HTML trả về (PARITY AC-5).
- [x] Test companion hiện có PASS; `shareablePins` vẫn bỏ ACCESS.

## Bằng chứng

- Tạo `apps/web/src/components/trip-timeline/route-strip.tsx` (dải cung đường 8px chia tỉ lệ theo km/điểm dừng, màu `--tv-day-*`, bấm chuyển ngày) và style trong `day-timeline.css`.
- Mở rộng `companionGroupSchema` và `getCompanionGroup` chiếu thêm `image` (qua `isDestinationMediaUsable`), `area`, `chosenLodgings`, `nearbySuggestions` (không chiếu `ACCESS` hay thành phố nhà).
- Chuyển tab lịch trình của `CompanionGroupView` sang dùng `RouteStrip`, `TravelerDayTabs` (chỉ `Tất cả` + `Ngày 1…N`) và `DayTimeline variant="full"`.
- Lệnh kiểm tra:
  - `npx tsc --noEmit` (trong `apps/web`): PASS.
  - `npx vitest run src/components/trip-companions src/modules/trip-companions src/components/trip-timeline src/components/traveler-ui`: PASS (17 files passed, 208/208 tests; 11 postgres integration files skipped).
  - `git diff --check`: PASS.
- Chưa kiểm trên trình duyệt thật (cần phiên đăng nhập thành viên nhóm đồng hành).
