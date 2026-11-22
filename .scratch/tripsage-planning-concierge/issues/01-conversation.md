# 01: Hội thoại dẫn dắt theo cụm, nút trả lời nhanh, markdown, model terra

**What to build:** Bỏ hộp thoại "Thông tin chuyến đi"; AI hỏi cụm 1 (đi từ đâu, khi nào, mấy ngày, xe gì) có gợi ý, ghi bằng `recordTripInfo`, mở thẻ điểm xuất phát bằng `requestOrigin` (kèm nút TP Hà Giang / Hà Nội), hiện nút trả lời nhanh bằng `suggestReplies`, ra lịch đầu tiên trong ≤ 2 lượt; cụm 2 dùng mặc định hiện rõ. Chữ render markdown an toàn. Model terra reasoning medium, 12 bước, 280 s.

**Blocked by:** —

**Status:** DONE (2026-11-21) — code + automated tests; live OpenAI/browser acceptance not run.

- [x] `recordTripInfo` ghi giá trị qua schema chặt, cập nhật ngữ cảnh cùng lượt, phát `data-trip-info`; từ chối ngày quá khứ, số ngày ngoài 1–14; không có trường điểm xuất phát.
- [x] Mặc định cụm 2 do server áp và đánh dấu; thanh tóm tắt chỉ đọc hiện "mặc định".
- [x] `requestOrigin` phát `data-origin-request`; thẻ trong chat dùng picker hiện có, giờ đi/hạn về điền sẵn, hai nút điểm tập kết.
- [x] `suggestReplies` phát `data-quick-replies` (≤ 4, ≤ 40 ký tự); chip chỉ gửi đúng chữ.
- [x] Markdown GFM an toàn (không HTML, không ảnh, link chỉ chữ).
- [x] Provider options terra + medium; không trần token; giới hạn 12 bước / 280 s; route 300 s.
- [x] B.1 số ngày không theo selection; B.2 client không import module server; B.3 đổi thông tin ảnh hưởng lịch thì không gửi lịch cũ.
- [x] Test route với mô hình giả, test nguồn client, typecheck, `git diff --check`.
