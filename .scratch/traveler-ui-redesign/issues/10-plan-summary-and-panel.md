# 10: Thẻ tóm tắt bản lịch trong chat và panel lịch trên desktop / ngăn kéo trên tablet

**What to build:** Trong tin nhắn trợ lý chỉ còn thẻ tóm tắt (Bản lịch vN · số ngày · số điểm · tổng chi phí, vượt ngân sách nếu có · kết quả kiểm tra · "Xem lịch trình"). Từ 1200px trở lên, màn hình chia đôi: thanh bên 240px, chat 440–480px, panel lịch dính (tiêu đề viết từ dữ liệu, nút chính "Lưu chuyến", tab ngày, `DayTimeline full` cạnh bản đồ, tab phụ Lịch trình · Chi phí · Kiểm tra). Từ 768 đến 1199px là ngăn kéo 560px bên phải. Panel đọc theo id bản lịch hiện hành. Chip trả lời nhanh chỉ hiện sau khi chữ đã chạy xong.

**Blocked by:** 02, 05, 06

**Status:** verified-offline

**Nguồn:** [slim B6, B7, B12](../../../docs/stories/TRAVELER-UI-SLIM-REDESIGN.md), [design §3.4, §4.1](../../../docs/design/traveler-ui-system.md)

- [x] Ở 1440px, khi đã có lịch, thấy tiêu đề, tab ngày, timeline và bản đồ mà không cần cuộn chat (slim AC-3).
- [x] Thẻ bản cũ mờ, ghi "Đã có bản mới"; panel không vẽ lại khi có tin nhắn mới không đổi bản lịch (slim BR-3).
- [x] "Lưu chuyến" là nút chính duy nhất; sau khi lưu đổi thành "Mở chuyến đi"; vẫn theo hợp đồng SUCCESS/FAILED/UNKNOWN.
- [x] Panel hẹp hơn 760px thì bản đồ chuyển thành tab.
- [x] Chip trả lời nhanh không xuất hiện trước khi đoạn chữ của lượt đó xong.
- [x] Test compact-ui, restoration-loop và stream-redaction hiện có được cập nhật và PASS.

## Bằng chứng

- Tạo `apps/web/src/components/tripsage-chat/tripsage-plan-summary-card.tsx` (thẻ tóm tắt bản lịch hiện hành / mờ 0.55 kèm nhãn `"Đã có bản mới"` cho bản cũ).
- Tạo `apps/web/src/components/tripsage-chat/tripsage-plan-panel.tsx` bọc `React.memo` theo `proposalId`: tiêu đề từ dữ liệu, nút chính duy nhất `"Lưu chuyến"` → `"Mở chuyến đi"`, tab phụ `Lịch trình · Chi phí · Kiểm tra` (và `Bản đồ` tự động hiện qua `@container (max-width: 759px)`), `TravelerDayTabs` kèm Ngày đi/Ngày về, `DayTimeline full` cạnh `ItineraryMap`.
- Nối vào `TripsageChatClient` (`tripsage-chat-client.tsx`) + `TripsageStreamedText` (`onDone` callback để chip trả lời nhanh chỉ hiện sau khi chữ chạy xong) + bố cục chia đôi `>= 1200px` / ngăn kéo `560px` ở `768–1199px` trong `assistant.css`.
- Lệnh kiểm tra:
  - `npx vitest run src/components/tripsage-chat src/components/traveler-ui src/modules/trip-edit/trip-assistant-stream.vitest.test.ts`: PASS (15 files, 76/76 tests).
  - `npx tsc --noEmit` (trong `apps/web`): PASS.
  - `git diff --check`: PASS.
- Chưa kiểm ảnh chụp trình duyệt ở 1440px / 768px.
