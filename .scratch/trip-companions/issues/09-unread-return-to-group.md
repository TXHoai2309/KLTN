# 09: Dấu chưa đọc và quay lại nhóm có tin mới

**What to build:** Tài khoản nhận biết nhóm nào có tin chưa đọc trong Tôi tham gia, mở đúng cuộc trò chuyện và cập nhật dấu đã đọc của riêng mình.

**Blocked by:** TC-08 — Cập nhật tin mới và phục hồi mất kết nối

**Status:** ready-for-agent

**Approval:** Owner approved the unchanged 11-ticket breakdown and blocking edges on 2026-10-28. Implementation has not started.

**Source:** Approved travel-companions plan Q15; single-owner decision ADR-23; current domain glossary and approved UI/UX scope.

**BE part:** Dấu mốc đọc theo actor/nhóm cho cả host, chỉ tăng theo cursor hợp lệ, số chưa đọc/summary từ dữ liệu authoritative và theo quyền hiện hành.

**FE part:** Badge có ngữ cảnh, lối mở chat từ Tôi tham gia/navigation phù hợp, cập nhật tổng hợp khoảng 15 giây khi web đang hiện và không tạo global inbox mới.

- [ ] Read marker của người này không đổi trạng thái người khác; không lùi cursor, nhận cursor giả tương lai hoặc ghi marker cho nhóm không có quyền.
- [ ] Số chưa đọc phản ánh tin thực, không dùng tổng số thành viên hoặc số chỗ; member mới đọc toàn bộ lịch sử nhưng không bị gán read receipt công khai.
- [ ] Mở đúng nhóm/tab và cập nhật marker theo phần đã hiển thị; không báo tất cả tin đã đọc chỉ vì background fetch.
- [ ] Logout/leave/kick làm mất summary riêng; trạng thái cũ không xuất hiện cho tài khoản khác.
- [ ] Có kiểm tra marker concurrency/authorization và UI badge/live status; không hứa thông báo khi web đã đóng, không có read receipt 'ai đã xem'.

**Demo / verification:** Một người gửi trong nhóm khác; người còn lại thấy badge đúng nhóm, mở chat và dấu chưa đọc được cập nhật chỉ cho tài khoản đó.

**Completion:** This vertical ticket is complete only when BE, FE and integration evidence are recorded. Completing one role does not complete this ticket. Application implementation has not started.

**BE evidence:** NOT STARTED.

**FE evidence:** NOT STARTED.

**Integration evidence:** NOT RUN.

