# 04: Tự rời nhóm và trả chỗ

**What to build:** Thành viên tự rời nhóm, mất quyền nhóm và trả chỗ; có thể tham gia lại khi vẫn đủ điều kiện.

**Blocked by:** TC-03 — Tham gia ngay và mở lịch của nhóm

**Status:** ready-for-agent

**Approval:** Owner approved the unchanged 11-ticket breakdown and blocking edges on 2026-10-28. Implementation has not started.

**Source:** Approved travel-companions plan Q5, Q7, Q11; single-owner decision ADR-23; current domain glossary and approved UI/UX scope.

**BE part:** Rời idempotent, thu hồi membership ở mọi reader/writer, trả chỗ nguyên tử, giữ lịch sử quan hệ và không biến hết chỗ thành cờ đóng tuyển của host.

**FE part:** Hành động rời có giải thích hậu quả, trạng thái ghi/UNKNOWN, xóa dữ liệu riêng khỏi view khi mất quyền, đồng bộ Tôi tham gia/số chỗ và quay về giới thiệu phù hợp.

- [ ] Rời thành công thu hồi quyền đọc lịch riêng và mọi quyền nhóm ở request kế tiếp; không chỉ ẩn nút trên client.
- [ ] Chỗ được trả đúng một lần; chỉ nhận người mới nếu bài còn public, host chưa đóng tuyển và chưa đến ngày đi.
- [ ] Tự rời có thể vào lại khi còn đủ điều kiện; trạng thái bị chặn không được lợi dụng cùng luồng này để vào lại.
- [ ] Không xóa lịch sử tham gia hoặc nội dung nhóm; khi chat được bổ sung, tin đã gửi vẫn thuộc lịch sử nhóm.
- [ ] Host không tự rời như thành viên; không tạo thao tác đổi chủ chuyến. Bao phủ race join/leave, retry và UI clear-on-revocation.

**Demo / verification:** Một thành viên rời làm chỗ trống tăng một; mất quyền lịch riêng; vào lại được khi vẫn còn mở.

**Completion:** This vertical ticket is complete only when BE, FE and integration evidence are recorded. Completing one role does not complete this ticket. Application implementation has not started.

**BE evidence:** NOT STARTED.

**FE evidence:** NOT STARTED.

**Integration evidence:** NOT RUN.

