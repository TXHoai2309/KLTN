# 01: Giờ mặt trời trên trang điểm đến

Spec: `docs/stories/WEATHER-SUN-ADVISORIES.md` · ADR-36 · thuật ngữ theo `GLOSSARY.md` (Weather and sun times).

**What to build:** Guest mở trang một điểm đến công khai và thấy bình minh, hoàng hôn, giờ vàng sáng và chiều của hôm nay theo giờ Asia/Ho_Chi_Minh. Có thể chọn ngày khác để xem giờ mặt trời của ngày đó. Ticket này tạo module thời tiết với phần giờ mặt trời (`suncalc`, ghim phiên bản) và endpoint công khai cho điểm đến. Đồng thời cập nhật `product-spec.md` và `trip-origin-spec.md` để gỡ phần loại trừ thời tiết theo ADR-36.

**Blocked by:** None (can start immediately).

**Status:** implemented 2026-11-18 (agent); live browser and owner acceptance pending

- [ ] Endpoint công khai trả giờ mặt trời cho một điểm đến công khai và một ngày; điểm đến ẩn hoặc không tồn tại trả not-found như endpoint điểm đến công khai hiện có.
- [ ] Route Handler mỏng; logic nằm trong module service.
- [ ] Giờ mặt trời của một toạ độ Hà Giang khớp giá trị tham chiếu trong khoảng ±2 phút (test ở seam service).
- [ ] Trang chi tiết điểm đến có khối giờ mặt trời và ô chọn ngày, dùng token `@KLTN/ui`, có trạng thái loading và lỗi.
- [ ] `suncalc` là dependency mới duy nhất, ghim phiên bản chính xác.
- [ ] product-spec và trip-origin-spec ghi phạm vi thời tiết mới, trỏ tới ADR-36.
- [ ] Typecheck, test liên quan, build và `git diff --check` đều PASS.
