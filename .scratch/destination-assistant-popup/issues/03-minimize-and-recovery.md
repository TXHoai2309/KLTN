# 03: Thu gọn và phục hồi lượt hỏi mà không mất phiên

**What to build:** Người dùng thu gọn chat để đọc tiếp trang, mở lại vẫn có bản nháp, tin nhắn và lượt AI đang xử lý. Nếu kết quả chưa xác nhận, thao tác retry hoặc bỏ phiên thể hiện đúng điều đã xảy ra.

**Blocked by:** 02 — Mở khung chat điểm đến ngay trên trang đang xem.

**Status:** IMPLEMENTED — FE and API/BE offline code complete; PostgreSQL verification pending; awaiting owner acceptance.

- [x] Thu gọn/đóng chỉ ẩn view, không dispose controller, xóa chat, đổi key hoặc làm mất draft/mode/pending/UNKNOWN.
- [x] Request có thể hoàn tất khi khung ẩn; mở lại hiển thị kết quả đúng mà không tự mở khung hoặc giành focus của trang khi phản hồi đến.
- [x] Retry UNKNOWN/malformed gửi cùng body/key/mode ban đầu; không dùng lựa chọn mode mới hay tự tạo lượt hỏi thứ hai.
- [x] Chat mới hoặc điều hướng trong ứng dụng làm mất request chưa xác nhận phải chờ giải quyết hoặc dùng hộp xác nhận bỏ phiên hiện có. Hủy xác nhận giữ nguyên session, draft và khả năng retry.
- [x] Đồng ý bỏ phiên chỉ bỏ khả năng phục hồi cục bộ; không thông báo đã hủy AI, xóa conversation hoặc bảo đảm không phát sinh kết quả server.
- [x] Rời trang/refresh rồi quay lại tạo panel chat mới theo quyết định đã duyệt; lịch sử đã xác nhận vẫn đọc qua Assistant đầy đủ, không thêm lưu pending bền vững vào browser/database.
- [x] API/BE kiểm chứng idempotency/replay, lỗi đã biết và UNKNOWN; FE giữ đúng chủ sở hữu trạng thái và vô hiệu hóa callback muộn của phiên đã bỏ.
- [x] Kiểm thử click/gõ/gửi/thu gọn/mở lại, phản hồi muộn, retry đúng payload, cancel/confirm abandonment và điều hướng; không chỉ kiểm thử helper rời UI thực.


## API/BE evidence — 2026-10-22

**BE status:** IMPLEMENTED / offline verified; PostgreSQL verification pending. **Vertical ticket:** ready-for-agent, FE/integration still OPEN; not DONE.

BE: added a service regression showing browser abort during persistence can still complete a Destination turn. Existing service/HTTP tests cover UNKNOWN/error/replay mapping; immutable key/body/context/mode and late commit reconciliation have PostgreSQL cases, currently gated. No cancel endpoint. FE still owns mounted hidden state, immutable retry snapshot, abandonment and late-callback invalidation.

Shared receipt: [API/BE handoff](../../../docs/implementation/destination-assistant-popup-contract.md#apibe-handoff--2026-10-22). Focused suite: 190 PASS / 37 PostgreSQL SKIP; shared idempotency: 4 PASS; root typecheck: 4 tasks PASS. Three red store regressions passed after fixes. Broad Q&A still has 12 pre-existing failures, reproduced on isolated HEAD 18e5e50; see shared receipt for commands and limits. Docker readiness failed/timed out, so SQL/transaction behavior is not claimed verified. No new migration, live database/model use, commit/push/merge/deploy.

## FE evidence — 2026-10-22

**FE status:** IMPLEMENTED / verified.

- Thu gọn/minimize ẩn panel bằng CSS (`display: none` / `hidden`) nhưng vẫn giữ controller và session mounted trong DOM. Toàn bộ transcript, draft, chế độ kiến thức và pending/UNKNOWN request snapshot được duy trì nguyên vẹn.
- Yêu cầu gửi đi có thể hoàn tất khi panel đang ẩn; khi phản hồi về, controller cập nhật snapshot mà không tự động bật mở lại panel hay cướp focus của trang chủ.
- Thao tác Retry giữ nguyên hoàn toàn `Idempotency-Key`, payload JSON và `knowledgeMode` ban đầu, bất kể ô nhập hiện tại có bị sửa hay không.
- Hộp thoại `<dialog>` xác nhận bỏ theo dõi theo app-owned pattern (không dùng `window.confirm`/`alert`), nêu rõ chỉ từ bỏ khả năng phục hồi cục bộ và không cam kết server đã hủy tác vụ. Nút Hủy giữ nguyên mọi dữ liệu phiên.
- Tải lại trang (refresh) bắt đầu một panel mới theo quyết định Q7; không lưu trữ pending dạng bền vững trong localStorage/sessionStorage.
- Đã kiểm chứng qua test chuyên biệt `src/components/assistant/destination-assistant-panel.vitest.test.ts` (Ticket 03 suite: 3 PASS).
