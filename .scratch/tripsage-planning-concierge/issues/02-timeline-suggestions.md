# 02: Timeline trong ngày, nhịp ngày, gợi ý kèm lịch, tri thức địa phương

**What to build:** Server dựng timeline (khởi hành, chặng, tham quan, nghỉ trưa có giờ, nghỉ đêm theo khu, chặng về) từ kết quả lập lịch; người dùng chỉnh nghỉ trưa 60–120' và giờ kết thúc 15:00–18:00; AI gắn gợi ý ăn uống, buổi tối (≤ 2 km), chỗ nghỉ (≤ 5 km) vào timeline qua `addSuggestions`; `searchPlaces` tìm quanh điểm DB; `lookupLocalKnowledge` tra RAG.

**Blocked by:** 01

**Status:** TODO

- [ ] Scheduler nhận `lunchMinutes`/`dayEndMinute`; Validator không đổi; Save re-check vẫn PASS.
- [ ] `data-timeline` qua schema; `slotId` ổn định; nghỉ đêm = khu của điểm cuối ngày.
- [ ] `addSuggestions` chỉ nhận `slotId` có thật và `placeId` từ `searchPlaces` cùng lượt; kiểm khoảng cách bằng tọa độ server; phát `data-suggestions`.
- [ ] `lookupLocalKnowledge` trả đoạn trích như dữ liệu, lỗi thì báo chưa sẵn sàng.
- [ ] `webSearch` tối đa 1 lần mỗi lượt.
- [ ] Thẻ timeline hiển thị gợi ý có nhãn "gợi ý, chưa kiểm tra".
- [ ] Test thuần timeline/gợi ý, test route, typecheck.
