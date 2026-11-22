# 06: Chỉnh lịch và hỗ trợ khi đang đi qua provider hiện hành

**What to build:** Trip owner chỉnh lịch thường/AI, đổi chặng đi/về hoặc dùng in-trip preview; các thao tác cần tuyến mới dùng provider đang bật và tiếp tục xác nhận/lưu theo quy tắc hiện có.

**Blocked by:** 05 — Lưu, mở lại chuyến đi và giữ dữ liệu khi đổi cờ.

**Status:** IN PROGRESS — chủ dự án yêu cầu triển khai toàn bộ ngày 2026-11-18; code local và automated verification hoàn tất, live acceptance còn mở.

- [ ] Inventory và chuyển mọi đường gọi routing trong chỉnh sửa thường/AI, journey edit/replan và hỗ trợ khi đang đi sang bộ chọn chung; không còn đường gọi Stadia trực tiếp ngoài adapter đã chọn.
- [ ] Preview hiển thị tuyến/marker bằng renderer tương ứng, giữ phân biệt proposal change confirmation với trip save confirmation.
- [ ] Chỉ thao tác hiện cần bằng chứng mới mới gọi route; mở màn hình/đổi cờ không tự ghi lịch trình.
- [ ] Giữ ràng buộc CAR/MOTORCYCLE, chặng về cùng nơi xuất phát, nghỉ dọc đường, Validator và phạm vi edit hiện có; không mở hỗ trợ edit external-place nếu trước đó bị chặn.
- [ ] Thiếu route vẫn insufficient, không fallback provider/phương tiện và không cho AI chứng nhận PASS.
- [ ] Write giữ ownership, revision/concurrency và idempotency hiện hành; thất bại không được trình bày thành đã lưu.
- [ ] Test qua các API/service/UI preview hiện có với Google/Stadia, thay cờ giữa lần đọc và lần chỉnh, lỗi provider và non-owner; bản đồ lỗi không làm mất lịch trình.

**Local evidence (2026-11-18):** Code đã triển khai và review hai trục; provider/map/Save/Read regression tests qua, production webpack build/typecheck qua. Full suite còn các lỗi nền được phân biệt trong verification receipt. Các checkbox yêu cầu browser/provider thật chưa được tự đóng vì thiếu Google keys/Map ID; đây không phải live acceptance.
