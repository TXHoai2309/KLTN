# 03: Kiểm tra 2 tầng (0ms + debounce), Tự dời giờ dây chuyền, Nhãn chặng & Thời tiết

**What to build:** Khi người dùng sửa đổi `Edit draft`, giao diện phản hồi kiểm tra theo hai tầng: kiểm tra tức thì 0ms tại trình duyệt cho lỗi định dạng, vượt quá `24:00` hoặc trùng khoảng giờ trong ngày, và tự động debounce gọi `Itinerary validation` lên server để hiển thị nhãn chặng di chuyển (thời gian/quãng đường) cùng nhãn vi phạm/thiếu dữ liệu gắn trực tiếp lên từng thẻ `Scheduled visit` và chặng tương ứng. Người dùng có thể bật/tắt tùy chọn "Tự động dời giờ các điểm sau" trong ngày, xem khối `Weather advisory` thu gọn mang tính tham khảo (ADR-36), và thấy cảnh báo rõ kèm nút thay thế/xóa nhanh nếu chuyến có điểm catalog đã bị Admin ẩn (`OQ-B`).

**Blocked by:** 01 — Khung Workspace Timeline + Bản đồ, Edit draft thống nhất, bỏ trần 4 lượt/ngày & Hộp thoại Lưu

**Status:** done

- [x] Thay đổi giờ, thời lượng hoặc thứ tự ngay lập tức hiển thị gợi ý cảnh báo 0ms trên thẻ liên quan nếu xảy ra chồng lấn thời gian hoặc dưới thời lượng tối thiểu đã biết (không cần chờ server).
- [x] Khi bật tùy chọn "Tự động dời giờ các điểm sau", thêm điểm, đổi thứ tự hoặc tăng thời lượng một lượt sẽ tự đẩy giờ bắt đầu các lượt phía sau trong cùng ngày theo khoảng cách di chuyển gần nhất đã biết; nếu đẩy vượt quá `23:59`, giữ nguyên ranh giới trong ngày và hiện cảnh báo rõ, tuyệt đối không tự đẩy sang ngày khác.
- [x] Sau khi người dùng ngừng thao tác khoảng ~800ms, client tự động gọi Preview một lần với sequence guard để loại bỏ phản hồi trễ; nút Lưu luôn khóa trong lúc đang kiểm tra hoặc khi bản nháp chưa khớp lần kiểm tra đạt gần nhất, và khi lỗi mạng/timeout có nút "Kiểm tra lại" thủ công.
- [x] Kết quả `Itinerary validation` từ server ánh xạ thành nhãn trạng thái trực tiếp trên đúng thẻ `Scheduled visit` (giờ mở cửa, thời lượng tối thiểu, xung đột) và trên nhãn chặng giữa hai điểm (thời gian/quãng đường, vi phạm di chuyển hoặc `INSUFFICIENT_DATA`), kèm tóm tắt ở cột phải có thể bấm nhảy tới điểm lỗi.
- [x] Các điểm catalog đã bị ẩn (`HIDDEN` hoặc đã xóa mềm) hiện nhãn cảnh báo đỏ nổi bật trực tiếp trên thẻ kèm nút xóa/thay thế nhanh và tiếp tục chặn Lưu cho tới khi được xử lý.
- [x] Khối `Weather advisory` và giờ mặt trời hiển thị gọn mang tính tham khảo trên không gian chỉnh sửa theo ADR-36, tuyệt đối không làm thay đổi điều kiện bật/tắt nút Lưu.
- [x] Kiểm thử hành vi cho auto-shift, hủy phản hồi cũ (race condition), ánh xạ finding theo `visitId`/chặng, điểm ẩn và `INSUFFICIENT_DATA` (`edit-workspace-checks`, `edit-preview-state`, `edit-workspace-ui`, `tsc`) đều PASS.
