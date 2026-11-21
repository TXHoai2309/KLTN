# 10: Chọn nền bản đồ

Spec: `docs/stories/WEATHER-SUN-ADVISORIES.md` · ADR-36 · thuật ngữ theo `GLOSSARY.md` (Weather and sun times).

**What to build:** Guest chuyển được nền bản đồ giữa thường và vệ tinh hoặc địa hình. Lựa chọn được nhớ trên thiết bị.

**Blocked by:** None (can start immediately). Bị chặn bên ngoài nếu style vệ tinh của Stadia cần gói trả phí; khi đó ghi `BLOCKED_EXTERNAL` và không tự đổi sang nhà cung cấp khác.

**Status:** implemented 2026-11-18 (agent); live browser and owner acceptance pending

- [ ] Trước khi code, kiểm tra trong tài liệu Stadia xem style vệ tinh hoặc địa hình có trong gói hiện tại không, và ghi kết quả.
- [ ] Thêm style vào cấu hình map hiện có; đổi nền trên map đang mount, không tải lại trang.
- [ ] Lựa chọn lưu ở `localStorage`, mọi lần đọc và ghi bọc try/catch; không đọc được thì dùng nền thường.
- [ ] Ghi nguồn bản đồ đúng cho từng nền.
- [ ] Test component cho đổi nền và khôi phục lựa chọn.
- [ ] Typecheck, test, build và `git diff --check` PASS.
