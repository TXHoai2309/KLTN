# Ticket 05: Tái thiết kế Khung Soạn thảo 1 Hàng & Popup Xác nhận Tìm kiếm Web (Single-Row Composer & Web Search Modal)

**What to build:** Đưa nút Gửi lên cùng hàng với ô nhập câu hỏi (single-row composer input) tạo phong cách hiện đại và liền mạch. Ghim icon Web Search trên thanh nhập kèm popup modal cảnh báo yêu cầu người dùng xác nhận trước khi bật; đồng thời hiển thị nút gợi ý tìm kiếm Web trực tiếp trong khung chat khi AI trả về thiếu thông tin.

**Blocked by:** None.

**Depends on:** Ticket 04.

**Status:** IMPLEMENTED & VERIFIED.

---

## 1. Acceptance Criteria

- [ ] **Bố cục 1 hàng (Single-Row Composer)**:
  - Textarea co giãn tự động nằm chung một hàng ngang linh hoạt với nút Gửi hình tròn/gradient bên phải:
    ```
    ┌───────────────────────────────────────────────┬───────┐
    │  Nhập câu hỏi về Hà Giang...                  │  [➤]  │
    └───────────────────────────────────────────────┴───────┘
       [🌿 Bối cảnh]  [🌐 Tìm kiếm Web]            0/2000 ký tự
    ```
  - Nút Gửi hiển thị gọn gàng (icon mũi tên gửi), có hover effect mượt mà và chuyển sang trạng thái loading khi đang gửi.
  - Phía dưới là thanh công cụ phụ thanh lịch chứa: Dropdown chọn bối cảnh điểm đến, nút ghim icon Web Search, và bộ đếm ký tự.
- [ ] **Ghim Icon Web Search & Modal Xác nhận**:
  - Icon Web Search (`Globe` icon) được ghim trên thanh công cụ phụ.
  - Khi người dùng click vào icon Web Search:
    - Hiển thị Popup Modal xác nhận:
      - Tiêu đề: *"Bật tính năng Tìm kiếm thông tin từ Web?"*
      - Nội dung cảnh báo: *"Trợ lý sẽ mở rộng tìm kiếm dữ liệu trực tuyến ngoài các tài liệu đã được ban quản lý điểm đến kiểm duyệt. Thông tin từ Web có thể có sai lệch hoặc chưa cập nhật."*
      - Nút: *"Hủy"* và *"Tôi hiểu & Bật tìm kiếm Web"*.
    - Khi người dùng bấm đồng ý: Icon Web Search chuyển sang trạng thái Active (màu xanh/vàng sáng kèm huy hiệu "Web ON").
- [ ] **Hành động gợi ý khi AI thiếu dữ liệu (In-chat Suggestion)**:
  - Khi phản hồi của AI có cờ `suggestWebSearch: true`: Hiển thị nút hành động nổi bật ngay dưới câu trả lời:
    `[🌐 Tìm kiếm thông tin này từ Web]`
  - Người dùng bấm vào nút này sẽ tự động bật cờ Web Search và gửi lại câu hỏi mà không cần gõ lại.

---

## 2. Technical Design & Files

- `apps/web/src/components/assistant/assistant-chat-surface.tsx` & `assistant-chat.tsx`:
  - Thiết kế lại container `.assistant-composer-input`:
    - Dòng trên: `.assistant-composer-row` gồm `<textarea>` và `<button type="submit">`.
    - Dòng dưới: `.assistant-composer-footer-tools` gồm selector bối cảnh, toggle web search và counter.
  - State quản lý `webSearchEnabled` và `webSearchModalOpen`.
  - Component `<WebSearchConfirmationModal>` accessible với `Escape`, focus trap và `aria-labelledby`.
  - Hiển thị quick-action button `[Tìm kiếm từ Web]` trong transcript khi AI phản hồi `suggestWebSearch`.
- `apps/web/src/components/assistant/destination-panel.css` & `assistant.css`:
  - Cập nhật styling cho single-row input, nút Gửi tròn hiện đại và modal popup xác nhận.

---

## 3. Definition of Done

- Trực quan: Nút gửi nằm cùng dòng với textarea, gõ nhiều dòng textarea tự giãn mà nút gửi vẫn căn giữa hoặc dưới đẹp mắt.
- Click icon Web Search mở modal xác nhận chuẩn WCAG; xác nhận xong chuyển sang trạng thái Web ON.
- Khi AI trả lời thiếu thông tin, bấm nút gợi ý sẽ kích hoạt tìm kiếm Web thành công.
- `npm run check-types` pass 0 errors.
