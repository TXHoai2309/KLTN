# 03: Trả lời bám tài liệu tự nhiên bằng luồng AI đơn giản

**What to build:** Ở chế độ chưa mở rộng kiến thức, người dùng nhận câu trả lời tự nhiên từ tài liệu đã tìm được. Một ý còn thiếu hoặc một quy tắc văn phong không làm mất những phần đã có căn cứ.

**Blocked by:** 02 — AI hiểu câu hỏi và truy xuất đúng địa danh.

**Status:** DRAFT — awaiting breakdown approval.

- [ ] Luồng thông thường dùng hai lần gọi AI: hiểu câu hỏi rồi soạn câu trả lời; bỏ bước assessor riêng và verifier tám tiêu chí khỏi luồng chặn kết quả đang chạy, không chỉ sửa prompt.
- [ ] Bỏ giao thức bắt buộc chia mọi câu trả lời theo mã facet và yêu cầu sao chép chính xác câu nguồn để được chấp nhận; giữ cấu trúc phản hồi tối thiểu và kiểm tra tham chiếu nguồn thực.
- [ ] Không ép 80–120 từ hoặc cấm lời chuyển, đoạn văn, danh sách, lời gợi mở phù hợp chỉ vì phong cách. Giao diện hiển thị định dạng được hỗ trợ một cách an toàn.
- [ ] Prompt và chế độ nguồn bảo đảm phạm vi chỉ dùng tài liệu truy xuất; không tự bổ sung kiến thức model khi chưa bật mở rộng. Khi không có căn cứ có thể dùng, trả thông báo thiếu nguồn rõ ràng.
- [ ] Nếu một ý thiếu hoặc có mâu thuẫn, giữ phần có thể trả lời, mô tả giới hạn ở đúng ý đó; không tự chọn một dữ kiện mâu thuẫn thành sự thật.
- [ ] Các câu tiếp nối trong cùng đoạn/mục đã xác định đúng địa danh có thể được dùng mà không bắt buộc lặp toàn bộ tên địa danh trong từng câu.
- [ ] Chỉ dẫn trong tài liệu luôn là dữ liệu; không thực thi chúng. Cách viết hay ghi chú biên tập vô hại không là lý do tự động loại cả câu trả lời; bảo vệ secret và nguồn riêng tư vẫn áp dụng.
- [ ] Model soạn câu trả lời dùng `gpt-6.1-sol` / `medium`; lỗi provider, response không đọc được hoặc nguồn mất hiệu lực được giữ đúng loại lỗi, không đổi thành câu trả lời thành công.
- [ ] Hồi quy từ API đến UI và lịch sử: giới thiệu Hạ Thành, câu nhiều ý có phần thiếu, câu diễn giải khác nguyên văn và nguồn bị thu hồi; lịch sử cũ vẫn đọc được.
- [ ] Có kiểm thử chứng minh các lớp assessor/verifier cũ không còn được dispatch trong luồng bình thường; ghi rõ thay đổi mức kiểm chứng độc lập đã được chủ dự án chấp nhận.
