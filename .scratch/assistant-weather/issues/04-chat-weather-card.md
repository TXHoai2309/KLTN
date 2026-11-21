# 04: Thẻ thời tiết trong khung chat

Spec: `docs/stories/ASSISTANT-WEATHER.md` · ADR-36 · thuật ngữ theo `GLOSSARY.md` (Weather question).

**What to build:** Khung chat hiển thị câu trả lời thời tiết: câu dẫn, thẻ dự báo và giờ mặt trời cho đúng điểm đến và ngày, nguồn Open-Meteo kèm giờ cập nhật. Thẻ lấy dự báo khi hiển thị, nên mở lại hội thoại cũ vẫn ra dự báo mới nhất. Câu hỏi làm rõ nhiều điểm đến hiện thành lựa chọn bấm được.

**Blocked by:** 03.

**Status:** implemented 2026-11-18 (agent); owner acceptance pending

- [x] Component thẻ nhận `{ destinationId, date, representative }`, tái sử dụng phần hiển thị dự báo và giờ mặt trời đã có ở trang điểm đến, gọi `GET /api/destinations/[id]/weather?date=`.
- [x] Điểm đại diện được ghi rõ ngay trên thẻ.
- [x] Trạng thái đang tải, "chưa có dự báo, sẽ có từ ngày X" và "không lấy được dự báo" hiển thị rõ; thẻ lỗi không làm hỏng tin nhắn.
- [x] Lựa chọn điểm đến (tối đa 3) bấm được và gửi tiếp câu hỏi với điểm đã chọn.
- [x] Hoạt động trong chat đầy đủ (người đăng nhập), chế độ Guest và bảng trợ lý của trang điểm đến; hiển thị đúng khi mở lại hội thoại đã lưu.
- [x] Vừa màn hình điện thoại, sáng và tối; có thể đọc bằng bàn phím và trình đọc màn hình.
- [x] Test component và test hiển thị tin nhắn cho trạng thái mới, gồm cả lượt cũ không có trạng thái này.
- [x] Typecheck, test, build và `git diff --check` PASS; chụp màn hình cho owner xem.
