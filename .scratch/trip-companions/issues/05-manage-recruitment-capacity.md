# 05: Quản lý số chỗ, đóng tuyển và gỡ công khai

**What to build:** Host chỉnh phần giới thiệu/số chỗ, đóng hoặc mở lại tuyển người, gỡ hoặc công khai lại bài mà vẫn giữ nhóm.

**Blocked by:** TC-03 — Tham gia ngay và mở lịch của nhóm

**Status:** ready-for-agent

**Approval:** Owner approved the unchanged 11-ticket breakdown and blocking edges on 2026-10-28. Implementation has not started.

**Source:** Approved travel-companions plan Q5, Q7, Q12, Q16; single-owner decision ADR-23; current domain glossary and approved UI/UX scope.

**BE part:** Mutation host-only, capacity không dưới số đang tham gia, tách visibility/manual recruitment/full/điều kiện ngày, bảo toàn một bài/một nhóm và kiểm tra đồng thời với join.

**FE part:** Khu vực quản lý host với số liệu đúng, form sửa, hành động đóng/mở/gỡ/đăng lại, lý do không thể mở và phản hồi ghi xác nhận.

- [ ] Không giảm số chỗ dưới số tài khoản đang tham gia; tăng/giảm cạnh tranh với join không làm quá chỗ.
- [ ] Đóng tuyển và gỡ công khai dừng người mới vào; thành viên hiện hành giữ quyền nhóm, không tạo nhóm khác khi mở/đăng lại.
- [ ] Chỉ mở/đăng lại trước ngày đi và khi chuyến chưa hoàn tất/hủy, đáp ứng các điều kiện nguồn.
- [ ] Đủ chỗ là trạng thái từ số thành viên, không tự ghi thành đóng tuyển thủ công. Host và thành viên thấy đúng quyền/hành động.
- [ ] Mutation có quyền, idempotency, xung đột và UI pending/FAILED/UNKNOWN được kiểm tra; không dùng một công tắc cho cả đóng tuyển và hủy.

**Demo / verification:** Host đóng tuyển rồi gỡ bài; thành viên vẫn xem nhóm nhưng người mới không join được; host mở lại khi còn đủ điều kiện.

**Completion:** This vertical ticket is complete only when BE, FE and integration evidence are recorded. Completing one role does not complete this ticket. Application implementation has not started.

**BE evidence:** NOT STARTED.

**FE evidence:** NOT STARTED.

**Integration evidence:** NOT RUN.

