# 02: Khám phá và lọc chuyến công khai

**What to build:** Người dùng vào kênh tìm bạn, tìm/lọc chuyến sắp đi theo ngày, phương tiện và còn chỗ, rồi mở trang giới thiệu.

**Blocked by:** TC-01 — Công khai Trip đã lưu và xem giới thiệu

**Status:** ready-for-agent

**Approval:** Owner approved the unchanged 11-ticket breakdown and blocking edges on 2026-10-28. Implementation has not started.

**Source:** Approved travel-companions plan Q3, Q7, Q14; single-owner decision ADR-23; current domain glossary and approved UI/UX scope.

**BE part:** Đọc công khai có phân trang/thứ tự ổn định, lọc cùng một nguồn điều kiện public và số chỗ; cung cấp danh sách bài của host theo actor, không nhận owner override.

**FE part:** Navigation, phạm vi Khám phá/Tôi đăng, thẻ chuyến, tìm kiếm, bộ lọc, tải thêm và trạng thái loading/rỗng/lỗi; giữ bộ lọc khi đi-về chi tiết.

- [ ] Danh sách chỉ hiển thị bài còn công khai, thuộc chuyến sắp đi đủ điều kiện; bài ẩn/hủy và dữ liệu bị ẩn không lọt vào kết quả.
- [ ] Bộ lọc ngày khởi hành, phương tiện và còn chỗ kết hợp nhất quán; thứ tự mặc định theo ngày đi gần nhất, phân trang không lặp/mất bản ghi do thứ tự thiếu ổn định.
- [ ] Guest dùng khám phá; Tôi đăng theo đúng tài khoản, không để tài khoản khác xem dữ liệu host riêng.
- [ ] Nhãn chỗ là số chỗ tìm thêm, không đổi thành tổng số người của đoàn; khi không có kết quả có lối gỡ bộ lọc.
- [ ] Desktop/mobile không tràn ngang; kiểm tra header ở desktop nhỏ, fixture/API đúng bộ lọc và điều hướng giữ ngữ cảnh.

**Demo / verification:** Guest lọc Xe máy và ngày đi, mở một chuyến, quay lại vẫn giữ bộ lọc.

**Completion:** This vertical ticket is complete only when BE, FE and integration evidence are recorded. Completing one role does not complete this ticket. Application implementation has not started.

**BE evidence:** NOT STARTED.

**FE evidence:** NOT STARTED.

**Integration evidence:** NOT RUN.

