# 05: Nhớ Mở rộng kiến thức theo từng cuộc chat

**What to build:** Người dùng bật mở rộng ở một cuộc chat, mở lại cuộc chat đó vẫn thấy lựa chọn đúng; chat khác và chat mới không tự bật theo. Lựa chọn hiện tại và mode của từng câu trả lời cũ được hiển thị nhất quán.

**Blocked by:** 04 — Bật Mở rộng kiến thức và nhận câu trả lời có nguồn gốc rõ ràng.

**Status:** DRAFT — awaiting breakdown approval.

- [ ] Chat đã tồn tại lưu lựa chọn riêng theo chủ sở hữu; refresh hoặc mở lại phục hồi lựa chọn từ dữ liệu đã xác nhận, không suy ra từ một chat khác hay từ câu trả lời model.
- [ ] Chat mới chưa được tạo giữ lựa chọn trong phiên soạn và lưu cùng lần tạo chat thành công đầu tiên; bắt đầu chat mới luôn mặc định tắt.
- [ ] Chat lịch sử chưa có thiết lập được hiểu là tắt. Mode trên các lượt cũ vẫn giữ nguyên độc lập với tùy chọn hiện tại.
- [ ] Bật/tắt không thay đổi Destination context hoặc tự tạo/xóa cuộc chat. Tài khoản khác, Guest khác và Admin không đọc hay đổi lựa chọn của chat không thuộc mình.
- [ ] Lưu lựa chọn tuân theo SUCCESS/FAILED/UNKNOWN và idempotency; UI không coi trạng thái chưa xác nhận là đã lưu và không đổi mode của một ask đang chờ phục hồi.
- [ ] Giữ các setting thay đổi trong lúc request đang chạy tách khỏi snapshot request đó; phiên bản/đồng bộ hiện có phải ngăn một phản hồi cũ ghi đè lựa chọn mới.
- [ ] Nếu cần đổi schema, chuẩn bị migration Prisma có tính tương thích với dữ liệu cũ; không dùng db:push hoặc tự chạy migration Production trong ticket này.
- [ ] Kiểm thử UI/API/persistence với refresh, mở lại, đổi chat, new chat, lỗi ghi, UNKNOWN và hai thao tác cập nhật lệch thứ tự; giữ kiểm thử sở hữu và lịch sử cũ.
