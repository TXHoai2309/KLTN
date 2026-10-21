# 06: Trả lời hữu ích khi thông tin hiện hành chưa được xác minh

**What to build:** Khi hỏi giá vé, giờ hoạt động, lịch lễ hội hoặc địa chỉ hiện tại mà nguồn chưa đủ, AI vẫn trả lời các phần biết được. Thông tin tham khảo từ model được trình bày đúng mức chắc chắn và không bị biến thành xác nhận hiện hành.

**Blocked by:** 04 — Bật Mở rộng kiến thức và nhận câu trả lời có nguồn gốc rõ ràng.

**Status:** DRAFT — awaiting breakdown approval.

- [ ] Khi tắt, chỉ trả phần tài liệu hỗ trợ và nêu giới hạn cụ thể cho phần thiếu; không gắn kiến thức model vào câu trả lời nguồn-only.
- [ ] Khi bật, có thể bổ sung tư vấn/thông tin tham khảo có nhãn; không tự chứng nhận giá, giờ, ngày tổ chức hoặc thay đổi địa chỉ là đang áp dụng chỉ nhờ kiến thức model.
- [ ] Giữ nguyên số liệu, điều kiện, địa điểm và mốc thời gian nguồn thực sự nêu; lịch sử không bị biến thành hiện tại, lịch âm không bị tự đổi thành ngày tổ chức chính thức.
- [ ] Các ghi chú “chưa xác minh phí”, quy ước tiếp cận làng 24/7, giờ từng homestay và mốc công nhận khác nhau của Hạ Thành được diễn đạt đúng phạm vi; không mặc định miễn phí hay dịch vụ mở cả đêm.
- [ ] Câu trả lời được phép hữu ích và tự nhiên; một ý chưa chắc chỉ tạo giới hạn cho ý đó, không khôi phục bộ chấm tám tiêu chí hoặc bước AI duyệt riêng.
- [ ] Planner/Constraint Validator vẫn dùng dữ liệu và quyết định xác định hiện có; lời tư vấn model không tạo PASS, thời gian chạy xe hoặc giờ mở cửa đã kiểm chứng cho các module đó.
- [ ] Kiểm thử từ yêu cầu đến UI/lịch sử ở cả hai mode với mẫu nguồn lịch sử, nguồn mâu thuẫn, thiếu nguồn và nguồn cập nhật rõ ràng. Có bộ câu trả lời mẫu để chủ dự án đánh giá độ tự nhiên và cách thể hiện giới hạn.
