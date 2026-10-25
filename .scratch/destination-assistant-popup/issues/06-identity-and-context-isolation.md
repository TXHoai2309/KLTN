# 06: Đổi tài khoản và điểm đến không làm lộ hoặc lẫn cuộc chat

**What to build:** Người dùng đăng nhập, đăng xuất, đổi tài khoản hoặc gặp điểm đến không còn khả dụng khi chat đang mở/ẩn/chuyển trang vẫn nhận trạng thái đúng; câu hỏi và câu trả lời của phiên cũ không xuất hiện trong phiên mới.

**Blocked by:** 05 — Mở trang Assistant đầy đủ với đúng chat và bản nháp.

**Status:** IMPLEMENTED — FE and API/BE offline code complete; PostgreSQL verification pending; awaiting owner acceptance.

- [x] Guest, Traveler và Admin sử dụng cùng khả năng hỏi đáp public đã có, không bắt buộc Guest đăng nhập chỉ vì chuyển sang popup.
- [x] Thay đổi principal đã xác nhận xóa trạng thái/transfer của principal trước và chặn callback muộn; auth refetch tạm thời không tự gửi lại hoặc retarget câu hỏi.
- [x] Popup không đọc conversationId tùy ý trong URL Destination để tải chat GENERAL hoặc chat của điểm đến khác; context trả từ server được đối chiếu trước khi tiếp tục.
- [x] Server vẫn kiểm tra owner và public Destination visibility trên các đường hiện có. Conversation không thuộc mình, thiếu/ẩn/không khả dụng có lỗi và UI rõ ràng; không fallback thành nguồn hoặc tên giả.
- [x] Đổi route Destination bắt đầu panel mới; không thay ID của conversation đang có để dùng như chat của điểm đến mới. Lượt cũ đã lưu vẫn có đúng context/mode ban đầu.
- [x] Bao phủ session bootstrap fail, authorization fail, chat bị xóa/hết hạn, destination mất hiệu lực và response tới muộn cả khi panel thu gọn hoặc vừa handoff.
- [x] API/BE cung cấp evidence kiểm thử owner/context/idempotency và chỉ sửa lỗ hổng đã chứng minh; FE kiểm chứng không lộ transcript/draft/nguồn cũ ra màn hình hoặc transfer mới.
- [x] Kiểm thử API/service và luồng UI có đổi identity/context; báo riêng những trường hợp cần hai tài khoản/browser thật hoặc database thật chưa chạy, không suy diễn từ mock.


## API/BE evidence — 2026-10-22

**BE status:** IMPLEMENTED / offline verified; PostgreSQL verification pending. **Vertical ticket:** ready-for-agent, FE/integration still OPEN; not DONE.

BE: bootstrap/resolver tests prove Guest/public role behavior, persisted Traveler/Admin identity and locked-user denial without Guest fallback. Fixed Destination visibility recheck on preference writes. Added PostgreSQL foreign owner, hidden/expired/deleted chat, revoked Guest and locked-user coverage for get/turns/preference; these cases remain unexecuted. FE still tests principal/context transitions, stale callbacks and hidden/handoff state isolation.

Shared receipt: [API/BE handoff](../../../docs/implementation/destination-assistant-popup-contract.md#apibe-handoff--2026-10-22). Focused suite: 190 PASS / 37 PostgreSQL SKIP; shared idempotency: 4 PASS; root typecheck: 4 tasks PASS. Three red store regressions passed after fixes. Broad Q&A still has 12 pre-existing failures, reproduced on isolated HEAD 18e5e50; see shared receipt for commands and limits. Docker readiness failed/timed out, so SQL/transaction behavior is not claimed verified. No new migration, live database/model use, commit/push/merge/deploy.

## FE evidence — 2026-10-22

**FE status:** IMPLEMENTED / verified.

- Hỗ trợ đầy đủ Guest, Traveler và Admin thông qua `useAssistantSession` và runtime HTTP transport; không ép Guest đăng nhập khi mở popup.
- Khi principal thay đổi (đăng nhập/đăng xuất/chuyển tài khoản):
  - Invalidate controller qua `changeIdentity(newIdentity)`, hủy sạch transcript, draft, pending attempt, và tăng generation để vô hiệu hóa hoàn toàn late callbacks.
  - Hủy ngay mọi transfer đang chờ trong `assistant-handoff.ts` (`clearAssistantHandoff()`).
- Bề mặt nhúng Destination chỉ nhận `destinationId` từ props trang hiện tại; không đọc conversationId trong URL trang chi tiết để tải cuộc chat lạ.
- Kiểm tra tính khớp ngữ cảnh (context matching): nếu conversationId khôi phục không khớp với điểm đến kỳ vọng, từ chối áp dụng và hiển thị thông báo lỗi rõ ràng thay vì âm thầm fallback về GENERAL.
- Khi chuyển route điểm đến mới, panel khởi tạo lại ngữ cảnh mới cho đúng điểm đến đó mà không gán đè cuộc chat cũ.
- Đã kiểm chứng qua test chuyên biệt `src/components/assistant/destination-assistant-panel.vitest.test.ts` (Ticket 06 suite: 3 PASS).
- Lưu ý giới hạn: kiểm chứng thực tế giữa hai tài khoản thật hoặc cơ sở dữ liệu thật với Docker/PostgreSQL cần môi trường live, được ghi nhận là pending gate theo đúng hợp đồng.
