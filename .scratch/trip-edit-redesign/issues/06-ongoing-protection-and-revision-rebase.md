# 06: Bảo vệ lượt đã qua giờ khi ONGOING & Cơ chế Rebase khi gặp xung đột 409

**What to build:** Khi chủ chuyến chỉnh sửa một chuyến đi đang diễn ra (`ONGOING`), các `Scheduled visit` đã qua giờ kết thúc (theo `Asia/Ho_Chi_Minh`) được đánh dấu là đã hoàn tất và bị khóa cố định trên cả giao diện lẫn server (không cho xóa, đổi giờ, đổi thứ tự, chuyển ngày hoặc bị dồn giờ tự động), đồng thời phần `Trip origin` và giờ khởi hành bị khóa sau mốc khởi hành; các lượt và ngày còn lại vẫn chỉnh sửa bình thường. Ngoài ra, khi Preview hoặc Apply gặp lỗi xung đột phiên bản (`409 TRIP_REVISION_CONFLICT`) do chuyến bị sửa ở tab/luồng khác, giao diện giữ nguyên toàn bộ `Edit draft`, nạp phiên bản `Saved itinerary` mới nhất và cho người dùng chọn Rebase bản nháp lên phiên bản mới để kiểm tra lại hoặc bỏ nháp tải lại.

**Blocked by:** 01 — Khung Workspace Timeline + Bản đồ, Edit draft thống nhất, bỏ trần 4 lượt/ngày & Hộp thoại Lưu; 04 — Tích hợp chỉnh Trip origin & giờ đi/về (journeySnapshot) trong Workspace

**Status:** done

- [x] Với chuyến `ONGOING`, hệ thống xác định tập lượt đã hoàn tất theo đồng hồ `Asia/Ho_Chi_Minh` phía server và đánh dấu khóa trực quan ngay trên thẻ tương ứng trong Workspace (vô hiệu hóa nút sửa/xóa/di chuyển và loại trừ khỏi thao tác tự dời giờ dây chuyền).
- [x] Mọi yêu cầu Preview hoặc Apply cố tình thay đổi lượt đã qua giờ khi `ONGOING` (hoặc thay đổi `Trip origin`/giờ khởi hành sau mốc cutoff) đều bị server từ chối rõ ràng với mã lỗi nghiệp vụ phù hợp (`422` / `409`), không ghi DB.
- [x] Các `Scheduled visit` chưa qua giờ (trong phần còn lại của ngày hôm nay và các ngày sau) của chuyến `ONGOING` vẫn chỉnh sửa, kiểm tra và lưu được bình thường.
- [x] Khi Preview hoặc Apply nhận `409 TRIP_REVISION_CONFLICT`, `Edit draft` không bị xóa mất; client nạp snapshot mới nhất (`latestBaseline` và `latestRevision`) qua endpoint đọc sở hữu được bảo vệ quyền truy cập (không cache).
- [x] Giao diện hiện hộp thoại xử lý xung đột rõ ràng gồm tóm tắt tình huống và 2 lựa chọn: **Rebase bản nháp hiện tại lên phiên bản mới** (cập nhật `baseRevision` và baseline mới, giữ nguyên `workingDraft` — ngoại trừ các lượt nếu vừa bị khóa bởi `ONGOING` được báo rõ — rồi tự chạy Preview lại) hoặc **Bỏ nháp & dùng bản mới nhất** (khôi phục `workingDraft` và làm sạch Undo stack).
- [x] Kiểm thử seam service/API (mốc giờ `Asia/Ho_Chi_Minh`, bảo toàn lượt hoàn tất, khóa origin sau khởi hành) và seam Client (`409` Rebase vs Discard, bảo toàn `workingDraft`) đều PASS.
