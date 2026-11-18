# 02: Chọn tọa độ Admin và nơi xuất phát trên cả hai bản đồ

**What to build:** Admin chọn tọa độ điểm đến và Traveler đặt pin nơi xuất phát trên bản đồ đang bật, tiếp tục xác nhận/lưu qua các luồng hiện có.

**Blocked by:** 01 — Explore dùng Google/Stadia qua cấu hình chung.

**Status:** IN PROGRESS — chủ dự án yêu cầu triển khai toàn bộ ngày 2026-11-18; code local và kiểm thử đang hoàn tất, live acceptance còn mở.

- [ ] Cả picker tọa độ Admin và picker nơi xuất phát dùng cùng lựa chọn provider với Explore; Google dùng Maps JavaScript, Stadia giữ MapLibre.
- [ ] Pin khởi tạo, click/drag tọa độ, cập nhật form và thao tác xác nhận hoạt động theo hợp đồng hiện tại; không đảo lat/lng, không tự xác nhận thay người dùng.
- [ ] Chọn pin thủ công vẫn dùng được khi tìm địa chỉ lỗi; thiếu tọa độ và lỗi SDK hiển thị trạng thái hiện hành, không tự gọi nhà cung cấp khác.
- [ ] Giữ phân quyền ghi Admin, ownership nơi xuất phát, server validation tọa độ và hợp đồng mutation/idempotency hiện có.
- [ ] Theme/retry/unmount không nhân đôi marker hoặc listener; giữ attribution, keyboard access và thao tác trên màn hình nhỏ.
- [ ] Kiểm thử qua form/picker và API/service hiện có với hai chế độ; có smoke checklist chọn pin và lưu tọa độ, ghi rõ bằng chứng browser chưa chạy nếu thiếu key.
