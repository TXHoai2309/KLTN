# 07: Hiển thị tuyến đồng hành đúng nguồn và đúng quyền

**What to build:** Guest xem giới thiệu công khai và thành viên xem lịch nhóm với bản đồ đang chọn, nhận dữ liệu tuyến đúng nguồn và đúng mức riêng tư.

**Blocked by:** 05 — Lưu, mở lại chuyến đi và giữ dữ liệu khi đổi cờ.

**Status:** IN PROGRESS — chủ dự án yêu cầu triển khai toàn bộ ngày 2026-11-18; code local và automated verification hoàn tất, live acceptance còn mở.

- [ ] Giới thiệu công khai và lịch nhóm dùng chung renderer đã hỗ trợ hai provider, không khởi tạo đồng thời cả hai SDK.
- [ ] Loại bỏ nguồn Stadia gán cứng trong companion projections; bảo toàn provenance thực có hoặc trạng thái nguồn không biết, không đoán theo cờ.
- [ ] Giữ public summary/membership permissions, origin privacy và giới hạn external-place hiện có; Admin không có bypass đọc riêng.
- [ ] Không gọi routing hay ghi lại trip khi người dùng mở giới thiệu/lịch nhóm hoặc khi cờ thay đổi.
- [ ] Trip cũ và trip Google vẫn đọc được sau khi chuyển Stadia; xử lý overlay lịch sử theo giới hạn đã xác minh ở luồng Read, không tự fetch nhà cung cấp kia.
- [ ] Test projection/API đọc và browser map contract cho Guest/member/non-member ở cả hai chế độ; lỗi map giữ phần giới thiệu/lịch được phép đọc.

**Local evidence (2026-11-18):** Code đã triển khai và review hai trục; provider/map/Save/Read regression tests qua, production webpack build/typecheck qua. Full suite còn các lỗi nền được phân biệt trong verification receipt. Các checkbox yêu cầu browser/provider thật chưa được tự đóng vì thiếu Google keys/Map ID; đây không phải live acceptance.
