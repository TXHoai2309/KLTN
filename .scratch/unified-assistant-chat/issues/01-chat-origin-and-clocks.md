# 01: Điểm xuất phát và giờ đi/về chỉ qua chat

**What to build:** Gỡ thẻ form điểm xuất phát. Tool `findOrigin` tìm nơi đi từ tên người dùng gõ (dịch vụ tìm điểm xuất phát sẵn có), trợ lý nói lại nhãn; ứng viên (≤ 3) đi về trình duyệt có chữ ký server và hiện thành nút trả lời nhanh. Tool `confirmOrigin` chỉ xác nhận khi tin nhắn mới nhất là câu đồng ý hoặc trùng nhãn; server dựng `OriginSelection` đã xác nhận. Giờ đi/về ghi bằng `recordTripInfo`, mặc định 07:00 / 18:00.

**Blocked by:** —

**Status:** TODO (chưa được duyệt code)

- [ ] Mô hình không nhận/không đưa tọa độ; ứng viên có chữ ký, sửa ở trình duyệt thì bị từ chối (400).
- [ ] `confirmOrigin` từ chối khi chưa có câu đồng ý, khi `candidateId` lạ hoặc hết hạn.
- [ ] Điểm tập kết là ứng viên cố định.
- [ ] Giờ mặc định áp và đánh dấu; nhắn "đi lúc 6h" thì lập lại lịch.
- [ ] Bỏ `TripsageOriginCard`/`TripJourneyEditor` khỏi chat; `/trips/new` không đổi.
- [ ] Test route mô hình giả, hàm nhận câu đồng ý, typecheck.
