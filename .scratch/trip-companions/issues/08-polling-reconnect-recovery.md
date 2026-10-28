# 08: Cập nhật tin mới và phục hồi mất kết nối

**What to build:** Người đang mở nhóm nhận tin mới trong vài giây, quay lại tab thấy phần mới và đối soát được tin chưa xác nhận mà không mất/trùng tin.

**Blocked by:** TC-07 — Gửi tin văn bản/link và đọc lịch sử nhóm

**Status:** ready-for-agent

**Approval:** Owner approved the unchanged 11-ticket breakdown and blocking edges on 2026-10-28. Implementation has not started.

**Source:** Approved travel-companions plan Q11, Q15; single-owner decision ADR-23; current domain glossary and approved UI/UX scope.

**BE part:** Delta/cursor reader kèm trạng thái quyền hiện hành, khả năng đối soát request đã ghi và thứ tự commit an toàn; không thêm provider hoặc đổi write contract.

**FE part:** Polling khoảng 3 giây chỉ cho nhóm đang mở và trang đang hiện, refresh khi quay lại, merge/deduplicate, giữ vị trí khi đọc tin cũ và xử lý UNKNOWN/reconnect/late response.

- [ ] Không chạy poll cho mọi nhóm hoặc tiếp tục vòng lặp nhóm khi trang bị ẩn; mở lại lấy phần mới theo cursor.
- [ ] Đang ở cuối thì theo tin mới; đọc tin cũ giữ vị trí và có lối xem tin mới; polling không lấy focus hoặc nháy toàn transcript.
- [ ] Mất phản hồi gửi tin đối soát cùng định danh/payload/key; không đổi key hoặc gửi thêm bản tin chỉ vì reconnect.
- [ ] Rời/bị loại/account lock/logout/account switch thu hồi hoặc xóa dữ liệu client đúng principal; callback cũ không gắn transcript vào tài khoản/nhóm mới.
- [ ] Reconnect/poll đồng thời không làm thiếu, trùng hoặc đảo sai thứ tự tin đã commit; đo độ trễ với điều kiện thử được ghi rõ, không hứa SLA background.
- [ ] Có kiểm tra controller/timer/visibility và hai người dùng qua fixture/browser; không cần WebSocket, push/email hay dịch vụ chat ngoài.

**Demo / verification:** Một người đang đọc tin cũ trong lúc người kia gửi; ngắt/kết nối lại và đổi tab vẫn không mất hoặc trùng tin.

**Completion:** This vertical ticket is complete only when BE, FE and integration evidence are recorded. Completing one role does not complete this ticket. Application implementation has not started.

**BE evidence:** NOT STARTED.

**FE evidence:** NOT STARTED.

**Integration evidence:** NOT RUN.

