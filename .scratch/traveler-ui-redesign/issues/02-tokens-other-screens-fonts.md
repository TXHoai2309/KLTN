# 02: Áp token cho trợ lý, danh sách chuyến đi, trang chia sẻ; chỉ còn 2 font

**What to build:** Dùng token và thành phần nút từ ticket 01 cho CSS của `/assistant` (`assistant.css` và các thẻ tripsage), danh sách `/trips` và trang chia sẻ (`companion.css`). Bỏ Inter trên ba màn hình, chỉ giữ Be Vietnam Pro và Lora. Bỏ in đậm cả câu trong tin nhắn trợ lý. Đây là lát chỉ về hình thức, không đổi bố cục.

**Blocked by:** 01

**Status:** verified-offline

**Nguồn:** [slim A3–A4, B12](../../../docs/stories/TRAVELER-UI-SLIM-REDESIGN.md), [design §2.2](../../../docs/design/traveler-ui-system.md)

- [x] Grep CSS ba màn hình: không còn `font-weight: 650|700`, `box-shadow` trên thẻ/nút/tab, hex viết cứng ngoài file token (slim AC-1).
- [x] Ô nhập chat vẫn có `--tv-shadow-float`; menu và popover giữ bóng nổi.
- [x] Tin nhắn trợ lý không còn câu in đậm toàn bộ.
- [x] Font tính được trên ba màn hình chỉ là Be Vietnam Pro hoặc Lora.
- [ ] Sáng và tối đều đạt tương phản AA cho chữ thường; chụp 1440/375px trước-sau cho từng màn hình.

**Bằng chứng kiểm tra (2026-11-23):**
- `npx vitest run src/components/traveler-ui src/components/tripsage-chat src/modules/trip-companions`: PASS (20 files, 183/183 tests PASS; 11 postgres integration files skipped). Gồm 10 test mới trong `traveler-tokens-audit.vitest.test.ts` quét cả 8 file CSS (`trips.css`, `traveler-ui.css`, `assistant.css`, `assistant-citations.css`, `assistant-weather-card.css`, `tripsage-result-cards.module.css`, `tripsage-memory-panel.module.css`, `companion.css`) và kiểm tra bỏ in đậm cả câu trong `TripsageMarkdown`.
- `npx tsc --noEmit`: PASS.
- `git diff --check`: PASS.
- Chụp ảnh 1440/375px sáng/tối trên trình duyệt để lại cho lượt kiểm trình duyệt / Ticket 17.
