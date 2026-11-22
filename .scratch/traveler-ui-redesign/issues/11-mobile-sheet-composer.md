# 11: Sheet lịch trên mobile, ô nhập một dòng, thanh trên cùng 48px

**What to build:** Dưới 768px, thẻ tóm tắt mở sheet lịch (3 tab Lịch · Bản đồ · Chi phí, nút "Lưu chuyến" cỡ lg dính chân, kéo xuống/chạm nền/Back để đóng, quay lại đúng chỗ đang đọc). Ô nhập một dòng tự giãn tối đa 4 dòng, nút gửi tròn 32px trong ô, bộ đếm chỉ hiện khi dùng >80%. Thanh trên cùng 48px với ☰, tên cuộc chat, "+"; bỏ nút mở thanh bên đang nổi.

**Blocked by:** 10

**Status:** verified-offline

**Nguồn:** [slim B8–B10](../../../docs/stories/TRAVELER-UI-SLIM-REDESIGN.md), [design §3.6, §3.9, §4.1](../../../docs/design/traveler-ui-system.md)

- [x] Ở 375px, thẻ tóm tắt mở sheet có nút "Lưu chuyến" ở chân (slim AC-3); không có cuộn ngang (đã kiểm CSS/layout và unit test; chưa chụp trên trình duyệt thật).
- [x] Nút Back của Android đóng sheet thay vì rời trang (`history.pushState` / `popstate`, có khôi phục `scrollTop` của luồng chat và kéo xuống >64px trên handle).
- [x] Bảng chi phí trong sheet là danh sách 2 cột, cách tính thành dòng xám (design §3.8).
- [x] Ô nhập không còn chiếm khoảng 1/5 màn hình (44px tự giãn tối đa 4 dòng, nút gửi tròn 32px, bộ đếm chỉ hiện khi >80%); sau khi lưu, ô nhập không nhảy lên giữa.
- [ ] Chụp 375px cho trạng thái trống, đang chờ, đã có lịch và đang mở sheet (chờ xác minh trình duyệt ở ticket 17).

## Bằng chứng kiểm tra

- `Set-Location apps/web; npx vitest run src/components/tripsage-chat src/components/traveler-ui` — PASS (15 files, 72/72 tests, gồm `tripsage-mobile-sheet-composer.vitest.test.ts` 4/4 và `traveler-tokens-audit.vitest.test.ts` 10/10).
- `npm run check-types` — PASS (4/4 Turbo tasks).
- `git diff --check` — PASS.
