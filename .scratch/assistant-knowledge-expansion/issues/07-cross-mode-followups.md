# 07: Hỏi tiếp sau khi đổi chế độ mà không lẫn nguồn kiến thức

**What to build:** Người dùng hỏi về Hạ Thành, bật/tắt mở rộng rồi hỏi tiếp “ở đó có gì đặc biệt?” hoặc “còn giá vé?”. AI vẫn hiểu đúng đối tượng, nhưng chỉ dùng phạm vi kiến thức được phép ở lượt mới.

**Blocked by:** 05 — Nhớ Mở rộng kiến thức theo từng cuộc chat.

**Status:** DONE

- [x] AI hiểu câu hỏi tiếp nối từ bối cảnh được phép và lịch sử câu hỏi có giới hạn; câu hỏi nêu địa danh mới rõ ràng thay thế chủ thể cũ.
- [x] Từ một câu trả lời mở rộng, chuyển sang tắt không làm thông tin model trước đó trở thành tài liệu đã xác minh hoặc nguồn trích dẫn cho lượt mới.
- [x] Từ nguồn-only sang mở rộng, chủ thể vẫn được giữ khi rõ nghĩa; AI chỉ bổ sung kiến thức ở lượt đã bật và phần bổ sung có nhãn đúng.
- [x] Chủ thể chưa rõ sau so sánh nhiều địa danh được hỏi lại ngắn gọn, không tự chọn một nơi chỉ để luôn đưa ra câu trả lời.
- [x] Chuyển chat, mở lại và phục hồi UNKNOWN sử dụng đúng snapshot của từng lượt; bật lại mode không viết lại mode/provenance trong lịch sử cũ.
- [x] Không dùng câu trả lời cũ để bỏ qua kiểm tra nguồn đã thu hồi; thông tin từ tài liệu phải được truy xuất/recheck cho lượt hiện tại theo hợp đồng nguồn hiện có.
- [x] Kiểm thử hội thoại nhiều lượt qua composer/API/persistence và reload với cả GENERAL/DESTINATION, chuỗi tắt→bật→tắt, đổi chủ thể, nguồn thay đổi và response lệch thứ tự.
- [x] Luồng AI vẫn dùng `gpt-6.1-sol` / `medium` và hai lần gọi thông thường; không thêm một vòng assessor/verifier chỉ để xử lý đổi mode.

## Verification Evidence
- Question Understanding & Entity Continuity:
  - `qa-question-understanding.ts` & `qa-question-understander.ts`: resolves continuations ("ở đó", "nơi này", "còn giá vé?") from permitted history context.
  - An explicit new destination names replace the former entity as the primary subject for subsequent retrieval.
  - When history involves comparison between multiple places and follow-up is ambiguous, returns concise clarification: `"Bạn đang muốn hỏi về điểm đến nào trong các nơi vừa nhắc?"`.
- Knowledge Isolation:
  - System prompt `QA_SOURCE_POLICY`: "History questions resolve intent only; prior answers/citations and outside knowledge are never evidence."
  - When switching from `EXPANDED` to `SOURCE_ONLY`, prior turn's model answers/claims are never injected as evidence. Turn 2 strictly retrieves and cites eligible document chunks.
  - Stored turns maintain immutable `knowledgeMode`, `answerParts`, and `citations`.
- Tests:
  - `apps/web/src/modules/ai/qa-cross-mode-followups.vitest.test.ts` (4 tests passed).
  - 175 tests passed across all 14 QA vitest suites. Typecheck passed with 0 errors.
