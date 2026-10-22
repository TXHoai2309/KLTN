# 05: Mở trang Assistant đầy đủ với đúng chat và bản nháp

**What to build:** Người dùng chủ động chọn mở toàn màn hình để đọc/soạn thoải mái hơn; trang Assistant nhận đúng cuộc chat, bản nháp chưa gửi và chế độ kiến thức từ panel mà không gửi câu hỏi lần nữa.

**Blocked by:** 03 — Thu gọn và phục hồi lượt hỏi mà không mất phiên.

**Status:** IMPLEMENTED — FE and API/BE offline code complete; PostgreSQL verification pending; awaiting owner acceptance.

- [x] Với chat đã xác nhận, mở đúng conversation trong Assistant và khôi phục lịch sử qua API được phép; không tạo bản sao hoặc tự đổi Destination context.
- [x] Chưa có conversation thì mở Assistant theo đúng Destination; draft và mode đi cùng nhưng không tự gửi hay tạo conversation chỉ để điều hướng.
- [x] Chuyển bản nháp bằng cơ chế cục bộ trong bộ nhớ, dùng một lần và ràng buộc với đúng principal/context/target; không đưa câu hỏi vào URL, log hoặc browser storage bền vững.
- [x] Áp dụng transfer sau khi identity/context/history đã xác nhận; không ghi đè nội dung mới người dùng vừa gõ hoặc áp transfer cũ cho tài khoản/chat khác.
- [x] Giữ lựa chọn mode người dùng đã chốt; xử lý kết quả preference ghi chưa xác nhận theo hợp đồng hiện có trước khi chuyển, không âm thầm mất lựa chọn.
- [x] Chặn full-page handoff khi ask còn sending/UNKNOWN; không dựng lời hứa khôi phục pending từ conversationId hoặc tự cấp key mới ở trang đích.
- [x] Refresh làm mất transfer chưa tiêu thụ theo phạm vi đã duyệt; trang Assistant vẫn hoạt động bình thường khi được mở trực tiếp không có transfer.
- [x] API/BE kiểm chứng get/history trả đúng owner/context/mode và không lộ chat khác; không tạo endpoint chuyển chat nếu API hiện có đủ.
- [x] Kiểm thử panel→full page cho có/không conversation, draft rỗng/có chữ, mode bật/tắt, pending blocking, transfer dùng một lần và không phát sinh ask trùng.


## API/BE evidence — 2026-10-22

**BE status:** IMPLEMENTED / offline verified; PostgreSQL verification pending. **Vertical ticket:** ready-for-agent, FE/integration still OPEN; not DONE.

BE: confirmed GET metadata is beside data/history and contains owned context/head/preference. Fixed turn cursor continuation and propagation of failed mode writes. Added get/turns/preference role/owner/context/expiry/cursor tests in the gated PostgreSQL suite. FE still owns one-use draft/mode transfer, context comparison, pending blocking and no duplicate ask.

Shared receipt: [API/BE handoff](../../../docs/implementation/destination-assistant-popup-contract.md#apibe-handoff--2026-10-22). Focused suite: 190 PASS / 37 PostgreSQL SKIP; shared idempotency: 4 PASS; root typecheck: 4 tasks PASS. Three red store regressions passed after fixes. Broad Q&A still has 12 pre-existing failures, reproduced on isolated HEAD 18e5e50; see shared receipt for commands and limits. Docker readiness failed/timed out, so SQL/transaction behavior is not claimed verified. No new migration, live database/model use, commit/push/merge/deploy.

## FE evidence — 2026-10-22

**FE status:** IMPLEMENTED / verified.

- Cơ chế handoff một lần trong bộ nhớ qua module `assistant-handoff.ts`: lưu bản nháp, chế độ kiến thức, ràng buộc với `principal`, `context` (Destination ID) và `conversationId`.
- Câu hỏi chưa gửi không bao giờ được đưa vào URL search parameters, browser storage (localStorage/sessionStorage), hay log/analytics.
- Chặn chuyển toàn màn hình (full-page handoff) khi lượt hỏi đang sending hoặc UNKNOWN; nút Mở toàn màn hình bị disabled kèm tooltip giải thích lý do.
- Sau khi điều hướng:
  - Nếu đã có conversation: chuyển sang `/assistant?conversationId=...` và khôi phục qua API get conversation; sau khi nạp xong, áp dụng draft và sync preference mode nếu có.
  - Nếu chưa có conversation: chuyển sang `/assistant?destinationId=...`; áp dụng draft và mode vào composer mà không tự động gửi câu hỏi.
- Áp dụng một lần duy nhất (`consumeAssistantHandoff` xóa ngay sau khi đọc); nếu người dùng đã gõ chữ mới ở trang đích, không ghi đè chữ người dùng.
- Tải lại trang (refresh) hủy transfer chưa tiêu thụ theo thiết kế đã phê duyệt; các URL truy cập trực tiếp vào Assistant không bị ảnh hưởng.
- Đã kiểm chứng qua test chuyên biệt `src/components/assistant/assistant-handoff.vitest.test.ts` (4 PASS) và `src/components/assistant/destination-assistant-panel.vitest.test.ts` (Ticket 05 suite: 3 PASS).
