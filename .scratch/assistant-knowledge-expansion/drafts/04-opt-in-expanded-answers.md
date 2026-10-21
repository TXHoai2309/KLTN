# 04: Bật Mở rộng kiến thức và nhận câu trả lời có nguồn gốc rõ ràng

**What to build:** Người dùng bật nút **Mở rộng kiến thức** trong khung soạn để AI bổ sung kiến thức model vào tư vấn du lịch Hà Giang. Khi tắt, lượt hỏi chỉ bám tài liệu; phần model bổ sung được phân biệt bằng nhãn nhỏ **Kiến thức mở rộng**.

**Blocked by:** 03 — Trả lời bám tài liệu tự nhiên bằng luồng AI đơn giản.

**Status:** DRAFT — awaiting breakdown approval.

- [ ] Nút bật/tắt hoạt động từ composer qua server đến câu trả lời và lịch sử lượt hỏi; không phải một thay đổi UI mà server bỏ qua. Chat mới bắt đầu tắt.
- [ ] Khi bật, ưu tiên tài liệu và được bổ sung phần thiếu, bối cảnh hoặc kinh nghiệm liên quan ngay cả khi tài liệu đã trả lời được ý chính; không triển khai tìm kiếm web hay chatbot đa lĩnh vực.
- [ ] Biểu diễn trung thực được ba trường hợp: nội dung chỉ từ tài liệu, nội dung chỉ từ model và câu trả lời hỗn hợp. Các phần khác nhau về căn cứ được tách đủ rõ để nhãn/trích dẫn không gây hiểu nhầm.
- [ ] Chỉ phần có tài liệu hỗ trợ mới dùng trích dẫn nguồn thật. Phần model có nhãn nhỏ, không bịa URL hoặc mượn trích dẫn của đoạn bên cạnh; không lặp cảnh báo trong từng câu.
- [ ] Mode được chốt cùng nội dung và idempotency key khi gửi; đổi nút sau đó không thay payload đang chạy hoặc UNKNOWN retry. Cùng key nhưng đổi mode phải bị xử lý như đổi nội dung yêu cầu.
- [ ] Yêu cầu/lịch sử cũ không có mode được hiểu là tắt và vẫn đọc/replay được; thêm thông tin model không làm giả provenance tài liệu để vượt hợp đồng cũ.
- [ ] Response mới và snapshot lịch sử giữ mode và căn cứ của từng phần; bật/tắt về sau không đổi câu trả lời đã lưu.
- [ ] Giữ kiểm tra sở hữu, lifecycle nguồn, secret và xác nhận ghi database; chế độ mở rộng không bỏ qua lỗi truy xuất/provider hoặc dùng tài liệu bị thu hồi.
- [ ] Kiểm thử end-to-end bằng provider/database giả cho tắt/bật, nguồn đủ/thiếu/không có, câu hỗn hợp, UI nhãn/nguồn và retry. Provider thật nếu cần phải có bước kiểm chứng được báo riêng.
- [ ] Composer và nhãn dùng được trên màn hình hẹp, bàn phím và trạng thái đang gửi; không cần hoàn tất lưu tùy chọn chat giữa các lần mở trước ticket 05.
