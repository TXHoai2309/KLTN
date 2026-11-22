# Ticket 02: Khôi phục & Duy trì Ngữ cảnh Hội thoại Nhiều Lượt (Multi-turn Context Memory)

**What to build:** Khắc phục lỗi AI bị "mất trí nhớ" giữa các câu hỏi liên tiếp. Nới lỏng bộ lọc regex hạn hẹp để mọi câu hỏi tiếp nối đều giữ ngữ cảnh; đồng thời mở rộng dữ liệu gửi vào prompt gồm cả câu hỏi và câu trả lời tóm lược của 2-3 lượt trước đó thay vì chỉ gửi mảng câu hỏi rỗng.

**Blocked by:** None.

**Depends on:** Ticket 01.

**Status:** IMPLEMENTED & VERIFIED.

---

## 1. Acceptance Criteria

- [ ] Loại bỏ quy định chỉ các câu hỏi khớp regex hẹp (`needsHistory`) mới được lấy lịch sử. Bất kỳ câu hỏi nào trong phiên hội thoại có `parentTurnId` hợp lệ đều được gắn kết ngữ cảnh của lượt trước.
- [ ] Trong `qa-prompt.ts`, bổ sung trường `HISTORY_TURNS` vào prompt gửi cho mô hình, chứa danh sách 2–3 lượt gần nhất gồm cả `question` và nội dung tóm tắt/chính của `answer` (thay vì chỉ có mảng chuỗi `HISTORY_QUESTIONS`).
- [ ] Mô hình có đủ thông tin để hiểu các câu hỏi có đại từ thay thế hoặc câu hỏi nối tiếp (ví dụ: "Nó ở đâu?", "Giá vé thế nào?", "Ngày thứ 2 có gì vui?", "Thế còn đồ ăn thì sao?").
- [ ] Module `qa-question-understanding.ts` nhận diện đúng đối tượng mục tiêu (`targetSubjects`) từ ngữ cảnh hội thoại đã diễn ra, không đánh giá nhầm thành câu hỏi thiếu bối cảnh hoặc đòi hỏi làm rõ vô lý (`CLARIFICATION_REQUIRED`).
- [ ] Không làm tràn ngữ cảnh: Lịch sử được giới hạn gọn gàng (2–3 lượt gần nhất) để giữ độ trễ thấp và tập trung vào mạch hội thoại hiện tại.

---

## 2. Technical Design & Files

- `apps/web/src/modules/ai/qa-question-understanding.ts`:
  - Mở rộng `qaIntentHistory`: Chấp nhận toàn bộ các lượt trước đó (loại trừ các lượt chỉ là chào hỏi xã giao), không bị chặn bởi hàm `needsHistory`.
  - Giữ lại tối đa 3 lượt hoàn chỉnh gần nhất.
- `apps/web/src/modules/ai/qa-prompt.ts`:
  - Cập nhật payload `composeQaPrompt`:
    ```ts
    HISTORY_TURNS: input.history.slice(-3).map(turn => ({
      question: turn.question,
      answerSummary: extractTurnSummary(turn.response),
    }))
    ```
- `apps/web/src/modules/ai/qa-question-understander.ts`: Truyền lịch sử hội thoại đầy đủ vào prompt hiểu câu hỏi.
- Unit tests: Viết test cho chuỗi 3 câu hỏi liên tiếp xác nhận mô hình nhận diện chính xác chủ thể từ câu hỏi trước.

---

## 3. Definition of Done

- Test hội thoại multi-turn: Câu hỏi 1 về "Đồng Văn", câu hỏi 2 "Ở đó có đặc sản gì?" nhận diện đúng Đồng Văn và trả lời đặc sản tương ứng.
- Unit test `qa-question-understanding.vitest.test.ts` pass 100%.
- `npm run check-types` pass 0 errors.
