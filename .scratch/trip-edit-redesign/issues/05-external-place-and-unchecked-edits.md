# 05: Hỗ trợ chỉnh sửa chuyến có địa điểm ngoài danh mục (ExternalPlace) & xác nhận uncheckedChecks

**What to build:** Các chuyến đi được tạo từ trợ lý chat có chứa địa điểm ngoài danh mục (`ExternalPlace`) không còn bị chặn lỗi 501 khi mở trang chỉnh sửa. Chủ chuyến xem được các điểm ngoài danh mục đang có (tuân thủ chính sách cache 30 ngày: quá hạn hiển thị nhãn chung và không dùng tọa độ cache cũ), được giữ nguyên, đổi giờ, đổi thứ tự hoặc xóa chúng trong `Edit draft`; khi Preview/Apply, server tự tính lại danh sách `uncheckedChecks` cho các điểm ngoài danh mục còn lại, yêu cầu chủ chuyến tick xác nhận lại trong hộp thoại Lưu (hoặc tự xóa sạch `uncheckedChecks` về rỗng nếu đã xóa hết điểm ngoài danh mục), trong khi vẫn chặn cứng mọi lỗi `VIOLATION` hoặc thiếu dữ liệu của tuyến đường/điểm catalog KLTN.

**Blocked by:** 01 — Khung Workspace Timeline + Bản đồ, Edit draft thống nhất, bỏ trần 4 lượt/ngày & Hộp thoại Lưu

**Status:** done

- [x] Mở trang `/trips/[id]/edit`, gọi Preview và gọi Apply với chuyến chứa `ExternalPlace` không bị từ chối bởi lỗi chưa hỗ trợ; trang chi tiết gỡ bỏ cảnh báo chặn sửa cho chủ chuyến sở hữu chuyến loại này.
- [x] Dữ liệu `ExternalPlace` đọc vào giao diện chỉnh sửa tôn trọng ranh giới cache 30 ngày của hệ thống (trong hạn hiển thị tên và tọa độ trên bản đồ; quá hạn 30 ngày hiển thị nhãn chung và không rò tọa độ cũ), đồng thời chưa thêm chức năng tìm/thêm mới Google Places từ màn hình chỉnh sửa.
- [x] Trong `Edit draft`, người dùng được đổi giờ, đổi thời lượng, đổi thứ tự lên/xuống, chuyển ngày và xóa các `Scheduled visit` trỏ tới `ExternalPlace`.
- [x] Preview phân tách rõ giữa lỗi chặn lưu (mọi `VIOLATION`, thiếu dữ liệu tuyến đường, thiếu dữ liệu điểm catalog KLTN) và danh sách mục chưa kiểm (`uncheckedItems`) thuộc về `ExternalPlace` còn trong bản nháp.
- [x] Khi vẫn còn `ExternalPlace` chưa kiểm được, hộp thoại Xác nhận Lưu hiển thị danh sách mục chưa kiểm và checkbox xác nhận bắt buộc; server kiểm tra `acknowledgedUnchecked` khớp đúng danh sách tự tính (đưa vào hash idempotency), lưu `uncheckedChecks` + `uncheckedConfirmedAt` nguyên tử, và nếu người dùng đã xóa hết `ExternalPlace` thì xóa sạch `uncheckedChecks` về null mà không đòi checkbox.
- [x] Kiểm thử seam API/service (`ExternalPlace` giữ/xóa/đổi giờ, `acknowledgedUnchecked` khớp/lệch/thiếu, chặn lỗi route/catalog KLTN) và giao diện hộp thoại Lưu (`edit-unchecked`, `trips-view-unchecked`, `edit-workspace-ui`, `tsc`) đều PASS (bài test replay idempotency và tương tác end-to-end tiếp tục kiểm định bổ sung tại Ticket 09).
