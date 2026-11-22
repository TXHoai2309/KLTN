# 05: Cảnh báo mưa, sương mù, gió

Spec: `docs/stories/WEATHER-SUN-ADVISORIES.md` · ADR-36 · thuật ngữ theo `GLOSSARY.md` (Weather and sun times).

**What to build:** Lịch trình hiện cảnh báo thời tiết khi thời tiết lúc có mặt vượt ngưỡng. Mỗi cảnh báo ghi rõ ở đâu, khi nào, giá trị nào vượt ngưỡng nào. Trên cùng chuyến đi có số lượng cảnh báo. Cảnh báo đặt cạnh nhưng tách khỏi kết quả Validator, ghi rõ ngưỡng là để tham khảo.

**Blocked by:** 04 (Thời tiết lúc có mặt).

**Status:** implemented 2026-11-18 (agent); live browser and owner acceptance pending

- [ ] Ngưỡng là hằng số đặt tên trong module: mưa khi xác suất ≥ 70 % hoặc lượng mưa ≥ 5 mm/h; sương mù khi tầm nhìn < 1 km; gió khi gió giật ≥ 40 km/h.
- [ ] Mỗi ngưỡng có test ngay dưới và ngay trên.
- [ ] Một cảnh báo gồm loại (`RAIN`, `FOG`, `WIND`), vị trí (lượt tham quan kèm ngày), khoảng giờ, giá trị và ngưỡng.
- [ ] Dữ liệu `UNAVAILABLE` hoặc `NOT_YET_AVAILABLE` không sinh cảnh báo nào (test).
- [ ] Cùng một lịch trình cho cùng kết quả Validator dù có hay không có cảnh báo (test).
- [ ] Không chặn đề xuất, không chặn lưu chuyến đi.
- [ ] Test component cho danh sách cảnh báo và số lượng cảnh báo.
- [ ] Typecheck, test, build và `git diff --check` PASS.
