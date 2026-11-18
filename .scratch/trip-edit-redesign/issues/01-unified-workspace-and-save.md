# 01: Khung Workspace Timeline + Bản đồ, Edit draft thống nhất, bỏ trần 4 lượt/ngày & Hộp thoại Lưu

**What to build:** Khi chủ chuyến (Traveler hoặc Admin sở hữu chuyến) mở màn hình chỉnh sửa hành trình cho một chuyến chưa hoàn thành, họ làm việc trong không gian 2 cột mới (Timeline chỉnh trực tiếp bên trái, bản đồ lộ trình tương tác sticky bên phải, kèm thanh tab ngày, tab `Lịch trình / Bản đồ` và thanh lưu ghim đáy trên di động, đồng thời ẩn nút nổi Trợ lý AI). Người dùng có một `Edit draft` duy nhất với `Undo/Redo`, chỉnh trực tiếp giờ bắt đầu, thời lượng, thứ tự lên/xuống, chuyển ngày hoặc xóa trên từng thẻ `Scheduled visit` (không còn giấu trong accordion), xếp được hơn 4 lượt/ngày (giữ trần 50 lượt toàn chuyến), kiểm tra bằng cấu hình routing chung của hệ thống (`PLANNER_ROUTING_PROVIDER`), và lưu qua hộp thoại xác nhận gọn theo hợp đồng `SUCCESS / FAILED / UNKNOWN` hoặc hủy giữ nguyên `Saved itinerary`.

**Blocked by:** None (can start immediately).

**Status:** done

- [x] Trang chỉnh sửa hiển thị đúng `Saved itinerary` ban đầu với ảnh đại diện điểm đến, tab ngày (`Tất cả` / `Ngày 1`…), thanh trạng thái (`Đã lưu` / `X thay đổi chưa lưu`), bản đồ tương tác đồng bộ điểm/ngày đang chọn, và ẩn nút nổi Trợ lý AI dùng chung.
- [x] Thẻ `Scheduled visit` cho phép chỉnh trực tiếp giờ bắt đầu, thời lượng, đổi thứ tự lên/xuống, chuyển ngày và xóa bằng chuột, chạm và bàn phím mà không cần mở accordion; mọi thay đổi giữ trong `Edit draft` và hỗ trợ `Undo/Redo` trong phiên.
- [x] Gỡ giới hạn cứng 4 `Scheduled visit` mỗi ngày trong hợp đồng chỉnh sửa (cho phép kiểm tra và lưu ngày có từ 5 lượt trở lên miễn hợp lệ), đồng thời giữ nguyên trần 50 lượt toàn chuyến, tối thiểu 1 lượt cả chuyến, và giữ bất biến `ngày bắt đầu`, `số ngày`, `phương tiện`.
- [x] Backend Preview và Apply sử dụng bộ provider định tuyến chung theo cấu hình hệ thống (`PLANNER_ROUTING_PROVIDER` và rule tốc độ thống nhất), giữ nguyên nguyên tắc `INSUFFICIENT_DATA` không bao giờ là `PASS`.
- [x] Chuyến đi đã hoàn thành (`COMPLETED` theo ngày kết thúc hoặc đánh dấu thủ công) bị khóa trên cả API chỉnh sửa (`409`) lẫn trang chỉnh sửa/trang chi tiết; quyền truy cập và sở hữu kiểm tra trước đọc body (`401` Guest, `403` sai vai trò, `404` không tồn tại/không sở hữu kể cả Admin khác và `Trip member`).
- [x] Bấm lưu mở hộp thoại xác nhận tóm tắt diff thay đổi, chỉ gọi Apply với `confirmed: true` và `Idempotency-Key` sau khi người dùng xác nhận; `UNKNOWN` khóa sửa/đóng để thử lại đúng khóa và payload; Hủy hoặc rời trang khi có thay đổi chưa lưu giữ nguyên `Saved itinerary` và không phát sinh API ghi.
- [x] Kiểm thử hành vi ở cả 2 seam (API/service với fake provider + Client/Workspace state và SSR/CSS responsive `360px`+), typecheck đều PASS (Next.js production build & live browser visual verification chạy tại Ticket 09).
