# 04: Chặng tiếp cận và điểm tập kết

**What to build:** Hai điểm tập kết cố định (Hà Nội, TP Hà Giang); `planAccessLeg` dựng chặng bay/xe khách/tàu ước tính "Trước chuyến đi"/"Sau chuyến đi"; khi lái thẳng không khả thi, kết quả lập lịch gợi ý điểm tập kết; chi phí chặng tiếp cận vào nhóm đi lại.

**Blocked by:** 03

**Status:** DONE (2026-11-21) — code + automated tests; live OpenAI/routing/browser acceptance not run.

- [x] `TRIP_HUBS` dùng chung cho nút trong thẻ điểm xuất phát; model chỉ thấy id/tên.
- [x] `planAccessLeg` kiểm biên (≤ 4 chặng mỗi chiều, thời lượng, giá), phát `data-access-leg`, không qua Validator, không lưu.
- [x] `proposeItinerary` trả gợi ý dùng điểm tập kết khi có `OVERNIGHT_DRIVING_UNSUPPORTED` hoặc chặng đầu > 10 giờ.
- [x] `estimateCosts` cộng chặng tiếp cận vào nhóm đi lại.
- [x] Test thuần, test route, typecheck.
