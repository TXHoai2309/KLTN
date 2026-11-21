# 04: Thời tiết lúc có mặt

Spec: `docs/stories/WEATHER-SUN-ADVISORIES.md` · ADR-36 · thuật ngữ theo `GLOSSARY.md` (Weather and sun times).

**What to build:** Mỗi lượt tham quan trong lịch trình hiện thời tiết lúc có mặt, lấy giờ xấu nhất trong khoảng từ lúc đến tới lúc rời đi. Ngày ngoài khoảng dự báo hiện "Chưa có dự báo, sẽ có từ ngày X", không có số đoán. Chuyến đi đã lưu lấy dự báo mới mỗi lần mở, không lưu bản chụp. Lịch trình sau khi sửa tay, sửa bằng AI hay đổi kế hoạch giữa chuyến đều hiện thời tiết theo lịch mới.

**Blocked by:** 02 (Dự báo tại điểm đến), 03 (Giờ mặt trời trong lịch trình).

**Status:** implemented 2026-11-18 (agent); live browser and owner acceptance pending

- [ ] Service trả thời tiết lúc có mặt cho từng lượt; giờ xấu nhất trong khoảng tham quan được chọn (test).
- [ ] Ngày ngoài khoảng dự báo trả `NOT_YET_AVAILABLE` với đúng ngày bắt đầu có dự báo (test).
- [ ] Nhà cung cấp lỗi thì mọi lượt hiện không lấy được, giờ mặt trời vẫn còn (test).
- [ ] Không có bảng hay cột mới để lưu thời tiết.
- [ ] Test component cho khối thời tiết của lượt tham quan và các trạng thái loading, không lấy được, chưa có dự báo.
- [ ] Typecheck, test, build và `git diff --check` PASS.
