# 04: Tích hợp chỉnh Trip origin & giờ đi/về (journeySnapshot) trong Workspace

**What to build:** Chủ chuyến có thể xem và chỉnh sửa `Trip origin`, giờ khởi hành Ngày 1 và hạn về ngày cuối (hoặc bấm *"Bổ sung nơi xuất phát"* cho chuyến cũ chưa có) ngay trên đầu Ngày 1 và cuối Ngày cuối của Workspace chỉnh sửa mà không phải quay lại modal ở trang chi tiết. Thay đổi `Trip origin` hay giờ đi/về không tự ghi đè giờ các `Scheduled visit` đã chỉnh tay mà chỉ kiểm tra hai chặng biên trong `Itinerary validation` (kèm nút chủ động *"Tự xếp lại giờ theo lộ trình xuất phát"*); khi lưu, hệ thống tính lại và cập nhật nguyên tử cả `visits` lẫn `journeySnapshot` (`visitFingerprint`, chặng đi/về, `Roadside rest allowance`), đồng thời nhắc chủ chuyến nếu chuyến có `Companion invitation` mà không làm lộ tọa độ/địa chỉ riêng tư ra thông báo nhóm.

**Blocked by:** 01 — Khung Workspace Timeline + Bản đồ, Edit draft thống nhất, bỏ trần 4 lượt/ngày & Hộp thoại Lưu

**Status:** done

- [x] Với chuyến chưa khởi hành, đầu Ngày 1 và cuối Ngày cuối hiển thị thẻ `Trip origin` và giờ đi/về (hoặc nút *"Bổ sung nơi xuất phát"* đối với chuyến cũ); tái sử dụng bộ chọn vị trí/tìm kiếm/xác nhận phạm vi Việt Nam và quy tắc giờ theo `Asia/Ho_Chi_Minh`.
- [x] Đổi `Trip origin`, giờ khởi hành hoặc hạn về cập nhật vào `Edit draft` (hỗ trợ `Undo/Redo`), giữ nguyên giờ bắt đầu của các `Scheduled visit` hiện có, và chạy kiểm tra lại hai chặng biên (`Origin → Điểm đầu`, `Điểm cuối → Origin`), `Roadside rest allowance`, hạn về và quy tắc không lái xuyên đêm.
- [x] Cung cấp thao tác chủ động *"Tự xếp lại giờ theo lộ trình xuất phát"* để tính lại khung giờ tham quan theo điểm xuất phát khi người dùng muốn; các chuyến cũ vẫn sửa điểm dừng bình thường mà không bị ép phải nhập `Trip origin`.
- [x] Preview và Apply xử lý nhất quán `journeySnapshot`: tính lại plan và `visitFingerprint` bằng cùng cấu hình routing với Planner/Detail, và trong transaction của Apply cập nhật nguyên tử đồng thời `ItineraryDay`/`ItineraryVisit` và `journeySnapshot` (chỉ áp dụng sau xác nhận và revalidation ngoài transaction).
- [x] Nếu chuyến đi đang có `Companion invitation`, hộp thoại xác nhận Lưu hiển thị dòng nhắc rằng thay đổi sẽ gửi thông báo tới nhóm đồng hành; thông báo hệ thống lưu vào nhóm tuyệt đối không chứa tên, địa chỉ, tọa độ hay quãng đường lộ vị trí xuất phát riêng tư.
- [x] Kiểm thử seam service/API (tính lại `journeySnapshot`, legacy opt-in, privacy thông báo nhóm, atomic commit/rollback) và UI editor trên Workspace (`edit-journey`, `edit-workspace-ui`, `tsc`) đều PASS.
