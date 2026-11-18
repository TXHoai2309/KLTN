# 01: Explore dùng Google/Stadia qua cấu hình chung

**What to build:** Guest mở Explore và xem đúng các điểm công khai trên Google Maps khi bật cờ hoặc Stadia khi tắt; lựa chọn browser/server đến từ một cấu hình chung.

**Blocked by:** None (can start immediately).

**Status:** IN PROGRESS — chủ dự án yêu cầu triển khai toàn bộ ngày 2026-11-18; code local và automated verification hoàn tất, live acceptance còn mở.

- [ ] Chốt một bộ chọn nhà cung cấp dùng chung, mặc định Stadia; truyền ra browser chỉ lựa chọn và browser key được phép công khai, không đưa server secrets ra client.
- [ ] Prefactor hợp đồng map/SDK lifecycle tối thiểu trước khi thêm Google; giữ adapter Stadia và call site cũ hoạt động trong lúc các ticket sau chuyển dần. Không thực hiện refactor diện rộng ngoài phần cần cho lát cắt.
- [ ] Explore giữ marker, thông tin điểm, viewport, theme, loading/unavailable/retry và nội dung danh sách; dữ liệu điểm công khai và bộ lọc không đổi.
- [ ] Chỉ SDK của provider được chọn được khởi tạo ở Explore; thiếu key/quota/SDK lỗi không khởi tạo provider kia. Unmount/retry không để lại listener hoặc map instance.
- [ ] Có browser key giới hạn domain/API và server key riêng; giữ nguyên Stadia credentials/runtime overrides/domain authentication. Không thêm nút chuyển trong Admin.
- [ ] Test contract Explore cho hai chế độ, trạng thái lỗi và cleanup; kiểm tra config browser/server nhất quán. Tài liệu nêu rõ cách build/restart để đổi cấu hình.
- [ ] Các consumer chưa chuyển và cấu hình routing cũ được ghi lại như trạng thái chuyển tiếp; chưa tuyên bố cờ điều khiển toàn website hoặc bật Google production trước nghiệm thu tích hợp.

**Local evidence (2026-11-18):** Code đã triển khai và review hai trục; provider/map/Save/Read regression tests qua, production webpack build/typecheck qua. Full suite còn các lỗi nền được phân biệt trong verification receipt. Các checkbox yêu cầu browser/provider thật chưa được tự đóng vì thiếu Google keys/Map ID; đây không phải live acceptance.
