# 01: Tách phiên chat dùng chung khỏi giao diện trang Assistant

**What to build:** Cùng một lõi hỏi đáp có thể chạy trong trang Assistant đầy đủ hoặc một bề mặt nhúng thử nghiệm mà không tự áp sidebar, URL hay bố cục toàn màn hình lên trang chứa. Đây là bước prefactor cần làm trước khi đưa nút popup ra cho người dùng.

**Blocked by:** None (can start immediately).

**Status:** IMPLEMENTED — FE and API/BE offline code complete; PostgreSQL verification pending; awaiting owner acceptance.

- [x] Phân biệt rõ trách nhiệm phiên chat/controller/transport với trách nhiệm full-page URL, sidebar, lịch sử và bố cục; không sao chép một luồng AI riêng cho popup.
- [x] Bề mặt nhúng có thể khởi tạo đúng Destination context mà không đọc/ghi conversationId vào URL trang chứa hoặc nạp sidebar toàn bộ lịch sử.
- [x] Có cơ chế giữ session/controller trong khi bề mặt hiển thị bị ẩn; mỗi session chỉ có một chủ sở hữu request và retry snapshot.
- [x] Tái sử dụng hiển thị câu trả lời, trích dẫn, nhãn kiến thức mở rộng và lựa chọn mode hiện có; không sửa chính sách hỏi đáp đã hoàn thành.
- [x] Không tạo main lồng main, chiều cao toàn viewport hoặc CSS full-page rò sang trang chứa.
- [x] API/BE xác nhận các hợp đồng session/ask/history/preference hiện có đủ cho bề mặt nhúng, cung cấp fixture đúng wire shape và chỉ sửa gap server đã chứng minh.
- [x] Kiểm thử bề mặt nhúng cho thấy URL không bị đổi; hồi quy trang Assistant đầy đủ về URL, sidebar, lịch sử, mode, nguồn và gửi bằng bàn phím.
- [x] Ghi riêng evidence FE và API/BE; không coi việc tách type/component xong là hoàn thành nếu hành vi hai bề mặt chưa được kiểm chứng.


## API/BE evidence — 2026-10-22

**BE status:** IMPLEMENTED / offline verified; PostgreSQL verification pending. **Vertical ticket:** ready-for-agent, FE/integration still OPEN; not DONE.

BE: verified existing session/ask/get/turns/preference reuse; no popup DTO or endpoint. Synthetic FE wire fixtures are in apps/web/src/modules/ai/__fixtures__/qa-panel-wire.ts, validated by qa-panel-wire.vitest.test.ts. FE still owns the reusable embedded/full-page seam, URL/sidebar separation and regressions.

Shared receipt: [API/BE handoff](../../../docs/implementation/destination-assistant-popup-contract.md#apibe-handoff--2026-10-22). Focused suite: 190 PASS / 37 PostgreSQL SKIP; shared idempotency: 4 PASS; root typecheck: 4 tasks PASS. Three red store regressions passed after fixes. Broad Q&A still has 12 pre-existing failures, reproduced on isolated HEAD 18e5e50; see shared receipt for commands and limits. Docker readiness failed/timed out, so SQL/transaction behavior is not claimed verified. No new migration, live database/model use, commit/push/merge/deploy.

## FE evidence — 2026-10-22

**FE status:** IMPLEMENTED / verified.

- Tách rõ bề mặt trình bày `AssistantChatSurface` và cấu hình chế độ `mode="page" | "panel"` trong `AssistantChat`.
- Ở chế độ `panel`, `conversationId` không bị đọc từ query hay đồng bộ vào URL thông qua pushState/replaceState/popstate.
- Không nạp `AssistantSidebar` hoặc gọi `loadConversationList` trong popup.
- Không có thẻ `<main>` lồng nhau; CSS đóng gói theo container `.destination-assistant-panel` mà không gây rò rỉ fullscreen layout hay layout shift.
- Giữ nguyên toàn bộ regression suite của trang Assistant đầy đủ: sidebar, navigation, search, keyboard send, knowledge mode, và citation disclosures (59 PASS).
- Đã kiểm chứng qua test chuyên biệt `src/components/assistant/destination-chat-seam.vitest.test.ts` (4 PASS).
