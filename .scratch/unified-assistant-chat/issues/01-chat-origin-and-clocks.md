# 01: Điểm xuất phát và giờ đi/về chỉ qua chat

**What to build:** Gỡ thẻ form điểm xuất phát. Tool `findOrigin` tìm nơi đi từ tên người dùng gõ (dịch vụ tìm điểm xuất phát sẵn có), trợ lý nói lại nhãn; ứng viên (≤ 3) đi về trình duyệt có chữ ký server và hiện thành nút trả lời nhanh. Tool `confirmOrigin` chỉ xác nhận khi tin nhắn mới nhất là câu đồng ý hoặc trùng nhãn; server dựng `OriginSelection` đã xác nhận. Giờ đi/về ghi bằng `recordTripInfo`, mặc định 07:00 / 18:00.

**Blocked by:** —

**Status:** DONE (2026-11-21)

- [x] Mô hình không nhận/không đưa tọa độ; ứng viên có chữ ký, sửa ở trình duyệt thì bị từ chối (400).
- [x] `confirmOrigin` từ chối khi chưa có câu đồng ý, khi `candidateId` lạ hoặc hết hạn.
- [x] Điểm tập kết là ứng viên cố định.
- [x] Giờ mặc định áp và đánh dấu; nhắn "đi lúc 6h" thì lập lại lịch.
- [x] Bỏ `TripsageOriginCard`/`TripJourneyEditor` khỏi chat; `/trips/new` không đổi.
- [x] Test route mô hình giả, hàm nhận câu đồng ý, typecheck.

**Ghi chú / chưa kiểm:** Live OpenAI, Google/Stadia origin search thật, và kiểm tra trực tiếp trên trình duyệt chưa chạy trong bước này; toàn bộ hành vi ranh giới đã kiểm bằng `MockLanguageModelV4` và test đơn vị. Token ứng viên hết hạn sau 30 phút (trả mã `ORIGIN_CANDIDATES_EXPIRED` khi gọi `confirmOrigin`, không chặn tin nhắn mới); token bị sửa chữ ký/tải trọng/chủ sở hữu bị từ chối 400 trước khi gọi model.
