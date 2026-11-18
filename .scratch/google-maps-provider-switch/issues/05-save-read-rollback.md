# 05: Lưu, mở lại chuyến đi và giữ dữ liệu khi đổi cờ

**What to build:** Trip owner xác nhận Save, hệ thống kiểm tra tuyến mới bằng provider hiện hành, lưu đúng nguồn và mở lại lịch trình; đổi cờ không ghi đè chuyến đi.

**Blocked by:** 03 — Tìm, xác nhận và lưu nơi xuất phát bằng provider đang chọn; 04 — Đề xuất hành trình với tuyến và bản đồ đúng provider.

**Status:** IN PROGRESS — chủ dự án yêu cầu triển khai toàn bộ ngày 2026-11-18; code local và kiểm thử đang hoàn tất, live acceptance còn mở.

- [ ] Save fetch route evidence mới từ provider hiện hành trước transactional revalidation; projection journey/visit giữ đúng nguồn thay vì gán cứng Stadia.
- [ ] Trip origin, chặng đi/về, nghỉ dọc đường và các Validator hiện có giữ nguyên; không thay điều kiện Save hoặc mở rộng ngoại lệ mục chưa kiểm.
- [ ] UI chỉ báo saved khi DB xác nhận; SUCCESS/FAILED/UNKNOWN và retry cùng payload/key giữ nguyên, không tạo chuyến trùng; provider HTTP không nằm trong transaction ghi DB.
- [ ] Đọc trip lịch sử hoặc trip Google sau khi tắt cờ không tự gọi routing, revalidate, rewrite hoặc đổi nhãn nguồn theo cờ hiện tại.
- [ ] Owner thấy bản đồ theo provider đang chọn với dữ liệu hợp lệ và attribution phù hợp; nếu nội dung lịch sử không được phép hiển thị trên basemap kia, giữ lịch trình đọc được và báo unavailable cho lớp đó, không tự fetch/ghi lại.
- [ ] Google external-place search/Details và Save có xác nhận mục chưa kiểm vẫn tuân thủ hợp đồng hiện có dù cờ chọn Stadia.
- [ ] Ownership, lỗi non-owner và origin privacy giữ nguyên; không cấp quyền đọc trip riêng cho Admin.
- [ ] Test proposal → Save → Read cho cả provider và đổi cờ sau Save; bao gồm dữ liệu cũ, provenance, idempotency/UNKNOWN, provider lỗi và trường hợp external places hiện có.
