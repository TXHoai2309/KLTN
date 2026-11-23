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

## Cập nhật hậu triển khai (2026-11-23 — Font/Sticky + Lỗi C, E, F, H + collapse `.tv-day-tabs`)

- `8e41b5f`: đưa biến `next/font` lên `<html>` (`layout.tsx`) để `:root --tv-font-ui` nhận `Be Vietnam Pro`, sửa `.tv-day-tabs--sticky` dùng `top: var(--header-height, 65px)` / `var(--header-height-mobile, 58px)`, thêm kiểm tra hồi quy vào `traveler-tokens-audit.vitest.test.ts`.
- `7fa287e` (Lỗi C): thêm `resolveDayLunchBreak` suy giờ nghỉ trưa từ lịch đã kiểm, loại bỏ mốc `12:00–13:00` cứng và buộc thứ tự theo giờ không chồng nhau ở chat panel, trang chuyến đi, trang chia sẻ. Đã kiểm trên trình duyệt thật Ngày 1–4 (`Nặm Đăm 10:14–12:14` → `Nghỉ trưa 12:14–13:14` → `Rừng thông Yên Minh 14:44–15:14`).
- `8563e3f` (Lỗi E): tăng tốc bắt kịp chữ chạy tối đa `280ms` khi stream xong (`STREAM_FINISH_BUDGET_MS`), xả ngay câu cũ khi người dùng gửi tin mới (`flushNow`), khóa chip/thẻ cho đến khi chữ chạy xong.
- `c192567` (Lỗi F): kẹp mô tả điểm dừng `DayTimeline` (`3 dòng` full / `2 dòng` compact) kèm nút `"Xem thêm"` mở modal xem nhanh đầy đủ mà không cắt dữ liệu gốc. Đã kiểm trên trình duyệt thật (`Cổng trời Quản Bạ` kẹp 3 dòng + modal 1202 ký tự đóng được bằng `Escape`).
- `6568121` (Lỗi H): thiết kế lại `TripsageCostCard` và `assistant.css` bỏ cuộn lồng nhau, huy hiệu `"Vượt ngân sách ..."` (`--tv-warn-ink`/`--tv-warn-bg`), chip tiết kiệm ngay dưới, `@container (max-width: 639px)` 2 cột, `<details>` `"Ghi chú cách tính"` đóng mặc định, nút `"Ghim vào chuyến đi"` `secondary sm`.
- `d6eccdd`: sửa lỗi phát hiện khi kiểm trình duyệt — `.tv-day-tabs` bị co chiều cao về `0` khi đứng trực tiếp trong grid `.tripsage-panel-body` (`min-height: 33px; min-width: 0; overflow-y: hidden;` + `grid-template-columns: minmax(0, 1fr);`), kèm test chống tái phát.
- Đã kiểm trên trình duyệt thật ở `1440x900` (sáng & tối) cho panel lịch trình, modal xem nhanh, kiểm tra thứ tự giờ, sticky header/subtabs; vòng chụp ảnh bổ sung tab `Chi phí` và `768px`/`375px` bị dừng giữa chừng do subagent trình duyệt hết quota (`429 RESOURCE_EXHAUSTED`).

## Cập nhật hậu triển khai đợt 2 (2026-11-23 — Lỗi 3, 4, 5, commits `1f945e8`, `37b576e`, `7397ede`)

- `1f945e8` (Lỗi 3): sửa độ ưu tiên CSS `.tripsage-cost-table tbody td.tripsage-cost-amount { text-align: right; }` để số tiền từng dòng thẳng cột với tổng; chuyển `.tripsage-cost-basis-mobile { display: none; }` lên trước `@container (max-width: 639px)` (bỏ bản ghi đè ở dòng cuối) và dùng lưới 2 cột `grid-template-columns: minmax(0, 1fr) auto` với dòng cách tính `12px --tv-ink-3` ở ô trái khi container `< 640px`.
- `37b576e` (Lỗi 4): chuẩn hóa so khớp `activeId` trong `TravelerDayTabs` (hỗ trợ cả khóa `0` và `-1`), thêm `--tv-tab-underline: var(--tv-ink)` cho tab `travel` (giữ chấm xám `--tv-ink-3`), nâng độ ưu tiên `.tv-day-tabs .tv-day-tab` trên `.assistant-page button { font: inherit }`, đồng bộ `effectiveDayKey` trong `TripsagePlanPanel`, và thêm test cho `Ngày đi` / `Ngày 1..N` / `Ngày về`.
- `7397ede` (Lỗi 5): bỏ khung viền `.tripsage-save` và lớp pill cũ 40px `.assistant-save-button`, bỏ dòng chữ thừa `"Lịch trình chưa được lưu."` ở trạng thái nghỉ, dùng đúng `.tv-btn--primary .tv-btn--md` (34px) trên desktop và `.tv-btn--lg` (44px) toàn chiều rộng trong thanh chân dính mobile `padding: 12px 16px` (`border-top: 1px solid var(--tv-sunken)`), giữ nguyên hợp đồng `SUCCESS/FAILED/UNKNOWN` và idempotency.
- Kiểm thử: 67/67 files (519/519 tests PASS), `npm run check-types` PASS (4/4), `npm run build --workspace web -- --webpack` PASS. Chưa đo lại `getComputedStyle` trên trình duyệt vì subagent trình duyệt `flash` đang bị giới hạn quota `429`.
