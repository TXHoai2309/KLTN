# 07: Gửi tin văn bản/link và đọc lịch sử nhóm

**What to build:** Host và thành viên đang tham gia nhắn văn bản/link trong một phòng chat của chuyến; thành viên mới đọc được lịch sử cũ.

**Blocked by:** TC-03 — Tham gia ngay và mở lịch của nhóm

**Status:** ready-for-agent

**Approval:** Owner approved the unchanged 11-ticket breakdown and blocking edges on 2026-10-28. Implementation has not started.

**Source:** Approved travel-companions plan Q4, Q8, Q9; single-owner decision ADR-23; current domain glossary and approved UI/UX scope.

**BE part:** Tin nhóm có thứ tự/cursor nhất quán, phân trang, kiểm tra membership hiện hành và ghi idempotent; quản lý authorship/system-kind, không tạo cuộc hội thoại AI hoặc DM.

**FE part:** Tab trò chuyện, transcript/composer dùng chung cho trang nhóm, tác giả/thời gian/trạng thái gửi, link an toàn, lịch sử tải thêm và empty/error states.

- [ ] Chỉ host/member hợp lệ đọc/gửi trong đúng nhóm; actor gửi lấy từ session, không từ body. Người ngoài không biết nội dung qua ID hoặc phân trang.
- [ ] Thành viên mới đọc được toàn bộ lịch sử theo Q9; trang giới thiệu đã thông báo quy tắc trước join.
- [ ] Chỉ văn bản/link; escape nội dung, không render HTML tùy ý hoặc thêm ảnh/tệp/voice/call/đã xem/đang nhập.
- [ ] Tin chỉ được gọi đã gửi khi DB xác nhận. Retry cùng payload/key không tạo hai tin; input giữ được khi chưa xác nhận/thất bại.
- [ ] Có thứ tự đọc không bỏ sót tin do hai transaction commit lệch nhau; trang lịch sử dài giữ được vị trí khi tải thêm.
- [ ] Có kiểm tra service/route/DB cho membership, gửi đồng thời và replay, cùng UI gửi/đọc/trạng thái/lịch sử.

**Demo / verification:** Hai thành viên trao đổi tin/link; tài khoản thứ ba join sau và đọc được các tin cũ.

**Completion:** This vertical ticket is complete only when BE, FE and integration evidence are recorded. Completing one role does not complete this ticket. Application implementation has not started.

**BE evidence:** NOT STARTED.

**FE evidence:** NOT STARTED.

**Integration evidence:** NOT RUN.

