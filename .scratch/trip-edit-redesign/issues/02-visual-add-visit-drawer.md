# 02: Ngăn Thêm điểm đến trực quan (Drawer tìm kiếm, giờ mở cửa & gợi ý giờ/thời lượng)

**What to build:** Người dùng bấm nút `+ Thêm điểm dừng` ở cuối (hoặc trên) từng ngày để mở ngăn chọn điểm đến công khai trực quan thay cho form `<select>` cũ. Ngăn này cho phép tìm kiếm theo tên, lọc theo khu vực hoặc danh sách Yêu thích, xem ảnh, giờ mở cửa đúng thứ của ngày đang chọn và thời lượng tham quan gợi ý; khi bấm chọn một điểm, hệ thống tự điền sẵn thời lượng gợi ý và tính sẵn giờ bắt đầu nối tiếp điểm trước đó trong ngày rồi thêm vào `Edit draft` và cập nhật bản đồ ngay.

**Blocked by:** 01 — Khung Workspace Timeline + Bản đồ, Edit draft thống nhất, bỏ trần 4 lượt/ngày & Hộp thoại Lưu

**Status:** done

- [x] Mỗi ngày trong timeline đều có nút `+ Thêm điểm dừng` rõ ràng; mở ngăn chọn điểm bằng cả chuột và bàn phím, đóng được bằng nút đóng hoặc `Escape` và trả focus về nút mở.
- [x] Ngăn chọn điểm chỉ tải các điểm đến công khai đang `VISIBLE` qua API công khai hiện có, hỗ trợ tìm theo từ khóa, lọc theo khu vực và lọc các điểm đã yêu thích của chủ chuyến, có đủ trạng thái loading, rỗng và lỗi có thể thử lại.
- [x] Mỗi thẻ điểm gợi ý hiển thị tên, khu vực, ảnh (hoặc fallback chuẩn hệ thống), giờ mở cửa tương ứng ngày lịch của ngày đang chọn và thời lượng gợi ý/tối thiểu.
- [x] Khi chọn điểm để thêm vào ngày mục tiêu, hệ thống tự điền thời lượng gợi ý (hoặc mức an toàn hợp lệ nếu điểm chưa có gợi ý) và đề xuất giờ bắt đầu hợp lý sau điểm liền trước (người dùng vẫn chỉnh lại được giờ/thời lượng trước khi xác nhận thêm).
- [x] Thêm điểm mới cập nhật vào `Edit draft` (tạo một bước trong lịch sử `Undo/Redo`), đánh dấu có thay đổi chưa lưu, hiển thị điểm mới trên bản đồ và đồng bộ kiểm tra/lưu như các thao tác chỉnh tay khác.
- [x] Kiểm thử hành vi chọn, tự điền giờ/thời lượng, hủy/đóng Drawer, tìm kiếm/lọc rỗng-lỗi (qua `add-visit-helper`, `trip-edit-page-meta`, `edit-workspace-ui`, `tsc`) đều PASS; kiểm tra tương tác trình duyệt `360px` thực hiện thêm tại Ticket 09.
