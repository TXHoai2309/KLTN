# 13: Danh sách chuyến đi gọn và tên chuyến tự đặt

**What to build:** Chip lọc (Sắp tới · Đang đi · Đã xong) kèm số đếm; tìm kiếm thu thành nút icon. Chuyến gần nhất được làm to (ảnh thật của điểm dừng đầu, tên theo cung đường, "còn N ngày"); các chuyến khác là dòng 72px (ảnh vuông 56px, tên, dòng xám, "⋯"). Bấm cả dòng để mở; "Đánh dấu hoàn thành" và "Xoá" vào menu. Tên chuyến mặc định lấy từ cung đường thay cho "Chuyến đi N ngày".

**Blocked by:** 02

**Status:** verified-offline

**Nguồn:** [slim C15, BR-7](../../../docs/stories/TRAVELER-UI-SLIM-REDESIGN.md), [design §4.3](../../../docs/design/traveler-ui-system.md)

- [x] Với 12 chuyến, không còn 36 nút: mỗi dòng có một vùng bấm và một nút "⋯".
- [x] Tên tự đặt chỉ dùng dữ liệu đã lưu (slim BR-7); người dùng vẫn đổi tên được.
- [x] Ảnh lấy từ điểm dừng đầu; không có ảnh thì dùng ảnh dự phòng hiện có.
- [x] Xoá vẫn có hộp xác nhận như hiện tại; test filter và trips hiện có PASS.

## Bằng chứng

- Mở rộng `TripSummary` (`trip-read-service.ts`) chiếu thêm `firstStopImage`, `firstArea`, `lastArea`, `homeCity`, `originLabel` qua 1 truy vấn batch nhẹ (không đổi `summarySelect.days`, không N+1).
- Thiết kế lại `MyTripsView` (`apps/web/src/app/trips/trips-view.tsx`, `trips.css`): chip lọc kèm số đếm, nút icon mở ô tìm kiếm, thẻ nổi bật 16:9 cho chuyến sắp tới gần nhất kèm ảnh điểm dừng đầu và `"còn N ngày"`, danh sách dòng gọn 72px (ảnh 56px, tiêu đề từ cung đường bằng `buildDataTripTitle`, nút `"⋯"` chứa Đánh dấu hoàn thành & Xoá với hộp xác nhận idempotent).
- Lệnh kiểm tra:
  - `npx vitest run src/app/trips src/modules/trip-read src/components/traveler-ui`: PASS (25 files passed, 117/117 tests; 3 postgres files skipped).
  - `npx tsc --noEmit` (trong `apps/web`): PASS.
  - `git diff --check`: PASS.
- Chưa kiểm ảnh chụp trình duyệt.
