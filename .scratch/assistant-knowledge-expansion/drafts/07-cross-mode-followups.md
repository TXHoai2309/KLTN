# 07: Hỏi tiếp sau khi đổi chế độ mà không lẫn nguồn kiến thức

**What to build:** Người dùng hỏi về Hạ Thành, bật/tắt mở rộng rồi hỏi tiếp “ở đó có gì đặc biệt?” hoặc “còn giá vé?”. AI vẫn hiểu đúng đối tượng, nhưng chỉ dùng phạm vi kiến thức được phép ở lượt mới.

**Blocked by:** 05 — Nhớ Mở rộng kiến thức theo từng cuộc chat.

**Status:** DRAFT — awaiting breakdown approval.

- [ ] AI hiểu câu hỏi tiếp nối từ bối cảnh được phép và lịch sử câu hỏi có giới hạn; câu hỏi nêu địa danh mới rõ ràng thay thế chủ thể cũ.
- [ ] Từ một câu trả lời mở rộng, chuyển sang tắt không làm thông tin model trước đó trở thành tài liệu đã xác minh hoặc nguồn trích dẫn cho lượt mới.
- [ ] Từ nguồn-only sang mở rộng, chủ thể vẫn được giữ khi rõ nghĩa; AI chỉ bổ sung kiến thức ở lượt đã bật và phần bổ sung có nhãn đúng.
- [ ] Chủ thể chưa rõ sau so sánh nhiều địa danh được hỏi lại ngắn gọn, không tự chọn một nơi chỉ để luôn đưa ra câu trả lời.
- [ ] Chuyển chat, mở lại và phục hồi UNKNOWN sử dụng đúng snapshot của từng lượt; bật lại mode không viết lại mode/provenance trong lịch sử cũ.
- [ ] Không dùng câu trả lời cũ để bỏ qua kiểm tra nguồn đã thu hồi; thông tin từ tài liệu phải được truy xuất/recheck cho lượt hiện tại theo hợp đồng nguồn hiện có.
- [ ] Kiểm thử hội thoại nhiều lượt qua composer/API/persistence và reload với cả GENERAL/DESTINATION, chuỗi tắt→bật→tắt, đổi chủ thể, nguồn thay đổi và response lệch thứ tự.
- [ ] Luồng AI vẫn dùng `gpt-6.1-sol` / `medium` và hai lần gọi thông thường; không thêm một vòng assessor/verifier chỉ để xử lý đổi mode.
