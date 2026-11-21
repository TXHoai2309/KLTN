# 04: Tư vấn đổi / thêm địa điểm thông minh (Destination option) & Xử lý điểm danh mục bị ẩn (HIDDEN)

**What to build:** Khi chủ chuyến muốn đổi một điểm trong lịch hoặc tìm điểm thêm vào khoảng trống mà chưa nêu tên một điểm cụ thể duy nhất (như *"Tôi muốn đổi địa điểm này sang chỗ khác hợp hơn"*, *"Chiều Ngày 2 còn trống nên đi đâu?"*), hoặc khi trong chuyến đi có điểm đến danh mục vừa bị quản trị viên ẩn (`HIDDEN`), `Trợ lý chuyến đi` lọc và xếp hạng tối đa 3 `lựa chọn điểm đến` (`Destination option`) từ danh mục công khai (`VISIBLE`) của KLTN khớp nhất với khu vực địa lý của ngày đó, khung giờ mở cửa, quỹ thời gian và điều kiện ngoài trời/thời tiết. Server mô phỏng sẵn kết quả thay thế hoặc chèn từng điểm, giải thích tự nhiên vì sao từng điểm phù hợp và hiển thị thẻ bấm 1 chạm để người dùng thay thế hoặc thêm ngay vào `bản nháp chỉnh sửa` (đồng thời vẫn bảo toàn đầy đủ khả năng giữ, đổi giờ, đổi thứ tự hoặc xóa các địa điểm ngoài danh mục `ExternalPlace` đã có sẵn trong chuyến).

**Blocked by:** 02: Kiến trúc AI 2 bước (Grounded Advisory Composer + Fact Guard) & Thẻ Gợi ý chỉnh sửa từ tư vấn áp dụng 1 chạm.

**Status:** done

- [x] Khi người dùng yêu cầu đổi hoặc thêm điểm mà chưa chỉ định duy nhất một điểm công khai hợp lệ, server chọn và xếp hạng tối đa 3 `lựa chọn điểm đến` (`Destination option`) đều thuộc danh mục `VISIBLE` của KLTN (chưa nằm trong `bản nháp chỉnh sửa`), ưu tiên theo khu vực địa lý cùng ngày, khung giờ mở cửa khớp thời điểm dự kiến, thời lượng gợi ý và yếu tố trong nhà/ngoài trời theo thời tiết.
- [x] Tuyệt đối không gợi ý điểm `HIDDEN`, điểm đã xóa mềm hoặc ID ngoài danh mục KLTN làm điểm thêm mới/thay thế; mọi ID không hợp lệ từ đầu ra mô hình đều bị bộ xác minh phía server loại bỏ.
- [x] Câu trả lời của AI giải thích ngắn gọn, tự nhiên lý do gợi ý từng điểm (khu vực, thời lượng gợi ý, giờ mở cửa/đặc điểm phù hợp) kèm các thẻ lựa chọn để người dùng bấm chọn trực tiếp hoặc gõ tên/số thứ tự trong chat.
- [x] Khi người dùng bấm chọn một thẻ `lựa chọn điểm đến`, hệ thống thực hiện thay thế hoặc chèn điểm đó vào đúng vị trí/ngày trong `bản nháp chỉnh sửa` với giờ bắt đầu nối tiếp hợp lý và thời lượng gợi ý, chạy `kiểm tra tính hợp lệ` và đẩy vào ngăn xếp `Undo/Redo`.
- [x] Khi trong `bản nháp chỉnh sửa` có điểm danh mục đã bị quản trị viên ẩn (`HIDDEN`), Trợ lý AI và giao diện chỉ rõ tên điểm không còn khả dụng, hỗ trợ gợi ý tới 3 điểm công khai cùng khu vực để thay thế hoặc xóa nhanh điểm bị ẩn trước khi lưu.
- [x] Các chuyến đi có sẵn địa điểm ngoài danh mục (`ExternalPlace`) tiếp tục mở, nhận tư vấn, đổi giờ, đổi thứ tự hoặc xóa bình thường trong `Trợ lý chuyến đi` kèm cơ chế xác nhận `acknowledgedUnchecked` khi lưu.
- [x] Kiểm thử tự động ở Seam 1 (xếp hạng `Destination option`, chặn ID giả/điểm `HIDDEN`, xử lý thay thế điểm `HIDDEN` và bảo toàn `ExternalPlace`) và Seam 2 (thẻ chọn điểm 1 chạm trên UI) đều PASS.
