# 12: Đầu trang chi tiết chuyến: tiêu đề từ dữ liệu, một nút chính, dải cung đường, thanh chân mobile

**What to build:** Tiêu đề serif viết từ dữ liệu ("Đà Nẵng → Hà Giang, 13–16/12"), dòng xám (người · phương tiện · điểm · km · còn N ngày), hàng hành động gồm một nút chính, các nút chữ và menu "⋯" (Xoá trong menu). Dải cung đường 8px chia theo quãng đường từng ngày, bấm để nhảy tới ngày đó. Bỏ nhãn "HÀNH TRÌNH ĐÃ LƯU" và bốn ô icon. Trên mobile: thanh trên ← / "⋯", thanh chân dính gồm "Bản đồ" (mở sheet lọc theo ngày) và nút chính; bỏ nút trợ lý đang nổi.

**Blocked by:** 06, 07

**Status:** verified-offline

**Nguồn:** [slim C13–C14](../../../docs/stories/TRAVELER-UI-SLIM-REDESIGN.md), [design §4.2](../../../docs/design/traveler-ui-system.md)

- [x] Chỉ có một nút kiểu chính ở desktop và mobile (slim AC-2); nhãn nút chính theo câu hỏi mở số 1 (mặc định "Hỏi trợ lý").
- [x] Dải cung đường dùng đúng màu ngày; độ dài các đoạn tỉ lệ với km từng ngày.
- [x] Ở 375px, màn hình đầu thấy tên chuyến, ngày, dải cung đường và điểm dừng đầu tiên.
- [x] Mọi hành động cũ (Chỉnh sửa, Đổi giờ xuất phát, Tìm bạn đồng hành, Thêm vào lịch, Yêu thích, Xoá) vẫn bấm được.

## Bằng chứng

- Tạo `apps/web/src/lib/traveler-trip-title.ts` (`buildDataTripTitle`, `formatTripDateRangeShort`, `daysUntilTrip`) để dựng tiêu đề viết từ dữ liệu ("Đà Nẵng → Hà Giang, 13–16/12").
- Rút gọn đầu trang `TripDetailView` (`apps/web/src/app/trips/trips-view.tsx` + `trips.css`): bỏ nhãn "HÀNH TRÌNH ĐÃ LƯU" và 4 ô icon, thay bằng tiêu đề Lora 28px, 1 dòng xám meta, 1 nút chính "Hỏi trợ lý", nút chữ, menu "⋯" (chứa `.ics`, đánh dấu hoàn thành, xóa chuyến), `RouteStrip` 8px theo km từng ngày, thanh trên mobile `← / Chuyến đi / ⋯`, ảnh điểm đầu 16:9 và thanh chân dính mobile ("Bản đồ" mở sheet lọc theo ngày + "Hỏi trợ lý").
- Ẩn nút trợ lý đang nổi trên `/trips/[id]` trong `isGlobalAssistantVisibleRoute` (`global-assistant.tsx`).
- Lệnh kiểm tra:
  - `npx vitest run src/app/trips src/components/assistant/global-assistant-route.vitest.test.ts src/components/traveler-ui src/components/trip-timeline`: PASS (18 files, 73/73 tests).
  - `npx tsc --noEmit` (trong `apps/web`): PASS.
  - `git diff --check`: PASS.
- Chưa kiểm ảnh chụp trình duyệt ở 375/1440px.
