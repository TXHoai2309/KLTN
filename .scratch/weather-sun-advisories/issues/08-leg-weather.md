# 08: Thời tiết dọc chặng

Spec: `docs/stories/WEATHER-SUN-ADVISORIES.md` · ADR-36 · thuật ngữ theo `GLOSSARY.md` (Weather and sun times).

**What to build:** Mỗi chặng di chuyển có route đã xác minh, có geometry và có giờ bắt đầu và kết thúc, hiện thời tiết dọc chặng theo thời điểm dự kiến đi qua, gắn nhãn là ước lượng (đi đều tốc độ). Chặng vượt ngưỡng có cảnh báo trên chặng. Chặng thiếu dữ liệu hiện "không đủ dữ liệu", không bao giờ coi là trời quang. Bao gồm cả chặng đi và về từ nơi xuất phát.

**Blocked by:** 05 (Cảnh báo mưa, sương mù, gió).

**Status:** implemented 2026-11-18 (agent); live browser and owner acceptance pending

- [ ] Lấy mẫu điểm dọc geometry khoảng mỗi 20 km, tối đa 8 điểm mỗi chặng; thời điểm qua điểm nội suy tuyến tính theo quãng đường; nhãn `LINEAR_APPROXIMATION`.
- [ ] Chặng không `VERIFIED`, thiếu geometry hoặc thiếu giờ trả `INSUFFICIENT_DATA`; không đoán ETA bằng đường chim bay.
- [ ] Cảnh báo chặng dùng cùng ngưỡng và cấu trúc như ticket 05, với vị trí là chặng.
- [ ] Test service dùng fixture journey planning có geometry: điểm mẫu, thời điểm nội suy, chặng thiếu dữ liệu.
- [ ] Test component cho khối thời tiết chặng và nhãn ước lượng.
- [ ] Typecheck, test, build và `git diff --check` PASS.
