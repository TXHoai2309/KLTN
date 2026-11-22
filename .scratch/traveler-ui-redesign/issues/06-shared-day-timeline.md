# 06: `DayTimeline` dùng chung (full/compact), áp trước cho trang chi tiết chuyến đi

**What to build:** Tách phần ngày của `TripDetailView` thành component `components/trip-timeline/day-timeline.tsx` nhận dữ liệu ngày đã chuẩn hoá (giờ mặt trời, khởi hành, chặng, lượt tham quan, nghỉ trưa, gợi ý), có biến thể `full` và `compact` theo design §3.3. Trang chi tiết dùng `full` trước; nội dung giữ như hiện tại nhưng theo token mới.

**Blocked by:** 01

**Status:** verified-offline

**Nguồn:** [PARITY US 6–10](../../../docs/stories/ASSISTANT-TRIP-TIMELINE-PARITY.md), [design §3.3](../../../docs/design/traveler-ui-system.md), [slim C16](../../../docs/stories/TRAVELER-UI-SLIM-REDESIGN.md)

- [x] Trang chi tiết render qua `DayTimeline full`; nội dung không đổi so với trước (so ảnh chụp).
- [x] Biến thể `compact`: ảnh 64px; dưới 480px ảnh nằm trên tên; có test component cho cả hai biến thể.
- [x] Phần riêng của chat (Xem nhanh, Gần đây có thể ghé, gợi ý ăn trưa) là prop/slot tuỳ chọn, chỉ hiện khi có dữ liệu.
- [x] Sửa lỗi chữ trắng nhãn "Ngày 1" trên trục và icon máy bay/xe khách rơi dòng (slim C16).

**Bằng chứng kiểm tra (2026-11-23):**
- `npx vitest run src/components/trip-timeline src/app/trips src/components/traveler-ui`: PASS (15 files, 67/67 tests PASS), gồm 3 test mới trong `day-timeline.vitest.test.ts` (full, compact, token audit).
- `npx tsc --noEmit`: PASS.
- `git diff --check`: PASS.
- Ảnh chụp so sánh trực tiếp trên trình duyệt chuyển sang lượt kiểm trình duyệt / Ticket 17.
