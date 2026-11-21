# 04: Chặng tiếp cận và điểm tập kết

**What to build:** Hai điểm tập kết cố định (Hà Nội, TP Hà Giang); `planAccessLeg` dựng chặng bay/xe khách/tàu ước tính "Trước chuyến đi"/"Sau chuyến đi"; khi lái thẳng không khả thi, kết quả lập lịch gợi ý điểm tập kết; chi phí chặng tiếp cận vào nhóm đi lại.

**Blocked by:** 03

**Status:** TODO

- [ ] `TRIP_HUBS` dùng chung cho nút trong thẻ điểm xuất phát; model chỉ thấy id/tên.
- [ ] `planAccessLeg` kiểm biên (≤ 4 chặng mỗi chiều, thời lượng, giá), phát `data-access-leg`, không qua Validator, không lưu.
- [ ] `proposeItinerary` trả gợi ý dùng điểm tập kết khi có `OVERNIGHT_DRIVING_UNSUPPORTED` hoặc chặng đầu > 10 giờ.
- [ ] `estimateCosts` cộng chặng tiếp cận vào nhóm đi lại.
- [ ] Test thuần, test route, typecheck.
