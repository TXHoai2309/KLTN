# 11: Hủy chuyến, giữ lịch sử và chat sau hoàn tất

**What to build:** Host hủy chuyến đồng hành, người trong nhóm đọc lại lịch/chat nhưng không gửi thêm; chuyến hoàn tất bình thường vẫn chat không giới hạn.

**Blocked by:** TC-05 — Quản lý số chỗ, đóng tuyển và gỡ công khai; TC-07 — Gửi tin văn bản/link và đọc lịch sử nhóm

**Status:** ready-for-agent

**Approval:** Owner approved the unchanged 11-ticket breakdown and blocking edges on 2026-10-28. Implementation has not started.

**Source:** Approved travel-companions plan Q12, Q13; single-owner decision ADR-23; current domain glossary and approved UI/UX scope.

**BE part:** Trạng thái hủy của phần đồng hành, notice và chặn tuyển/gửi tin nguyên tử; giữ lịch sử/membership/deletion guard, ưu tiên hủy hơn hoàn tất mà không giả lập bằng Trip completion.

**FE part:** Hành động hủy trong quản lý, thông báo hậu quả, badge và composer chỉ đọc khi hủy; trạng thái hoàn tất giải thích nhóm vẫn hoạt động.

- [ ] Đóng tuyển/gỡ bài không bị biến thành hủy hoặc giải tán; hủy là terminal cho nhóm hiện tại, không tự khôi phục hoặc chuyển sang Trip khác.
- [ ] Sau hủy không join/gửi tin người dùng, kể cả từ UI/cursor cũ; hiện hành member vẫn đọc lịch sử, Q6 tiếp tục áp dụng lịch đã lưu và hệ thống có thể phản ánh thay đổi.
- [ ] Hoàn tất theo ngày/cờ hiện có không tự khóa chat, đặt TTL 7 ngày hoặc xóa dữ liệu; hủy vẫn giữ chat chỉ đọc.
- [ ] Trip từng có thành viên vẫn bị chặn xóa kể cả sau leave/kick/hủy; cancellation và group notice nhất quán khi retry/race với gửi tin.
- [ ] Có kiểm tra role/lifecycle/transaction và UI host/member; báo rõ loại hoàn tất/hủy, không mở rộng sang xóa vĩnh viễn hoặc chuyển chủ.

**Demo / verification:** Host hủy làm composer của hai thành viên chuyển chỉ đọc; một Trip khác hoàn tất vẫn gửi tin được.

**Completion:** This vertical ticket is complete only when BE, FE and integration evidence are recorded. Completing one role does not complete this ticket. Application implementation has not started.

**BE evidence:** NOT STARTED.

**FE evidence:** NOT STARTED.

**Integration evidence:** NOT RUN.

