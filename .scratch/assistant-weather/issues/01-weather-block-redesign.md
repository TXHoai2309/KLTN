# 01: Làm lại giao diện khối thời tiết

Spec: `docs/stories/ASSISTANT-WEATHER.md` · ADR-36 · thuật ngữ theo `GLOSSARY.md` (Weather and sun times).

**What to build:** Khối "Thời tiết và giờ mặt trời" dễ quét mắt, một component dùng chung cho form `/trips/new`, bản đề xuất trong trợ lý và chuyến đã lưu. Mỗi ngày là một thẻ đầu thẻ có bình minh và hoàng hôn kèm icon. Mỗi điểm đến là một dòng gọn (icon thời tiết, nhiệt độ, xác suất mưa, gió). Tầm nhìn chỉ hiện khi thấp bất thường. Cảnh báo là chip màu ở đầu khối, bấm thì nhảy tới điểm bị ảnh hưởng. Thời tiết dọc chặng thu gọn mặc định. Chỉ đổi cách hiển thị, không đổi request, response hay ngưỡng.

**Blocked by:** None (can start immediately).

**Status:** implemented 2026-11-18 (agent); owner acceptance pending

- [x] Thay phần thân `TripWeatherView`; `TripWeatherPanel` và ba nơi gọi giữ nguyên props.
- [x] Mỗi ngày là một thẻ; giờ bình minh/hoàng hôn ở đầu thẻ; điểm đến là một dòng gọn.
- [x] Tầm nhìn chỉ hiện khi dưới ngưỡng cảnh báo sương mù.
- [x] Cảnh báo là chip ở đầu khối; bấm chip cuộn tới và làm nổi dòng điểm đến tương ứng (cảnh báo dọc chặng nhảy tới mục chặng, tự mở mục đó).
- [x] Thời tiết dọc chặng đóng mặc định, mỗi chặng liệt kê các mốc thời gian gọn.
- [x] Trạng thái "chưa có dự báo, sẽ có từ ngày X" và "không lấy được dự báo" vẫn hiển thị rõ, không dùng màu "tốt".
- [x] Vừa màn hình điện thoại 375 px, không cuộn ngang; đọc được ở giao diện sáng và tối.
- [x] Không dùng màu làm tín hiệu duy nhất (có chữ hoặc icon đi kèm).
- [x] Test component: thẻ ngày, chip và đích nhảy, dọc chặng thu gọn, các trạng thái không có dữ liệu, sáng/tối.
- [x] Typecheck, test, build và `git diff --check` PASS; chụp màn hình desktop và điện thoại cho owner xem.
