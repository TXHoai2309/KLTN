# US-35 Task285 — checklist browser do Bình chạy

**Tình trạng hiện tại: NOT PROVEN cho tất cả mục bên dưới.** Chưa có UI/caller nối helper GPS → location-flow → normalizer và picker vào trang in-trip. Test kết hợp dùng fake geolocation và test-only caller không thay thế acceptance browser. Không tick PASS từ unit test hoặc ảnh fixture Task283.

## Điều kiện chạy

- [ ] Có màn/test surface được duyệt nối các module thật, trên HTTPS hoặc localhost; không tự dựng endpoint, mock Trip/Validator hay thêm route product chỉ để tick checklist. Nếu chưa có, ghi BLOCKED / NOT PROVEN.
- [ ] Ghi branch/commit, ngày chạy, browser/version, OS, thiết bị/viewport và tên người chạy. Dùng tài khoản/Trip test khi owned flow đã có; không dùng dữ liệu người khác.
- [ ] Chỉ chụp/ghi kết quả trạng thái, tránh đưa tọa độ GPS thật vào ảnh/log/ticket chia sẻ. Không yêu cầu tester gửi vị trí cá nhân.

## Xin quyền thật và GPS thành công — NOT PROVEN

- [ ] Reset quyền location của site thành Ask. Mở/reload màn: chưa bấm nút thì không có prompt, không tự lấy vị trí.
- [ ] Dùng Tab đến nút lấy GPS rồi Enter/Space (hoặc bấm). Chỉ lúc này xuất hiện yêu cầu quyền. Chọn Allow.
- [ ] Khi browser trả vị trí, UI báo có kết quả GPS; caller chuyển đúng sang `gps_ok`, giữ latitude/longitude/accuracy và chuyển timestamp milliseconds sang ISO tường minh trước normalizer.
- [ ] Sau chuẩn hóa, tọa độ làm tròn 5 chữ số thập phân. Không có thông báo đã lưu Trip/vị trí, không tự áp itinerary.
- [ ] GPS thành công vẫn có đường chuyển sang thủ công; kết quả GPS đến muộn không ghi đè lựa chọn manual mới. Không liên tục xin lại quyền/tracking khi đứng yên hoặc khi quay lại màn.

## Từ chối quyền thật và fallback — NOT PROVEN

- [ ] Reset permission về Ask, tải lại rồi bấm lấy GPS và chọn Block. UI hiển thị denied bằng tiếng Việt trung tính, có lựa chọn manual và retry.
- [ ] Chọn manual: không coi denied/manual mode là đã có tọa độ. Nhập cặp hợp lệ hoặc chọn pin rồi xác nhận mới có lựa chọn.
- [ ] Retry là thao tác rõ ràng của user. Với site đang bị Block, browser có thể trả denied ngay mà không hiện prompt lại; UI vẫn cho manual, không đổ lỗi người dùng hoặc hứa đã đổi quyền.
- [ ] Nếu kiểm thử được unavailable/timeout: ghi cách gây lỗi. Hết thời gian chờ vẫn chọn thủ công được, không giả GPS OK. Nếu không tái hiện, giữ NOT PROVEN riêng từng trạng thái.

## Manual chưa đủ cụ thể và bàn phím — NOT PROVEN

Tiêu chí Task285 do Bình chốt: **chưa có cặp tọa độ hợp lệ**. Tên tỉnh/chữ không thay thế cặp số; không geocode hoặc gán tâm Hà Giang mặc định.

- [ ] Chỉ nhập “Hà Giang”/chữ, bỏ trống cả hai ô hoặc chỉ nhập một trục: bị từ chối; focus ô sai đầu tiên, lỗi gắn đúng ô. Không phát callback với tọa độ mặc định.
- [ ] Nhập NaN/chữ hoặc vĩ độ ngoài [-90,90]/kinh độ ngoài [-180,180]: không chấp nhận. Không tự clamp để biến input sai thành đúng.
- [ ] Nhập đủ cặp hợp lệ bằng bàn phím; Tab/Shift+Tab đi qua label/input/action hợp lý, Enter hoặc “Dùng tọa độ” chọn đúng. UI status cập nhật; thử screen reader để kiểm thông báo lỗi/live status nếu có công cụ.
- [ ] Khi map lỗi hoặc timeout, hai ô vẫn dùng được, nút retry không xóa lựa chọn hợp lệ. Với map sẵn sàng, focus pin và phím mũi tên điều chỉnh được.
- [ ] Không coi cặp hợp lệ là xác nhận ở Hà Giang/đủ mới/đủ chính xác hoặc itinerary PASS. Policy vùng/freshness vẫn chờ owner.

## Responsive 360px và dữ liệu riêng — NOT PROVEN

- [ ] Viewport rộng 360px: thử loading/error/timeout, input invalid dài và lựa chọn hợp lệ; không tràn ngang, nội dung/nút không bị cắt, focus nhìn thấy.
- [ ] Thử light/dark và desktop; lỗi/label/help đủ đọc. Thử zoom 200% nếu điều kiện cho phép, ghi kết quả riêng.
- [ ] Quan sát URL/history, Application storage/cookie, console và network trên surface test: không xuất hiện tọa độ do in-trip code ghi vào storage/cookie/URL/log; không gọi theo dõi liên tục. Đối chiếu baseline của app để tách dữ liệu auth có sẵn; không copy giá trị GPS thật ra báo cáo.
- [ ] Rời màn/đổi theme/retry map: không có map/session hoặc callback cũ tác động UI mới. Không coi source-audit regex là chứng minh runtime mọi dependency không rò rỉ.

## Ghi nhận kết quả

| Nhóm | Người/ngày/browser/viewport | Kết quả thực tế / evidence không chứa vị trí thật |
| --- | --- | --- |
| GPS Allow thật, chỉ sau user gesture | Chưa chạy | NOT PROVEN |
| GPS Block thật, manual/retry | Chưa chạy | NOT PROVEN |
| GPS unavailable/timeout trên browser | Chưa chạy | NOT PROVEN |
| Manual chữ/thiếu cặp bị từ chối, cặp hợp lệ được chọn | Chưa chạy | NOT PROVEN |
| Keyboard/focus/screen reader | Chưa chạy | NOT PROVEN |
| 360px/light/dark/desktop | Chưa chạy | NOT PROVEN |
| Runtime privacy/lifecycle | Chưa chạy | NOT PROVEN |

Chỉ Bình/người chạy mới đổi ô trạng thái dựa trên lần chạy thực tế; ghi rõ BLOCKED/FAIL nếu không thể chạy hoặc kết quả sai. Checklist này không tự đánh dấu story READY/DONE.
