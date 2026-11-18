# 05: Dòng nhắc cảnh báo trong câu trả lời lịch trình

Spec: `docs/stories/ASSISTANT-WEATHER.md` · ADR-36 · thuật ngữ theo `GLOSSARY.md` (Weather advisory, Caveat policy).

**What to build:** Khi lượt tạo hoặc sửa lịch trình trong trợ lý có cảnh báo thời tiết, câu trả lời có thêm một dòng nêu tối đa 2 cảnh báo nặng nhất. Dòng do code dựng từ kết quả cảnh báo. Không có cảnh báo, chưa có dự báo hoặc lượt chỉ đọc thì không thêm gì.

**Blocked by:** None (can start immediately).

**Status:** implemented 2026-11-18 (agent); owner acceptance pending

- [x] Kế hoạch phản hồi của lượt tạo/sửa đề xuất nhận tối đa 2 cảnh báo nặng nhất từ `getTripWeather` trên đề xuất hiện tại; thứ tự nặng nhất theo quy tắc cố định, ghi trong code.
- [x] Dòng nêu loại cảnh báo, ngày, điểm hoặc chặng, giờ và số liệu, kèm lời nhắc xem bảng bên dưới; model không viết lại số liệu.
- [x] Không có cảnh báo, dự báo chưa có hoặc nhà cung cấp lỗi: không thêm dòng nào; lỗi thời tiết không làm hỏng hoặc kéo dài lượt quá một thời hạn ngắn.
- [x] Lượt chỉ đọc (hỏi về lịch trình hiện tại) và lượt không đổi đề xuất không thêm dòng, theo Caveat policy.
- [x] Không thay đổi kết quả Validator, ngày lưu hoặc điều kiện lưu.
- [x] Test: 0, 1, 2, 3 cảnh báo (chỉ nêu 2), dự báo chưa có, lỗi nhà cung cấp, lượt chỉ đọc, lượt sửa; thứ tự nặng nhất.
- [x] Typecheck, test, build và `git diff --check` PASS.
