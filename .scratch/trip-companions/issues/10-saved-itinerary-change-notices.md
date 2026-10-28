# 10: Đổi lịch đã lưu và thông báo nhất quán trong nhóm

**What to build:** Host sửa/lưu lịch bằng luồng Trip hiện có; nhóm xem lịch mới nhất và nhận tin hệ thống nêu thay đổi ngày/điểm/giờ.

**Blocked by:** TC-07 — Gửi tin văn bản/link và đọc lịch sử nhóm

**Status:** ready-for-agent

**Approval:** Owner approved the unchanged 11-ticket breakdown and blocking edges on 2026-10-28. Implementation has not started.

**Source:** Approved travel-companions plan Q1, Q6, Q16; single-owner decision ADR-23; current domain glossary and approved UI/UX scope.

**BE part:** Tích hợp Trip edit/confirmed-save transaction với group revision/system message, giữ owner/Validator/confirmation và chống event trùng khi replay. Cập nhật public projection an toàn.

**FE part:** Render tin hệ thống khác tin người, lối mở lịch mới nhất và cập nhật summary; người dùng được rời nhóm theo luồng đã có nhưng không phải duyệt thay đổi thay host.

- [ ] Chỉ lịch chính thức đã lưu thành công làm đổi revision và tạo notice; preview, FAILED, hủy chỉnh hoặc proposal AI chưa lưu không phát tin đã đổi.
- [ ] Trip update/revision/notice nhất quán trong một transaction; replay không thêm notice trùng hoặc ghi lịch hai lần.
- [ ] Thành viên đọc lịch mới nhất mà vẫn không có quyền edit; không thêm xác nhận toàn nhóm hoặc ghi đè kiểm tra Validator.
- [ ] Đổi ngày ảnh hưởng điều kiện nhận người theo ngày Việt Nam và public allowlist; không lộ yêu cầu cá nhân/AI history vào notice công khai.
- [ ] Có kiểm tra transaction rollback/replay và UI xem lịch từ notice; completed visits vẫn theo quy tắc Trip hiện tại.

**Demo / verification:** Host lưu đổi giờ một ngày; thành viên thấy đúng một notice và lịch mới. Hủy chỉnh không tạo notice.

**Completion:** This vertical ticket is complete only when BE, FE and integration evidence are recorded. Completing one role does not complete this ticket. Application implementation has not started.

**BE evidence:** NOT STARTED.

**FE evidence:** NOT STARTED.

**Integration evidence:** NOT RUN.

