# 09: Mở bằng Google Maps

Spec: `docs/stories/WEATHER-SUN-ADVISORIES.md` · ADR-36 · thuật ngữ theo `GLOSSARY.md` (Weather and sun times).

**What to build:** Trang điểm đến có nút "Mở bằng Google Maps" mở Google Maps tại toạ độ của điểm đến trong tab mới.

**Blocked by:** None (can start immediately).

**Status:** implemented 2026-11-18 (agent); live browser and owner acceptance pending

- [ ] URL tìm theo toạ độ điểm đến; không gửi thêm dữ liệu người dùng nào.
- [ ] Điểm đến không có toạ độ hợp lệ thì không hiện nút.
- [ ] Nút truy cập được bằng bàn phím và có nhãn rõ ràng.
- [ ] Test component cho có toạ độ và không có toạ độ.
- [ ] Typecheck, test, build và `git diff --check` PASS.
