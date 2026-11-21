# 04: Một khung chat ở `/assistant`

**What to build:** Người đã đăng nhập dùng chat tripsage trong khung `/assistant` (cột trái chung, ô nhập chung); khách giữ hỏi đáp. Bỏ tab và `/assistant/plan` (chuyển hướng), bỏ rewrite `?mode=plan`. Cột trái gộp hội thoại hỏi đáp, V2 cũ (chỉ đọc) và hội thoại mới; mở lại hội thoại mới thì render lại các thẻ đã lưu. Bản đồ lịch trình thu gọn, chỉ mount khi mở.

**Blocked by:** 02, 03

**Status:** TODO (chưa được duyệt code)

- [ ] Cờ `TRIPSAGE_CHAT_ENABLED` tắt thì người đã đăng nhập về đường cũ.
- [ ] Khách không gọi được `/api/ai/chat`; lời mời đăng nhập giữ câu vừa gõ.
- [ ] Bản đồ không tải khi đóng.
- [ ] Màn hình 360 px và 1280 px không tràn ngang.
- [ ] Test nguồn client, typecheck, kiểm tra trình duyệt.
