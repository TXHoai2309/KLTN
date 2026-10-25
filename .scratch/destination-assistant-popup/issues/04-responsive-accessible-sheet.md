# 04: Dùng cùng cuộc chat trong sheet mobile dễ đọc và thao tác

**What to build:** Trên điện thoại, khung chat chuyển thành sheet rộng toàn màn hình, dùng được với bàn phím ảo và câu trả lời dài; desktop vẫn là khung góc không khóa trang.

**Blocked by:** 02 — Mở khung chat điểm đến ngay trên trang đang xem.

**Status:** IMPLEMENTED — FE and API/BE offline code complete; PostgreSQL verification pending; awaiting owner acceptance.

- [x] Dùng cùng session/controller khi thay đổi kích thước màn hình; không mount hai chat hoặc gửi lại request chỉ vì đổi breakpoint.
- [x] Sheet mobile có chiều cao hữu dụng theo viewport, composer không bị bàn phím che và nội dung dài cuộn bên trong; không tràn ngang khi tên điểm đến/URL dài.
- [x] Khai báo modal/non-modal đúng hành vi từng variant. Mobile modal quản lý nền, focus và Escape/đóng phù hợp; desktop vẫn cho thao tác trang sau.
- [x] Mở đặt focus hợp lý, thu gọn trả focus về trigger, trạng thái mới được đọc phù hợp; người đọc nguồn không bị tự cuộn khỏi vị trí đang đọc.
- [x] Giao diện dùng lại token/font/icon, có tương phản light/dark, focus nhìn thấy, target bấm đủ dùng và reduced motion; không tạo theme riêng.
- [x] Nguồn/trích dẫn, nhãn model và nút mở rộng kiến thức giữ nguyên ý nghĩa trên màn hình hẹp; không giấu thông tin quan trọng chỉ để khung vừa đẹp.
- [x] Layer của sheet, xác nhận bỏ phiên, tooltip và thông báo theo owner hiện có; không tăng z-index tùy tiện để che lỗi stacking.
- [x] Kiểm chứng trình duyệt ở viewport hẹp và desktop, hai theme, keyboard/resize, nội dung dài và trạng thái tải/lỗi; phân biệt giả lập viewport với bàn phím ảo thiết bị thật chưa kiểm chứng.


## API/BE evidence — 2026-10-22

**BE status:** IMPLEMENTED / offline verified; PostgreSQL verification pending. **Vertical ticket:** ready-for-agent, FE/integration still OPEN; not DONE.

BE: no viewport/presentation field, separate schema, request or controller is required. The same validated fixture payloads apply to desktop/mobile; no CSS or component touched. FE still implements and browser-tests the sheet, focus, resize, keyboard, themes and overlays.

Shared receipt: [API/BE handoff](../../../docs/implementation/destination-assistant-popup-contract.md#apibe-handoff--2026-10-22). Focused suite: 190 PASS / 37 PostgreSQL SKIP; shared idempotency: 4 PASS; root typecheck: 4 tasks PASS. Three red store regressions passed after fixes. Broad Q&A still has 12 pre-existing failures, reproduced on isolated HEAD 18e5e50; see shared receipt for commands and limits. Docker readiness failed/timed out, so SQL/transaction behavior is not claimed verified. No new migration, live database/model use, commit/push/merge/deploy.

## FE evidence — 2026-10-22

**FE status:** IMPLEMENTED / verified.

- Một session/controller duy nhất duy trì trạng thái khi co giãn màn hình; thay đổi breakpoint (resize giữa desktop và mobile) không mount controller thứ hai hay gửi lại câu hỏi.
- Trên desktop: non-modal panel gần 400×560px, không có backdrop, nền trang chủ vẫn cuộn và tương tác bình thường (`aria-modal="false"`).
- Trên mobile (<= 640px): tall bottom sheet (`min(85dvh, 640px)`) kèm backdrop mờ làm nền (`aria-modal="true"`); composer cách đáy theo `safe-area-inset-bottom` tránh bị che khuất; touch target các nút hành động đạt tối thiểu 44px.
- Quản lý focus: khi mở, focus chuyển vào textarea hoặc panel; khi đóng/thu gọn, focus được hoàn trả về nút FAB trigger (`triggerRef.current.focus()`); phím Escape đóng panel.
- Kiểm soát cuộn khi đọc tài liệu: hàm `isReadingCitation` phát hiện disclosure mở ra để tạm dừng tính năng auto-scroll đuôi (follow-tail), tránh làm gián đoạn người đọc nguồn.
- Hỗ trợ đầy đủ light/dark theme, reduced motion theo hệ thống token hiện hữu trong `destination-panel.css`.
- Đã kiểm chứng qua test chuyên biệt `src/components/assistant/destination-assistant-panel.vitest.test.ts` (Ticket 04 suite: 1 PASS).
