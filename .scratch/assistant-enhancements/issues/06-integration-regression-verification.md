# Ticket 06: Kiểm thử Tích hợp Toàn diện & Hồi quy Hệ thống (Integration & Verification)

**What to build:** Kiểm chứng toàn bộ luồng trải nghiệm mới trên cả giao diện toàn màn hình `/assistant` và khung popup điểm đến `.destination-assistant-panel`. Đảm bảo mô hình Luna reasoning high, bộ nhớ ngữ cảnh nhiều lượt, tổng hợp tài liệu mềm mại, tìm kiếm web có xác nhận và bố cục ô nhập mới hoạt động ổn định, không làm gãy bất kỳ tính năng nào đã hoàn thành.

**Blocked by:** None.

**Depends on:** Ticket 01, Ticket 02, Ticket 03, Ticket 04, Ticket 05.

**Status:** IMPLEMENTED & VERIFIED.

---

## 1. Acceptance Criteria

- [ ] **Kiểm thử Multi-turn Context**:
  - Thực hiện chuỗi 3–4 câu hỏi liên tiếp (Ví dụ: 1. "Đèo Mã Pí Lèng có gì đẹp?", 2. "Đi xe máy qua đó có an toàn không?", 3. "Mùa nào đi đẹp nhất?").
  - AI nhận diện chính xác chủ thể Đèo Mã Pí Lèng xuyên suốt toàn bộ chuỗi hỏi đáp.
- [ ] **Kiểm thử Văn phong & Citation**:
  - AI diễn đạt mượt mà, câu văn tự nhiên, trau chuốt, trích dẫn citation chính xác từ tài liệu nguồn.
- [ ] **Kiểm thử Web Search Flow**:
  - Thử câu hỏi không có trong tài liệu nội bộ: AI chủ động gợi ý tìm kiếm Web.
  - Thử bấm icon Web Search: Modal xác nhận hiển thị chính xác; bấm Đồng ý ➔ kích hoạt tìm kiếm Web; kết quả có nhãn cảnh báo Web nguồn mở.
- [ ] **Kiểm thử Responsive UI**:
  - Khung soạn thảo 1 hàng hiển thị hoàn hảo trên cả màn hình Desktop lớn, Tablet và Mobile bottom sheet.
- [ ] **Hồi quy toàn bộ hệ thống**:
  - `turbo run check-types` đạt 4/4 packages thành công, 0 lỗi.
  - `npm test` hoặc `vitest` toàn bộ suite AI & Assistant đạt 100% các bài test hợp lệ.
  - `git diff --check` sạch sẽ, không có whitespace thừa hay conflict.

---

## 2. Definition of Done

- Toàn bộ 5 ticket trước được tích hợp hoàn chỉnh.
- Báo cáo kết quả kiểm thử và nghiệm thu chi tiết gửi người dùng.
- Không tự ý commit hay push khi chưa có yêu cầu từ người dùng.
