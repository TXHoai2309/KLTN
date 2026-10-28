# 03: Tham gia ngay và mở lịch của nhóm

**What to build:** Tài khoản đăng nhập bấm tham gia khi còn chỗ, nhận membership đã xác nhận, vào nhóm xem lịch mới nhất và tìm lại chuyến trong Tôi tham gia.

**Blocked by:** TC-02 — Khám phá và lọc chuyến công khai

**Status:** ready-for-agent

**Approval:** Owner approved the unchanged 11-ticket breakdown and blocking edges on 2026-10-28. Implementation has not started.

**Source:** Approved travel-companions plan Q1, Q2, Q4, Q5, Q7, Q12, Q14; single-owner decision ADR-23; current domain glossary and approved UI/UX scope.

**BE part:** Giữ chỗ/membership nguyên tử, quyền đọc lịch theo quan hệ hiện hành, host không chiếm chỗ, điều kiện ngày Việt Nam/role/status và chặn xóa Trip từng có thành viên ngay trong lát cắt này.

**FE part:** CTA theo quan hệ, login-return không tự join, Đang tham gia/Chưa xác nhận/Chỗ vừa hết/Đã tham gia, lối vào nhóm, lịch/tài khoản trong nhóm và Tôi tham gia.

- [ ] Mỗi tài khoản dùng một chỗ tìm thêm; host không dùng chỗ. Hai người tranh chỗ cuối chỉ một người thành công; retry không tạo membership hoặc chiếm chỗ trùng.
- [ ] Server kiểm tra bài còn công khai/còn tuyển, chưa đến ngày đi, chưa hủy/hoàn tất, account hợp lệ và không bị chặn tại thời điểm ghi.
- [ ] Guest đăng nhập quay lại đúng chuyến rồi tự bấm tham gia; không có yêu cầu/chờ duyệt hoặc tự phát lại write sau login.
- [ ] Thành viên hiện hành đọc được lịch chính thức mới nhất; người ngoài/Admin không phải thành viên không được đọc private DTO hoặc sửa lịch.
- [ ] Trip từng có thành viên bị chặn xóa ở service, kể cả khi mọi người về sau đã rời; ghi nhận từng tham gia không mất do tái tham gia hoặc xóa membership.
- [ ] Có kiểm tra transaction trên PostgreSQL cho tranh chỗ/retry/xóa, kiểm tra route isolation và UI từ join đến lịch nhóm/Tôi tham gia.

**Demo / verification:** Hai tài khoản cùng bấm chỗ cuối; tài khoản thắng xem lịch, tài khoản còn lại nhận hết chỗ; host không xóa được Trip đã có thành viên.

**Completion:** This vertical ticket is complete only when BE, FE and integration evidence are recorded. Completing one role does not complete this ticket. Application implementation has not started.

**BE evidence:** NOT STARTED.

**FE evidence:** NOT STARTED.

**Integration evidence:** NOT RUN.

