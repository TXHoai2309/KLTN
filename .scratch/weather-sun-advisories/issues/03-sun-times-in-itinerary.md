# 03: Giờ mặt trời trong lịch trình

Spec: `docs/stories/WEATHER-SUN-ADVISORIES.md` · ADR-36 · thuật ngữ theo `GLOSSARY.md` (Weather and sun times).

**What to build:** Mỗi ngày của lịch trình có giờ bình minh và hoàng hôn, tính tại điểm đến đầu tiên của ngày đó. Áp dụng cho đề xuất trong form, thẻ đề xuất của trợ lý và chuyến đi đã lưu. Ticket này dựng service thời tiết của chuyến đi (seam chính), nhận lịch trình theo contract đề xuất và journey plan hiện có, cùng hai endpoint: một cho chủ chuyến đi đã lưu, một cho Traveler gửi đề xuất.

**Blocked by:** 01 (Giờ mặt trời trên trang điểm đến).

**Status:** implemented 2026-11-18 (agent); live browser and owner acceptance pending

- [ ] Endpoint chuyến đi đã lưu kiểm tra quyền sở hữu ở server như endpoint đọc chuyến đi; người khác và Admin nhận lỗi như endpoint hiện có.
- [ ] Endpoint đề xuất yêu cầu Traveler đã đăng nhập, không ghi gì vào database.
- [ ] Ngày của mỗi lượt tham quan suy ra từ ngày bắt đầu chuyến và số thứ tự ngày theo quy ước hiện có.
- [ ] Test service: lịch trình nhiều ngày ra đúng giờ mặt trời theo điểm đầu mỗi ngày.
- [ ] Giờ mặt trời hiện ở đầu mỗi ngày trên cả ba nơi: form, thẻ trợ lý, chuyến đi đã lưu.
- [ ] Kết quả Validator không đổi.
- [ ] Typecheck, test, build và `git diff --check` PASS.
