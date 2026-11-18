# 07: Cảnh báo sau hoàng hôn

Spec: `docs/stories/WEATHER-SUN-ADVISORIES.md` · ADR-36 · thuật ngữ theo `GLOSSARY.md` (Weather and sun times).

**What to build:** Khi một lượt tham quan điểm ngoài trời kết thúc sau giờ hoàng hôn của ngày đó, lịch trình hiện cảnh báo sau hoàng hôn trong cùng danh sách cảnh báo. Cảnh báo này vẫn hiện khi không lấy được dự báo, vì giờ mặt trời luôn tính được.

**Blocked by:** 05 (Cảnh báo mưa, sương mù, gió), 06 (Điểm ngoài trời).

**Status:** implemented 2026-11-18 (agent); live browser and owner acceptance pending

- [ ] Loại cảnh báo `AFTER_SUNSET` với vị trí, giờ kết thúc lượt và giờ hoàng hôn.
- [ ] Test: điểm ngoài trời kết thúc sau hoàng hôn có cảnh báo; kết thúc trước hoàng hôn không có; điểm không ngoài trời không bao giờ có.
- [ ] Test: nhà cung cấp lỗi nhưng cảnh báo sau hoàng hôn vẫn được tính.
- [ ] Kết quả Validator không đổi.
- [ ] Typecheck, test, build và `git diff --check` PASS.
