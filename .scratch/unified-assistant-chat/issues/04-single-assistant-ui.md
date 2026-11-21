# 04: Một khung chat ở `/assistant`

**What to build:** Người đã đăng nhập dùng chat tripsage trong khung `/assistant` (cột trái chung, ô nhập chung); khách giữ hỏi đáp. Bỏ tab và `/assistant/plan` (chuyển hướng), bỏ rewrite `?mode=plan`. Cột trái gộp hội thoại hỏi đáp, V2 cũ (chỉ đọc) và hội thoại mới; mở lại hội thoại mới thì render lại các thẻ đã lưu. Bản đồ lịch trình thu gọn, chỉ mount khi mở.

**Blocked by:** 02, 03

**Status:** DONE (2026-11-21)

- [x] Cờ `TRIPSAGE_CHAT_ENABLED` tắt thì người đã đăng nhập về đường cũ.
- [x] Khách không gọi được `/api/ai/chat`; lời mời đăng nhập giữ câu vừa gõ.
- [x] Bản đồ không tải khi đóng.
- [ ] Màn hình 360 px và 1280 px không tràn ngang (đã bọc CSS `min-width: 0; max-width: 100%; overflow-wrap: anywhere; overflow-x: auto` cho bảng/thẻ; chưa kiểm tra trực tiếp trên trình duyệt).
- [x] Test nguồn client, typecheck (kiểm tra trình duyệt để chủ dự án nghiệm thu theo checklist bàn giao).

**Ghi chú / chưa kiểm:** Đã bỏ `AssistantModeTabs`, bỏ rewrite `?mode=plan` trong `next.config.ts`, chuyển hướng `/assistant/plan` và `/assistant?mode=plan` về `/assistant`. Cột trái hợp nhất hội thoại mới (`/api/ai/assistant-conversations`) và hội thoại hỏi đáp/V2 cũ (`/api/ai/conversations`, mở ở chế độ chỉ đọc) kèm xoá một / xoá tất cả. Sửa thêm lỗi đồng hồ trùng millisecond trong `assistant-conversation-store.ts` để đảm bảo thứ tự tin nhắn người dùng → trợ lý luôn tất định. Chưa chạy kiểm tra trực quan trên trình duyệt (360 px / 1280 px) và live OpenAI/Places.
