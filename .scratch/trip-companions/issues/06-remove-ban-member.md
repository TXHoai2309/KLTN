# 06: Chủ chuyến loại và chặn thành viên

**What to build:** Host xem danh sách thành viên, loại một người và chặn tài khoản đó tham gia lại; nhóm còn lại tiếp tục hoạt động.

**Blocked by:** TC-03 — Tham gia ngay và mở lịch của nhóm

**Status:** ready-for-agent

**Approval:** Owner approved the unchanged 11-ticket breakdown and blocking edges on 2026-10-28. Implementation has not started.

**Source:** Approved travel-companions plan Q10, Q11; single-owner decision ADR-23; current domain glossary and approved UI/UX scope.

**BE part:** Thao tác host-only nguyên tử trên membership/chỗ, cấm target host, lưu trạng thái chặn bền và áp dụng ở join/reader/writer. Không thêm quyền Admin đọc riêng.

**FE part:** Danh sách thành viên theo quyền, hành động loại/chặn chỉ cho host, giải thích hậu quả và view mất quyền ở tài khoản bị loại.

- [ ] Chỉ host loại/chặn thành viên khác; người ngoài, member và Admin không sở hữu không có quyền đặc biệt.
- [ ] Tài khoản bị loại mất quyền nhóm và không tạo membership khác hoặc dùng retry/rejoin để vượt chặn.
- [ ] Trả chỗ đúng một lần và giữ lịch sử quan hệ/tin nhóm; host không tự loại mình hoặc chuyển chủ qua thao tác này.
- [ ] Join/loại đồng thời và retry UNKNOWN giữ được trạng thái đúng, không âm thầm tự gỡ chặn.
- [ ] Có kiểm tra hai/ba actor qua service/route và UI phản ánh mất quyền; không mở rộng sang CMS báo cáo, DM hoặc gỡ chặn chưa được yêu cầu.

**Demo / verification:** Host loại một thành viên; người đó không đọc/nhắn/join lại được; người khác vẫn dùng nhóm.

**Completion:** This vertical ticket is complete only when BE, FE and integration evidence are recorded. Completing one role does not complete this ticket. Application implementation has not started.

**BE evidence:** NOT STARTED.

**FE evidence:** NOT STARTED.

**Integration evidence:** NOT RUN.

