# 08: Thanh AI Edit hợp nhất v2 (ngữ cảnh hội thoại trong phiên, đổi giờ xuất phát & Planning guidance)

**What to build:** Mở rộng thanh AI hợp nhất để hỗ trợ tương tác tự nhiên như hội thoại ngắn: giữ ngữ cảnh các lượt trao đổi tạm trong phiên trình duyệt (reset khi tải lại trang, không tạo bảng DB mới) để hiểu các câu nối tiếp như *"đổi điểm đó sang chiều"* hay *"bỏ nó đi"*; cho phép AI thực hiện ý định chỉnh giờ khởi hành hoặc hạn về của `Trip origin` (khi chuyến chưa khởi hành); và phân loại các câu hỏi `Planning guidance` (như *"Ngày 1 đi vậy có bị gấp quá không?"*) để trả lời ngắn gọn dựa trên `Edit draft` và kết quả `Itinerary validation` hiện tại mà không làm thay đổi bản nháp.

**Blocked by:** 04 — Tích hợp chỉnh Trip origin & giờ đi/về (journeySnapshot) trong Workspace; 07 — Thanh AI Edit hợp nhất v1 (đọc Edit draft, đa thao tác, gợi ý 3 điểm & Hoàn tác trực quan)

**Status:** done

- [x] Request AI chấp nhận danh sách lịch sử hội thoại ngắn trong phiên (được giới hạn số lượt và độ dài ký tự, xử lý như dữ liệu không đáng tin cậy) để giải quyết tham chiếu nối tiếp trong cùng phiên; tải lại trang bắt đầu phiên AI mới sạch sẽ.
- [x] AI nhận diện và thực thi được ý định thay đổi giờ khởi hành Ngày 1 hoặc hạn về ngày cuối trên `Edit draft` (chỉ áp dụng khi chuyến đã có `Trip origin` và chưa tới mốc khởi hành; nếu chuyến chưa có `Trip origin` hoặc đã khởi hành thì phản hồi rõ lý do/hướng dẫn thay vì báo lỗi chung chung hoặc tự bịa tọa độ).
- [x] Câu hỏi tư vấn chỉ-đọc về lịch hiện tại được phân loại thành `ADVISED` (`Planning guidance`): server trả lời ngắn gọn bám sát số liệu thực tế trong `Edit draft` và kết quả `Itinerary validation` (không bịa số liệu giờ/quãng đường/thời tiết, không khẳng định lịch đã lưu hay hợp lệ khi chưa qua Validator), giữ nguyên `Edit draft` không đổi và không sinh mục Undo mới.
- [x] Giao diện thanh AI hiển thị luồng trao đổi gọn trong phiên (tin nhắn người dùng, trả lời `Planning guidance`, chip chọn gợi ý, hoặc thông báo kết quả sửa đã áp lên bản nháp), giữ gọn chiều cao và hỗ trợ `aria-live` lẫn responsive `360px`.
- [x] Kiểm thử seam service/HTTP (context follow-up, origin clock before/after cutoff, `ADVISE` không biến đổi draft, guard nội dung bịa đặt/prompt injection) và seam UI hội thoại AI đều PASS.
