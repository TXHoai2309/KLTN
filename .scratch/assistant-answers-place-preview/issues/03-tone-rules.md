# 03: Quy tắc giọng văn của trợ lý

**What to build:** Câu trả lời của trợ lý bớt cứng nhắc: mỗi vấn đề hoặc lời xin lỗi chỉ nói một lần trong cả cuộc trò chuyện; mỗi tin tối đa một câu hỏi, các câu hỏi phụ (số người, nhịp đi, ngân sách, kiểu chỗ nghỉ) thành nút gợi ý; không lặp lại thông tin người dùng vừa nói; cảnh báo kiểm tra nói tối đa một câu vì thẻ lịch đã hiển thị chi tiết; lượt chỉ lập lịch không gắn nguồn tài liệu không liên quan.

Spec: `docs/specs/assistant-answers-place-preview-spec.md` (user story 1–6, mục "Giọng văn").

**Blocked by:** 01 (cùng sửa chỉ dẫn hệ thống)

**Status:** done

- [x] Chỉ dẫn hệ thống tripsage-chat có các quy tắc trên; chỉ dẫn "hỏi cụm 2" sau khi có lịch được thay bằng `suggestReplies` (câu hỏi cuối tin để dành cho ticket 04 và 12).
- [x] Nguồn tài liệu chỉ gắn vào tin khi lượt đó gọi `lookupLocalKnowledge` và câu trả lời dựa vào nguồn; lượt chỉ gọi tool lập lịch không mang nguồn.
- [x] Ranh giới cũ giữ nguyên: lời văn không tự đặt giờ, tên địa điểm ngoài dữ liệu tool, giá hay tình trạng phòng.
- [x] Test qua route chat với model giả lập: lượt chỉ lập lịch không trả phần nguồn tài liệu; lượt có `lookupLocalKnowledge` vẫn trả nguồn.
- [x] Typecheck, vitest tripsage-chat, `git diff --check` sạch.

## Ghi chú hoàn thành

- **File đã đổi:**
  - `apps/web/src/modules/tripsage-chat/tripsage-chat-service.ts`: bổ sung quy tắc giọng văn (mỗi vấn đề/lời xin lỗi chỉ nói một lần; tối đa 1 câu hỏi mỗi tin; không lặp thông tin người dùng vừa nêu; cảnh báo kiểm tra lịch tối đa 1 câu ngắn); thay chỉ dẫn "hỏi cụm 2" bằng `suggestReplies`; giới hạn `lookupLocalKnowledge` cho các lượt thực sự dựa vào kiến thức địa phương thay vì gọi máy móc trên lượt lập lịch/chi phí thuần.
  - `apps/web/src/modules/tripsage-chat/tripsage-chat-tone.vitest.test.ts`: 3 test qua `tripsageChatResponse` kiểm tra lượt chỉ lập lịch không phát `data-sources`, lượt gọi `lookupLocalKnowledge` có tài liệu thì phát `data-sources`, và không có tài liệu thì không phát.
- **Kiểm tra đã chạy:**
  - `node --max-old-space-size=4096 ../../node_modules/typescript/bin/tsc --noEmit -p .`: PASS.
  - `npx vitest run src/modules/tripsage-chat`: 29/29 files, 328/328 tests PASS.
  - `git diff --check`: PASS.
- **Việc chưa làm:** Đánh giá chất lượng giọng văn với model thật trên trình duyệt (ticket 13).
